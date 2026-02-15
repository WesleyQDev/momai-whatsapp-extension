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
    try:
        active_manifests = extension_manager.get_active_manifests()
        state = {
            "manifests": active_manifests,
            "tools": [t.name for t in TOOLS]
        }
        return hashlib.md5(json.dumps(state, sort_keys=True).encode()).hexdigest()
    except:
        return None

def _is_indexing_needed():
    if not os.path.exists(INDEX_HASH_FILE): return True
    db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "momai_vectors.db")
    if not os.path.exists(db_path): return True
    return False # Forcing manual check in functions for now

async def index_all_system_tools(force=False):
    print("[Indexer] Indexing tools...")
    try:
        vector_db.connect().drop_table("tools")
    except: pass
    
    tools_to_index = []
    for tool in TOOLS:
        tools_to_index.append({
            "name": tool.name,
            "description": tool.description,
            "metadata": json.dumps({"source": "native"})
        })
    
    # Ensure plugins are loaded
    if not extension_manager.plugins:
        extension_manager.load_all()

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

async def index_all_skills(force=False):
    print("[Indexer] Indexing skills from Markdown...")
    try:
        vector_db.connect().drop_table("skills")
    except: pass

    if not extension_manager.plugins:
        extension_manager.load_all()

    skills_to_index = []
    from domain.skill import Skill
    
    print(f"[Indexer] Scanning {len(extension_manager.plugins)} plugins for SKILL.md")
    
    for p_id, p_info in extension_manager.plugins.items():
        skill_path = None
        for filename in ["SKILL.md", "skill.md"]:
            path = os.path.join(p_info["path"], filename)
            if os.path.exists(path):
                skill_path = path
                break
        
        if skill_path:
            try:
                skill = Skill.from_file(p_id, skill_path)
                skills_to_index.append({
                    "id": skill.id,
                    "name": skill.name,
                    "description": skill.description
                })
                print(f"[Indexer] Found skill: {skill.name}")
            except Exception as e:
                print(f"[Indexer] Error parsing {skill_path}: {e}")
        else:
            print(f"[Indexer] No SKILL.md found in {p_info['path']}")
    
    if skills_to_index:
        await vector_db.add_skills(skills_to_index)
        print(f"[Indexer] {len(skills_to_index)} skills indexed functionally.")
    else:
        print("[Indexer] WARNING: No skills found to index!")

async def index_initial_intents(force=False):
    print("[Indexer] Indexing intents...")
    try:
        vector_db.connect().drop_table("intents")
    except: pass
    
    intents = []
    for m in extension_manager.get_active_manifests():
        feat = m.get("features", {})
        agent_name = feat.get("agent_name", "unknown")
        for text in m.get("intents", []):
            intents.append({"text": text, "agent": agent_name})
    
    if intents:
        await vector_db.add_intents(intents)
        print(f"[Indexer] {len(intents)} intents indexed.")
    
    # Save hash only after all steps
    current_hash = _get_current_state_hash()
    if current_hash:
        with open(INDEX_HASH_FILE, "w") as f:
            json.dump({"hash": current_hash}, f)

if __name__ == "__main__":
    extension_manager.load_all()
    asyncio.run(index_all_system_tools(force=True))
    asyncio.run(index_all_skills(force=True))
    asyncio.run(index_initial_intents(force=True))
