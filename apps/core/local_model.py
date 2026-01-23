import subprocess
import os
import time
import requests
import logging
import ctypes
from pathlib import Path
from huggingface_hub import hf_hub_download
from langchain_openai import ChatOpenAI

# Configurar logger
logger = logging.getLogger("uvicorn.error")

# Variável global
server_process = None

# --- Windows Job Object Support ---
# Isso garante que se o Python morrer (crash/kill), o Windows mata o llama-server automaticamente.
if os.name == 'nt':
    try:
        job_handle = ctypes.windll.kernel32.CreateJobObjectW(None, None)

        # JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        class IO_COUNTERS(ctypes.Structure):
            _fields_ = [('ReadOperationCount', ctypes.c_ulonglong),
                        ('WriteOperationCount', ctypes.c_ulonglong),
                        ('OtherOperationCount', ctypes.c_ulonglong),
                        ('ReadTransferCount', ctypes.c_ulonglong),
                        ('WriteTransferCount', ctypes.c_ulonglong),
                        ('OtherTransferCount', ctypes.c_ulonglong)]

        class JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
            _fields_ = [('PerProcessUserTimeLimit', ctypes.c_longlong),
                        ('PerJobUserTimeLimit', ctypes.c_longlong),
                        ('LimitFlags', ctypes.c_ulong),
                        ('MinimumWorkingSetSize', ctypes.c_size_t),
                        ('MaximumWorkingSetSize', ctypes.c_size_t),
                        ('ActiveProcessLimit', ctypes.c_ulong),
                        ('Affinity', ctypes.c_size_t),
                        ('PriorityClass', ctypes.c_ulong),
                        ('SchedulingClass', ctypes.c_ulong)]

        class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
            _fields_ = [('BasicLimitInformation', JOBOBJECT_BASIC_LIMIT_INFORMATION),
                        ('IoInfo', IO_COUNTERS),
                        ('ProcessMemoryLimit', ctypes.c_size_t),
                        ('JobMemoryLimit', ctypes.c_size_t),
                        ('PeakProcessMemoryUsed', ctypes.c_size_t),
                        ('PeakJobMemoryUsed', ctypes.c_size_t)]

        # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
        info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
        info.BasicLimitInformation.LimitFlags = 0x2000

        ret = ctypes.windll.kernel32.SetInformationJobObject(
            job_handle,
            9,  # JobObjectExtendedLimitInformation
            ctypes.byref(info),
            ctypes.sizeof(info)
        )
        if not ret:
            logger.warning(
                "[local_model] Falha ao configurar Job Object (SetInformationJobObject)")

    except Exception as e:
        logger.warning(f"[local_model] Erro ao criar Job Object: {e}")
        job_handle = None
else:
    job_handle = None


def get_paths():
    """Retorna os caminhos dos binários e modelos"""
    base_dir = Path(__file__).parent
    return {
        "exe": base_dir / "bin" / "llama-server.exe",
        "models": base_dir / "models"
    }


def stop_server():
    """Para o servidor se estiver rodando"""
    global server_process
    if server_process:
        logger.info("[local_model] Parando servidor Llama.cpp anterior...")
        try:
            # Tenta terminar graciosamente
            server_process.terminate()
            # Dá 2 segs para ele limpar
            server_process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            logger.warning("[local_model] Forçando kill no servidor...")
            # Mata forçado (se falhou terminate)
            try:
                # No windows, kill() é igual a TerminateProcess
                server_process.kill()
                server_process.wait(timeout=1)
            except:
                pass
        except Exception as e:
            logger.error(f"[local_model] Erro ao parar processo: {e}")

        server_process = None


def load_model(repo_id: str, filename: str) -> ChatOpenAI | None:
    global server_process

    stop_server()

    try:
        paths = get_paths()

        logger.info(
            f"[local_model] Verificando modelo em {paths['models']}...")
        model_path = hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            local_dir=paths['models'],
            local_dir_use_symlinks=False
        )
        # Caminho absoluto para evitar problemas com subprocess
        abs_model_path = str(Path(model_path).resolve())
        abs_exe_path = str(paths['exe'].resolve())

        if not paths['exe'].exists():
            logger.error(
                "[local_model] ERRO: llama-server.exe não encontrado!")
            return None

        cmd = [
            abs_exe_path,
            "-m", abs_model_path,
            "--port", "8080",
            "--ctx-size", "8192",
            "--n-gpu-layers", "99",
            "--parallel", "1",
            "--flash-attn", "on",
            "--cache-prompt",
            "--mlock",
            "--no-mmap"
        ]

        logger.info(f"[local_model] Iniciando servidor...")

        # Criação do processo
        server_process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            encoding="utf-8",
            errors="replace",
            creationflags=0  # Flags padrão
        )

        # Assign to Job Object (Windows Magic)
        if job_handle and server_process:
            try:
                perm = ctypes.windll.kernel32.AssignProcessToJobObject(
                    job_handle,
                    ctypes.c_void_p(server_process._handle)
                )
                if not perm:
                    logger.warning(
                        "[local_model] Falha no AssignProcessToJobObject (Processo pode não morrer com o pai)")
            except Exception as e:
                logger.warning(f"[local_model] Erro ao assignar Job: {e}")

        # Verifica morte na largada (Rápido)
        time.sleep(0.2)
        if server_process.poll() is not None:
            stdout, stderr = server_process.communicate()
            logger.error(
                f"[local_model] ERRO: Servidor morreu! STDERR: {stderr}")
            return None

        # Healthcheck Loop (Otimizado)
        logger.info("[local_model] Aguardando healthcheck...")
        for i in range(120): # 120 * 0.5 = 60s
            if server_process.poll() is not None:
                return None
            try:
                if requests.get("http://localhost:8080/health", timeout=0.5).status_code == 200:
                    logger.info("[local_model] Servidor PRONTO!")
                    return ChatOpenAI(
                        base_url="http://localhost:8080/v1",
                        api_key="sk-none",
                        model="local-model",
                        temperature=0.7,
                        streaming=True
                    )
            except:
                pass

            if i % 10 == 0:
                logger.info("[local_model] ...")
            time.sleep(0.5)

        logger.error("[local_model] Timeout!")
        stop_server()
        return None

    except Exception as e:
        logger.error(f"[local_model] Exception: {e}")
        stop_server()
        return None
