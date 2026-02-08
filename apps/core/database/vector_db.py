import lancedb
import pyarrow as pa
from pathlib import Path
from ai.embeddings import embeddings
import os
import logging

logger = logging.getLogger("momai.vector_db")

data_dir = os.environ.get("MOMAI_DATA_DIR")
if data_dir:
    Path(data_dir).mkdir(parents=True, exist_ok=True)
    DB_PATH = Path(data_dir) / "momai_vectors.db"
else:
    DB_PATH = Path(__file__).parent.parent / "momai_vectors.db"

class VectorDB:
    _instance = None
    _db = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(VectorDB, cls).__new__(cls)
        return cls._instance

    def connect(self):
        """Connects to the LanceDB database."""
        if self._db is None:
            self._db = lancedb.connect(str(DB_PATH))
        return self._db

    def get_table(self, name: str, schema=None):
        """Returns a table, creating it if necessary."""
        db = self.connect()
        if name in db.table_names():
            return db.open_table(name)
        
        if schema is None:
            raise ValueError(f"Table {name} does not exist and no schema was provided.")
        
        return db.create_table(name, schema=schema)

    async def search_intent(self, query: str, limit: int = 1):
        """Searches for the closest intent in the database."""
        table = self.get_table("intents")
        query_vector = await embeddings.embed_text(query)
        
        results = table.search(query_vector).limit(limit).to_list()
        return results

    async def search_tools(self, query: str, limit: int = 5):
        """Searches for the most relevant tools in the database."""
        table = self.get_table("tools")
        query_vector = await embeddings.embed_text(query)
        
        results = table.search(query_vector).limit(limit).to_list()
        return results

    async def add_intents(self, intents_data: list[dict]):
        """
        Adds examples of intents for the router.
        Expected: [{'text': '...', 'agent': '...'}]
        """
        if not intents_data:
            return

        # Get first embedding to determine dimension
        first_vector = await embeddings.embed_text(intents_data[0]["text"])
        dim = len(first_vector)
        
        if dim < 10:
            logger.error(f"[VectorDB] Suspiciously small dimension for intents: {dim}. Using fallback 1024.")
            dim = 1024

        schema = pa.schema([
            pa.field("vector", pa.list_(pa.float32(), dim)),
            pa.field("text", pa.string()),
            pa.field("agent", pa.string())
        ])
        
        try:
            table = self.get_table("intents", schema=schema)
            if "vector" in table.schema.names:
                v_type = table.schema.field("vector").type
                current_dim = getattr(v_type, "list_size", None)
                if current_dim and current_dim != dim:
                    logger.warning(f"[VectorDB] Dimension mismatch (DB: {current_dim}, New: {dim}). Recreating table 'intents'.")
                    self.connect().drop_table("intents")
                    table = self.get_table("intents", schema=schema)
        except Exception as e:
            logger.error(f"[VectorDB] Error getting/preparing table 'intents': {e}")
            return

        data_with_vectors = []
        for item in intents_data:
            vec = await embeddings.embed_text(item["text"])
            if len(vec) == dim:
                data_with_vectors.append({
                    "vector": vec,
                    "text": item["text"],
                    "agent": item["agent"]
                })
        
        if data_with_vectors:
            try:
                table.add(data_with_vectors)
            except Exception as e:
                logger.error(f"[VectorDB] Error adding intents to LanceDB: {e}")

    async def add_tools(self, tools_data: list[dict]):
        """
        Adds tools to the vector database.
        Expected: [{'name': '...', 'description': '...', 'metadata': {}}]
        """
        if not tools_data:
            return

        # Get first embedding to determine dimension
        # Use a non-empty fallback to ensure we get a valid vector length
        sample_text = tools_data[0].get("description") or tools_data[0].get("name") or "tool"
        first_vector = await embeddings.embed_text(sample_text)
        dim = len(first_vector)
        
        if dim < 10:
            logger.error(f"[VectorDB] Suspiciously small dimension detected: {dim}. Using fallback 1024.")
            dim = 1024

        schema = pa.schema([
            pa.field("vector", pa.list_(pa.float32(), dim)),
            pa.field("name", pa.string()),
            pa.field("description", pa.string()),
            pa.field("metadata", pa.string()) # JSON stringified
        ])
        
        try:
            table = self.get_table("tools", schema=schema)
            if "vector" in table.schema.names:
                v_type = table.schema.field("vector").type
                # LanceDB may return FixedSizeList or simple List
                current_dim = getattr(v_type, "list_size", None)
                if current_dim and current_dim != dim:
                    logger.warning(f"[VectorDB] Dimension mismatch (DB: {current_dim}, New: {dim}). Recreating table 'tools'.")
                    self.connect().drop_table("tools")
                    table = self.get_table("tools", schema=schema)
        except Exception as e:
            logger.error(f"[VectorDB] Error getting/preparing table 'tools': {e}")
            return
        
        data_with_vectors = []
        for item in tools_data:
            name = item.get("name", "unknown")
            desc = item.get("description") or name # Fallback to name if no desc
            
            vec = await embeddings.embed_text(desc)
            if len(vec) == dim:
                data_with_vectors.append({
                    "vector": vec,
                    "name": name,
                    "description": desc,
                    "metadata": item.get("metadata", "{}")
                })
        
        if data_with_vectors:
            try:
                table.add(data_with_vectors)
            except Exception as e:
                logger.error(f"[VectorDB] Error adding tools to LanceDB: {e}")

    def register_agent(self, name: str, system_prompt: str):
        """Registers an agent definition in the database."""
        schema = pa.schema([
            pa.field("name", pa.string()),
            pa.field("system_prompt", pa.string())
        ])
        table = self.get_table("registry_agents", schema=schema)
        
        # Upsert manual (LanceDB simplificado)
        table.delete(f"name = '{name}'")
        table.add([{"name": name, "system_prompt": system_prompt}])

    def get_agent_prompt(self, name: str) -> str | None:
        """Busca o prompt de um agente registrado."""
        try:
            table = self.get_table("registry_agents")
            res = table.search().filter(f"name = '{name}'").to_list()
            return res[0]["system_prompt"] if res else None
        except:
            return None

# Singleton instance
vector_db = VectorDB()
