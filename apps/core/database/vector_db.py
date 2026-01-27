import lancedb
import pyarrow as pa
from pathlib import Path
from ai.embeddings import embeddings
import os

DB_PATH = Path(__file__).parent.parent / "momai_vectors.db"

class VectorDB:
    _instance = None
    _db = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(VectorDB, cls).__new__(cls)
        return cls._instance

    def connect(self):
        """Conecta ao banco de dados LanceDB."""
        if self._db is None:
            self._db = lancedb.connect(str(DB_PATH))
        return self._db

    def get_table(self, name: str, schema=None):
        """Retorna uma tabela, criando-a se necessário."""
        db = self.connect()
        if name in db.table_names():
            return db.open_table(name)
        
        if schema is None:
            raise ValueError(f"Tabela {name} não existe e nenhum schema foi fornecido.")
        
        return db.create_table(name, schema=schema)

    async def search_intent(self, query: str, limit: int = 1):
        """Busca a intenção mais próxima no banco."""
        table = self.get_table("intents")
        query_vector = await embeddings.embed_text(query)
        
        results = table.search(query_vector).limit(limit).to_list()
        return results

    async def search_tools(self, query: str, limit: int = 5):
        """Busca as ferramentas mais relevantes no banco."""
        table = self.get_table("tools")
        query_vector = await embeddings.embed_text(query)
        
        results = table.search(query_vector).limit(limit).to_list()
        return results

    async def add_intents(self, intents_data: list[dict]):
        """
        Adiciona exemplos de intenções para o roteador.
        Esperado: [{'text': '...', 'agent': '...'}]
        """
        schema = pa.schema([
            pa.field("vector", pa.list_(pa.float32(), 1024)), # Qwen3-0.6B tem dimensão 1024
            pa.field("text", pa.string()),
            pa.field("agent", pa.string())
        ])
        
        table = self.get_table("intents", schema=schema)
        
        data_with_vectors = []
        for item in intents_data:
            data_with_vectors.append({
                "vector": await embeddings.embed_text(item["text"]),
                "text": item["text"],
                "agent": item["agent"]
            })
        
        table.add(data_with_vectors)

    async def add_tools(self, tools_data: list[dict]):
        """
        Adiciona ferramentas ao banco de vetores.
        Esperado: [{'name': '...', 'description': '...', 'metadata': {}}]
        """
        schema = pa.schema([
            pa.field("vector", pa.list_(pa.float32(), 1024)),
            pa.field("name", pa.string()),
            pa.field("description", pa.string()),
            pa.field("metadata", pa.string()) # JSON stringified
        ])
        
        table = self.get_table("tools", schema=schema)
        
        data_with_vectors = []
        for item in tools_data:
            # Usamos a descrição para gerar o vetor de busca
            data_with_vectors.append({
                "vector": await embeddings.embed_text(item["description"]),
                "name": item["name"],
                "description": item["description"],
                "metadata": item.get("metadata", "{}")
            })
        
        table.add(data_with_vectors)

    def register_agent(self, name: str, system_prompt: str):
        """Registra a definição de um agente no banco."""
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
