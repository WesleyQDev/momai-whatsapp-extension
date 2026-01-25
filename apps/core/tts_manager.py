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
        self.enabled = True
        self.text_queue = queue.Queue()
        self.audio_queue = queue.Queue()
        self.stop_event = threading.Event()
        self.has_tts = False

        # Session control to avoid race conditions
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

            # Initialize mixer with buffer optimized for latency and quality
            self.pygame.mixer.init(frequency=24000, buffer=2048)
            self.has_tts = True
            logger.info(
                "[TTS] Module initialized (v2 - In-Memory + SessionSafe).")
        except ImportError as e:
            logger.warning(f"[TTS] Missing libraries: {e}")
            self.has_tts = False

    async def _generate_audio_task(self):
        """
        Consumes text from the queue and generates audio in memory.
        """
        while not self.stop_event.is_set():
            try:
                # Timeout allows checking stop_event periodically
                text = self.text_queue.get(timeout=0.5)

                if text is None:
                    break  # Poison pill

                # Capture current session ID before starting heavy work
                with self.state_lock:
                    current_session_id = self.session_id

                logger.debug(
                    f"[TTS Gen] Processing: {text[:30]}... (Session {current_session_id})")

                # Generate audio in memory (BytesIO)
                communicate = self.edge_tts.Communicate(text, voice=self.voice)
                audio_data = b""

                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        audio_data += chunk["data"]

                    # Optional: quick check during long generation
                    if self.stop_event.is_set():
                        break

                # Critical Check: Did the session change while we were generating?
                # If so, discard this audio as it belongs to a canceled conversation.
                with self.state_lock:
                    if self.session_id != current_session_id:
                        logger.debug(
                            f"[TTS Gen] Discarding audio from session {current_session_id} (Current: {self.session_id})")
                        self.text_queue.task_done()
                        continue

                # If we reached here and have data, send to playback
                if audio_data and not self.stop_event.is_set():
                    audio_fp = io.BytesIO(audio_data)
                    audio_fp.seek(0)
                    self.audio_queue.put(audio_fp)

                self.text_queue.task_done()

            except queue.Empty:
                continue
            except Exception as e:
                # Silence connection errors if offline
                if "Cannot connect to host" in str(e) or "getaddrinfo failed" in str(e):
                    logger.debug(f"[TTS Offline] Connection failure: {e}")
                else:
                    logger.error(f"[TTS Gen Error] {e}")

    def _run_async_gen(self):
        """Wrapper to run the async loop in a thread."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self._generate_audio_task())
        finally:
            loop.close()

    def _playback_worker(self):
        """Consumes audio objects from memory and plays them."""
        if not self.has_tts:
            return

        voice_channel = self.pygame.mixer.Channel(0)

        while not self.stop_event.is_set():
            try:
                audio_fp = self.audio_queue.get(timeout=0.5)
                if audio_fp is None:
                    break

                # Check if it should cancel before starting
                if self.stop_event.is_set():
                    audio_fp.close()
                    break

                try:
                    logger.debug(f"[TTS Play] Playing audio chunk.")
                    sound = self.pygame.mixer.Sound(audio_fp)
                    voice_channel.play(sound)

                    # Wait for it to finish or stop signal
                    while voice_channel.get_busy():
                        if self.stop_event.is_set():
                            voice_channel.stop()
                            break
                        time.sleep(0.05)

                except Exception as e:
                    logger.error(f"[TTS Play Error] {e}")
                finally:
                    # Close memory buffer
                    audio_fp.close()
                    self.audio_queue.task_done()

            except queue.Empty:
                continue

    def start(self):
        """Starts the workers if necessary."""
        if not self.has_tts:
            return

        if (self.gen_thread and self.gen_thread.is_alive() and
                self.play_thread and self.play_thread.is_alive()):
            self.stop_event.clear()
            return

        self.stop_event.clear()

        # Start Generation Thread (Async wrapper)
        if not self.gen_thread or not self.gen_thread.is_alive():
            self.gen_thread = threading.Thread(
                target=self._run_async_gen, daemon=True, name="TTS-Gen")
            self.gen_thread.start()

        # Start Playback Thread
        if not self.play_thread or not self.play_thread.is_alive():
            self.play_thread = threading.Thread(
                target=self._playback_worker, daemon=True, name="TTS-Play")
            self.play_thread.start()

    def stop(self):
        """Stops playback and clears the queues."""
        # Increment session to invalidate any ongoing generations
        with self.state_lock:
            self.session_id += 1

        self.stop_event.set()

        if self.has_tts:
            try:
                self.pygame.mixer.Channel(0).stop()
            except:
                pass

        # Clear queues
        with self.text_queue.mutex:
            self.text_queue.queue.clear()
        with self.audio_queue.mutex:
            self.audio_queue.queue.clear()

    def set_voice(self, voice_name: str):
        """Sets the voice for TTS."""
        self.voice = voice_name

    def set_enabled(self, enabled: bool):
        """Enables or disables TTS."""
        self.enabled = enabled
        if not enabled:
            self.stop()

    def speak(self, text: str):
        """
        Enqueues a phrase to be spoken.

        Args:
            text (str): The text to speak.
        """
        if not self.has_tts or not self.enabled or not text.strip():
            return

        # Auto-start if necessary
        self.start()

        self.text_queue.put(text)


# Global instance for compatibility and Singleton pattern
tts = TTSManager()

# --- Compatibility Functions (facade) ---

def start_workers():
    """Starts the TTS workers."""
    tts.start()


def stop_all():
    """Stops all TTS activity."""
    tts.stop()


def speak_sentence(text: str):
    """Speaks a single sentence."""
    tts.speak(text)


async def speak_stream(text_stream):
    """
    Legacy/Compatibility: Receives a text iterator.
    """
    tts.start()
    tts.speak(text_stream)

