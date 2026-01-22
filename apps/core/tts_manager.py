import asyncio
import queue
import threading
import io
import time
import logging
from typing import Optional

# Configurar logger
logger = logging.getLogger("momai.tts")


class TTSManager:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(TTSManager, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        if hasattr(self, "initialized"):
            return

        self.initialized = True
        self.voice = "pt-BR-FranciscaNeural"
        self.text_queue = queue.Queue()
        self.audio_queue = queue.Queue()
        self.stop_event = threading.Event()
        self.has_tts = False

        # Controle de Sessão para evitar Race Conditions
        self.session_id = 0
        self.state_lock = threading.Lock()

        # Threads
        self.gen_thread: Optional[threading.Thread] = None
        self.play_thread: Optional[threading.Thread] = None

        try:
            import edge_tts
            import pygame
            self.edge_tts = edge_tts
            self.pygame = pygame

            # Inicializa mixer com buffer otimizado para latência e qualidade
            self.pygame.mixer.init(frequency=24000, buffer=2048)
            self.has_tts = True
            logger.info(
                "[TTS] Módulo inicializado (v2 - In-Memory + SessionSafe).")
        except ImportError as e:
            logger.warning(f"[TTS] Bibliotecas faltando: {e}")
            self.has_tts = False

    async def _generate_audio_task(self):
        """Consome texto da fila e gera áudio em memória."""
        while not self.stop_event.is_set():
            try:
                # Timeout permite checar o stop_event periodicamente
                text = self.text_queue.get(timeout=0.5)

                if text is None:
                    break  # Poison pill

                # Captura o ID da sessão atual antes de começar o trabalho pesado
                with self.state_lock:
                    current_session_id = self.session_id

                logger.debug(
                    f"[TTS Gen] Processando: {text[:30]}... (Sessão {current_session_id})")

                # Gera áudio em memória (BytesIO)
                communicate = self.edge_tts.Communicate(text, voice=self.voice)
                audio_data = b""

                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        audio_data += chunk["data"]

                    # Opcional: Checagem rápida durante geração longa
                    if self.stop_event.is_set():
                        break

                # Checagem Crítica: A sessão mudou enquanto gerávamos?
                # Se sim, descarta este áudio pois pertence a uma conversa cancelada.
                with self.state_lock:
                    if self.session_id != current_session_id:
                        logger.debug(
                            f"[TTS Gen] Descartando áudio da sessão {current_session_id} (Atual: {self.session_id})")
                        self.text_queue.task_done()
                        continue

                # Se chegamos aqui e temos dados, envia para reprodução
                if audio_data and not self.stop_event.is_set():
                    audio_fp = io.BytesIO(audio_data)
                    audio_fp.seek(0)
                    self.audio_queue.put(audio_fp)

                self.text_queue.task_done()

            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"[TTS Gen Error] {e}")

    def _run_async_gen(self):
        """Wrapper para rodar o loop async em uma thread."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self._generate_audio_task())
        finally:
            loop.close()

    def _playback_worker(self):
        """Consome objetos de áudio da memória e toca."""
        if not self.has_tts:
            return

        voice_channel = self.pygame.mixer.Channel(0)

        while not self.stop_event.is_set():
            try:
                audio_fp = self.audio_queue.get(timeout=0.5)
                if audio_fp is None:
                    break

                # Verifica se deve cancelar antes de começar
                if self.stop_event.is_set():
                    audio_fp.close()
                    break

                try:
                    logger.debug(f"[TTS Play] Reproduzindo chunk de áudio.")
                    sound = self.pygame.mixer.Sound(audio_fp)
                    voice_channel.play(sound)

                    # Espera terminar ou sinal de parada
                    while voice_channel.get_busy():
                        if self.stop_event.is_set():
                            voice_channel.stop()
                            break
                        time.sleep(0.05)

                except Exception as e:
                    logger.error(f"[TTS Play Error] {e}")
                finally:
                    # Fecha o buffer de memória
                    audio_fp.close()
                    self.audio_queue.task_done()

            except queue.Empty:
                continue

    def start(self):
        """Inicia os workers se necessário."""
        if not self.has_tts:
            return

        if (self.gen_thread and self.gen_thread.is_alive() and
                self.play_thread and self.play_thread.is_alive()):
            self.stop_event.clear()
            return

        self.stop_event.clear()

        # Inicia Thread de Geração (Async wrapper)
        if not self.gen_thread or not self.gen_thread.is_alive():
            self.gen_thread = threading.Thread(
                target=self._run_async_gen, daemon=True, name="TTS-Gen")
            self.gen_thread.start()

        # Inicia Thread de Playback
        if not self.play_thread or not self.play_thread.is_alive():
            self.play_thread = threading.Thread(
                target=self._playback_worker, daemon=True, name="TTS-Play")
            self.play_thread.start()

    def stop(self):
        """Para a reprodução e limpa as filas."""
        # Incrementa sessão para invalidar quaisquer gerações em andamento
        with self.state_lock:
            self.session_id += 1

        self.stop_event.set()

        if self.has_tts:
            try:
                self.pygame.mixer.Channel(0).stop()
            except:
                pass

        # Limpa filas
        with self.text_queue.mutex:
            self.text_queue.queue.clear()
        with self.audio_queue.mutex:
            self.audio_queue.queue.clear()

    def speak(self, text: str):
        """Enfileira uma frase para ser falada."""
        if not self.has_tts or not text.strip():
            return

        # Auto-start se necessário
        self.start()

        self.text_queue.put(text)

    def set_voice(self, voice_name: str):
        self.voice = voice_name


# Instância Global para manter compatibilidade e padrão Singleton
tts = TTSManager()

# --- Funções de Compatibilidade (facade) ---
# Mantém a mesma interface que AI_core.py já utiliza


def start_workers():
    tts.start()


def stop_all():
    tts.stop()


def speak_sentence(text: str):
    tts.speak(text)


async def speak_stream(text_stream):
    """
    Legado/Compatibilidade: Recebe um iterador de texto.
    """
    tts.start()
    tts.speak(text_stream)
