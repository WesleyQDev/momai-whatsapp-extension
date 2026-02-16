import os
import json
import asyncio
from database.vector_db import vector_db
from tools.system_actions import TOOLS
from ai.embeddings import embeddings
from services.extensions.manager import skill_registry


async def index_all_system_tools():
    print("[Indexer] Indexing tools...")
    try:
        vector_db.connect().drop_table("tools")
    except:
        pass

    tools_to_index = []
    for tool in TOOLS:
        tools_to_index.append(
            {
                "name": tool.name,
                "description": tool.description,
            }
        )

    skill_tools = skill_registry.get_tools()
    for tool in skill_tools:
        tools_to_index.append(
            {
                "name": tool.name,
                "description": tool.description,
            }
        )

    if tools_to_index:
        await vector_db.add_tools(tools_to_index)
        print(f"[Indexer] {len(tools_to_index)} tools indexed.")


async def index_all_skills():
    print("[Indexer] Indexing skills...")
    try:
        vector_db.connect().drop_table("skills")
    except:
        pass

    skills_to_index = []
    from domain.skill import Skill

    for skill_id, s_info in skill_registry.skills.items():
        skill_path = s_info.get("skill_path")
        if not skill_path:
            continue

        try:
            skill = Skill.from_file(skill_id, skill_path)
            skills_to_index.append(
                {
                    "id": skill.id,
                    "name": skill.name,
                    "description": skill.description,
                }
            )
            print(f"[Indexer] Found skill: {skill.name}")
        except Exception as e:
            print(f"[Indexer] Error parsing {skill_path}: {e}")

    if skills_to_index:
        await vector_db.add_skills(skills_to_index)
        print(f"[Indexer] {len(skills_to_index)} skills indexed.")
    else:
        print("[Indexer] WARNING: No skills found!")


if __name__ == "__main__":
    skill_registry.load_all()
    asyncio.run(index_all_system_tools())
    asyncio.run(index_all_skills())
