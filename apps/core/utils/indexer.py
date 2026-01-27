import json
from database.vector_db import vector_db
from tools.system_actions import TOOLS
from ai.embeddings import embeddings
from services.extensions.manager import extension_manager

def index_all_system_tools():
    """Indexa as ferramentas nativas e de extensões no LanceDB."""
    print("[Indexer] Indexing tools from registry...")
    
    tools_to_index = []
    
    # Ferramentas nativas do core
    for tool in TOOLS:
        tools_to_index.append({
            "name": tool.name,
            "description": tool.description,
            "metadata": json.dumps({"source": "native"})
        })
        
    # Ferramentas de plugins registrados via hooks
    ext_tools = extension_manager.get_tools()
    for tool in ext_tools:
        tools_to_index.append({
            "name": tool.name,
            "description": tool.description,
            "metadata": json.dumps({"source": "plugin"})
        })
    
    vector_db.add_tools(tools_to_index)
    print(f"[Indexer] {len(tools_to_index)} tools indexed.")

def index_initial_intents():
    """Lê as intenções de todos os manifestos (builtin e extensões) e as indexa."""
    print("[Indexer] Indexing intents from all plugins...")
    
    intents = []
    
    # O manager já carregou todos os manifestos (builtin + extensões)
    active_manifests = extension_manager.get_active_manifests()
    
    for manifest_dict in active_manifests:
        agent_name = manifest_dict["features"]["agent_name"]
        intent_list = manifest_dict.get("intents", [])
        
        for text in intent_list:
            intents.append({
                "text": text,
                "agent": agent_name
            })
    
    if intents:
        vector_db.add_intents(intents)
        print(f"[Indexer] {len(intents)} intents indexed dynamically.")
    else:
        print("[Indexer] No intents found to index.")

if __name__ == "__main__":
    # Carrega plugins antes de indexar se rodado como script
    extension_manager.load_all()
    index_all_system_tools()
    index_initial_intents()
