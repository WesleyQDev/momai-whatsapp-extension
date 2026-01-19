from huggingface_hub import hf_hub_download
from langchain_community.chat_models import ChatLlamaCpp
from langchain_core.tools import tool
from langchain_core.runnables import Runnable
import multiprocessing
from datetime import datetime


@tool
def get_current_time() -> str:
    """Retorna a hora atual no formato HH:MM:SS."""
    return datetime.now().strftime("%H:%M")


# Dicionário de tools disponíveis para execução
AVAILABLE_TOOLS = {
    "get_current_time": get_current_time,
}


def load_model(repo_id: str, filename: str) -> Runnable | None:
    try:
        print(f"Baixando/Verificando modelo: {repo_id}")
        model_path = hf_hub_download(repo_id=repo_id, filename=filename)

        llm = ChatLlamaCpp(
            model_path=model_path,
            n_gpu_layers=-1,
            n_ctx=8192,
            n_batch=512,
            temperature=0.7,
            max_tokens=1024,
            n_threads=int(multiprocessing.cpu_count()/2),
            repeat_penalty=1.1,
            top_p=0.9,
            verbose=False,
            streaming=True,
            use_mmap=True,
            use_mlock=True
        )
        
        # Vincular a tool ao modelo
        llm_with_tools = llm.bind_tools([get_current_time])
        
        print("Modelo local carregado com sucesso!")
        return llm_with_tools
    except Exception as e:
        print(f"Erro ao carregar modelo local: {e}")
        return None
