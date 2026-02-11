import os
import json
import hashlib
import asyncio
from database.vector_db import vector_db
from tools.system_actions import TOOLS
from ai.embeddings import embeddings
from services.extensions.manager import extension_manager

INDEX_HASH_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "momai_vectors.db", "index_state.json")

def _get_current_state_hash():
    """Gera um hash do estado atual (ferramentas e manifestos)."""
    try:
        active_manifests = extension_manager.get_active_manifests()
        # Filtra apenas o que importa para evitar falso-positivos de tempo
        simplified_manifests = []
        for m in active_manifests:
            simplified_manifests.append({
                "id": m.get("id"),
                "version": m.get("version"),
                "enabled": m.get("enabled"),
                "intents": m.get("intents", [])
            })
        
        tool_names = sorted([t.name for t in TOOLS])
        state = {
            "manifests": simplified_manifests,
            "tools": tool_names
        }
        return hashlib.md5(json.dumps(state, sort_keys=True).encode()).hexdigest()
    except:
        return None

def _is_indexing_needed():
    """Verifica se o hash atual é diferente do último indexado."""
    current_hash = _get_current_state_hash()
    if not current_hash: return True
    
    # Se a pasta momai_vectors.db não existir, precisa indexar
    db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "momai_vectors.db")
    if not os.path.exists(db_path): return True

    if os.path.exists(INDEX_HASH_FILE):
        try:
            with open(INDEX_HASH_FILE, "r") as f:
                saved = json.load(f)
                return saved.get("hash") != current_hash
        except:
            pass
    return True

def _save_index_hash():
    """Salva o hash atual como o último indexado."""
    current_hash = _get_current_state_hash()
    if not current_hash: return
    
    os.makedirs(os.path.dirname(INDEX_HASH_FILE), exist_ok=True)
    try:
        with open(INDEX_HASH_FILE, "w") as f:
            json.dump({"hash": current_hash}, f)
    except:
        pass

async def index_all_system_tools(force=False):
    """Indexa as ferramentas no LanceDB se necessário."""
    if not force and not _is_indexing_needed():
        print("[Indexer] Rules unchanged. Skipping tools indexing.")
        return

    print("[Indexer] Indexing tools from registry...")
    
    # Se for indexar, melhor limpar ou garantir que não haja duplicatas
    # O LanceDB é incremental, então vamos adicionar apenas o que mudou ou recriar
    # Para simplicidade e consistência no boot: recriamos se mudou
    try:
        table = vector_db.connect().drop_table("tools")
    except: pass

    tools_to_index = []
    for tool in TOOLS:
        tools_to_index.append({
            "name": tool.name,
            "description": tool.description,
            "metadata": json.dumps({"source": "native"})
        })
        
    ext_tools = extension_manager.get_tools()
    for tool in ext_tools:
        tools_to_index.append({
            "name": tool.name,
            "description": tool.description,
            "metadata": json.dumps({"source": "plugin"})
        })
    
    if tools_to_index:
        await vector_db.add_tools(tools_to_index)
        print(f"[Indexer] {len(tools_to_index)} tools indexed.")

async def index_initial_intents(force=False):
    """Indexa as intenções se necessário."""
    if not force and not _is_indexing_needed():
        print("[Indexer] Rules unchanged. Skipping intents indexing.")
        return

    print("[Indexer] Indexing intents from all plugins...")
    
    try:
        vector_db.connect().drop_table("intents")
    except: pass

    intents = []
    active_manifests = extension_manager.get_active_manifests()
    
    for m in active_manifests:
        feat = m.get("features", {})
        agent_name = feat.get("agent_name", "unknown")
        intent_list = m.get("intents", [])
        
        for text in intent_list:
            intents.append({
                "text": text,
                "agent": agent_name
            })
    
    if intents:
        await vector_db.add_intents(intents)
        print(f"[Indexer] {len(intents)} intents indexed dynamically.")
        _save_index_hash() # Salva apenas após sucesso total
    else:
        print("[Indexer] No intents found.")
        _save_index_hash()

if __name__ == "__main__":
    # Load plugins before indexing if run as script
    extension_manager.load_all()
    asyncio.run(index_all_system_tools(force=True))
    asyncio.run(index_initial_intents(force=True))
