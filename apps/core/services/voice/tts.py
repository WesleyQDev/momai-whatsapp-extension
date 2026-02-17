import warnings
import pyaudio
import threading
import time
import logging
import queue
import io
import os
from typing import Optional, Any

# Disable Hugging Face network checks globally for faster, offline-first execution
# os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false" # Avoid warnings in multi-threaded env

# Suppress specific warnings for a cleaner output
warnings.filterwarnings(
    "ignore",
    message="dropout option adds dropout after all but last recurrent layer",
    category=UserWarning
)
warnings.filterwarnings(
    "ignore",
    message="`torch.nn.utils.weight_norm` is deprecated",
    category=FutureWarning
)

# Configure logger
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
        self.voice = "pf_dora"  # Local voice (Portuguese Female)
        self.lang_code = 'p'    # Local lang code (Portuguese)
        self.enabled = True
        self.text_queue = queue.Queue()
        self.stop_event = threading.Event()
        self.ready_event = threading.Event()
        self.has_tts = False
        self._error = None

        # Session control to avoid race conditions
        self.session_id = 0
        self.state_lock = threading.Lock()
        self.start_lock = threading.Lock()

        # Threads and instances
        self.worker_thread: Optional[threading.Thread] = None
        self.pyaudio_instance = None
        self.active_stream = None
        self.pipeline = None
        self._is_playing = False
        self.on_speech_start = None
        self.on_speech_stop = None

        # Start initialization in background
        threading.Thread(target=self._initialize_kokoro, daemon=True).start()

    def _initialize_kokoro(self):
        """Initializes the TTS pipeline in a background thread."""
        try:
            logger.info("[TTS] Loading local voice system (Kokoro)...")
            
            # Import here to avoid overhead if not used immediately
            from kokoro import KPipeline
            import torch
            
            self.pyaudio_instance = pyaudio.PyAudio()
            
            # KPipeline handles downloading the model if repo_id is provided.
            # We try to force offline first to respect privacy.
            try:
                # Attempt to load with offline mode enabled
                os.environ["HF_HUB_OFFLINE"] = "1"
                self.pipeline = KPipeline(lang_code=self.lang_code, repo_id='hexgrad/Kokoro-82M')
            except BaseException:
                # If it fails, it might be missing. Enable network temporarily to download.
                logger.info("[TTS] Model 'Kokoro-82M' not found in cache or G2P missing. Enabling network for initial download...")
                os.environ["HF_HUB_OFFLINE"] = "0"
                try:
                    self.pipeline = KPipeline(lang_code=self.lang_code, repo_id='hexgrad/Kokoro-82M')
                except BaseException as e:
                    logger.error(f"❌ [TTS] Critical error initializing Kokoro: {e}")
                    self._error = str(e)
                    self.has_tts = False
            finally:
                # Always return to offline mode after initialization
                os.environ["HF_HUB_OFFLINE"] = "1"
            
            self.has_tts = True
            self.ready_event.set()
            logger.info("✅ [TTS] Voice system ready!")
        except Exception as e:
            self._error = str(e)
            self.has_tts = False
            self.ready_event.set()  # Unblock waiters even on error
            logger.error(f"❌ [TTS] Error loading voice system: {e}")

    def _speech_worker(self):
        """Processes the speech queue, generating and playing audio using Kokoro."""
        stream = None
        self.ready_event.wait()

        if self._error or not self.has_tts:
            logger.warning(
                f"[TTS] Worker stopping: system unavailable ({self._error})")
            return

        try:
            self.active_stream = self.pyaudio_instance.open(
                format=pyaudio.paFloat32,
                channels=1,
                rate=24000,
                output=True,
            )
            stream = self.active_stream

            while not self.stop_event.is_set():
                try:
                    # Get text from queue
                    text = self.text_queue.get(timeout=0.5)
                    if text is None:
                        break

                    # Capture current session ID
                    with self.state_lock:
                        current_session_id = self.session_id

                    logger.debug(
                        f"[TTS Work] Processing: {text[:30]}... (Session {current_session_id})")

                    self._is_playing = True
                    if self.on_speech_start:
                        self.on_speech_start()

                    # Generate and play chunks
                    interrupted = False
                    audio_generator = self.pipeline(text, voice=self.voice)
                    for _, _, audio_chunk in audio_generator:
                        if interrupted:
                            break
                        # Check if session changed OR stop event set
                        with self.state_lock:
                            if self.session_id != current_session_id or self.stop_event.is_set():
                                interrupted = True
                                break

                        if audio_chunk is not None:
                            # Write in small sub-chunks (~50ms each) for responsive interruption
                            raw = audio_chunk.numpy().tobytes()
                            # 1200 samples * 4 bytes/float32 = 4800 bytes = ~50ms at 24kHz
                            sub_chunk_size = 4800
                            offset = 0
                            while offset < len(raw):
                                with self.state_lock:
                                    if self.session_id != current_session_id or self.stop_event.is_set():
                                        interrupted = True
                                        break
                                end = min(offset + sub_chunk_size, len(raw))
                                try:
                                    stream.write(raw[offset:end])
                                except Exception:
                                    interrupted = True
                                    break
                                offset = end
                    
                    self._is_playing = False
                    if self.on_speech_stop:
                        self.on_speech_stop()
                    self.text_queue.task_done()
                except queue.Empty:
                    continue
                except Exception as e:
                    if not self.stop_event.is_set():
                        logger.error(f"[TTS Work Error] {e}")
                        try:
                            self.text_queue.task_done()
                        except ValueError:
                            pass
        finally:
            if stream:
                try:
                    stream.stop_stream()
                    stream.close()
                except:
                    pass
            self.active_stream = None
            logger.debug("[TTS Worker] Thread finished.")

    def wait_until_ready(self, timeout: float = 30.0):
        """Waits for the TTS system to be ready."""
        if self.has_tts:
            return True
        return self.ready_event.wait(timeout)

    def start(self):
        """Starts the worker thread if necessary."""
        with self.start_lock:
            # Check if we should wait for init
            if not self.ready_event.is_set():
                logger.debug("[TTS] Waiting for initialization...")
                if not self.ready_event.wait(timeout=10):
                    logger.error("[TTS] Initialization timeout")
                    return

            # If thread exists and is alive, nothing to do
            if self.worker_thread is not None and self.worker_thread.is_alive():
                return

            # Always clear any previous thread reference to avoid reuse
            if self.worker_thread is not None:
                logger.debug(f"[TTS] Cleaning up dead thread: {self.worker_thread.name}")
                self.worker_thread = None

            # Create and start a fresh thread
            logger.info("[TTS] Starting new worker thread...")
            self.stop_event.clear()
            
            new_thread = threading.Thread(
                target=self._speech_worker, daemon=True, name=f"TTS-Worker-{id(self)}")
            
            try:
                # Start the thread first
                new_thread.start()
                
                # Only assign to self.worker_thread after successful start
                self.worker_thread = new_thread
                logger.debug(f"[TTS] Thread started successfully: {new_thread.name}")
            except RuntimeError as e:
                if "threads can only be started once" in str(e) or "started once" in str(e):
                    logger.warning(f"[TTS] Thread start race condition intercepted: {e}")
                    self.worker_thread = new_thread
                else:
                    logger.error(f"[TTS] Thread start failed: {e}")
                    self.worker_thread = None
                    raise e

    def stop(self):
        """Stops playback and clears the queue."""
        with self.state_lock:
            self.session_id += 1

        # Use the same lock as start() to prevent race conditions
        with self.start_lock:
            # Signal thread to stop
            self.stop_event.set()

            # Abort active stream immediately for instant silence
            if self.active_stream:
                try:
                    self.active_stream.abort_stream()
                except:
                    pass
            
            # Wait for thread to finish
            if self.worker_thread and self.worker_thread.is_alive():
                self.worker_thread.join(timeout=2)
            
            # Clear thread reference
            self.worker_thread = None

        # Clear text queue
        try:
            while not self.text_queue.empty():
                self.text_queue.get_nowait()
                self.text_queue.task_done()
        except Exception:
            pass

        logger.info("[TTS] Playback stopped and queue cleared.")

    def set_voice(self, voice_name: str):
        """
        Sets the voice for Kokoro.
        Automatically updates lang_code based on voice prefix.
        
        Available PT-BR voices: pf_dora, pm_alex, pm_santa
        Available US voices: af_heart, af_alloy, af_bella, am_adam, etc.
        """
        if not voice_name:
            return

        # Legacy voices mapping (Edge TTS -> Kokoro)
        legacy_map = {
            "pt-BR-FranciscaNeural": "pf_dora",
            "pt-BR-AntonioNeural": "pm_alex",
            "en-US-JennyNeural": "af_heart",
            "en-US-GuyNeural": "am_adam"
        }
        
        if voice_name in legacy_map:
            logger.info(f"[TTS] Mapping legacy voice '{voice_name}' to '{legacy_map[voice_name]}'")
            voice_name = legacy_map[voice_name]

        # Basic validation for Kokoro format (prefix_name)
        if "_" not in voice_name:
            logger.warning(f"[TTS] Invalid voice format '{voice_name}'. Falling back to 'pf_dora'")
            voice_name = "pf_dora"

        self.voice = voice_name
        
        # Determine lang_code from voice prefix
        # Examples: pf_dora -> p, af_heart -> a, bf_alice -> b, ef_dora -> e
        prefix = voice_name[:2]
        new_lang = 'p' # Default
        
        lang_map = {
            'af': 'a', 'am': 'a', # American English
            'bf': 'b', 'bm': 'b', # British English
            'pf': 'p', 'pm': 'p', # Portuguese
            'ef': 'e', 'em': 'e', # Spanish
            'jf': 'j', 'jm': 'j', # Japanese
            'zf': 'z', 'zm': 'z', # Chinese
            'ff': 'f',            # French
            'hf': 'h', 'hm': 'h', # Hindi
            'if': 'i', 'im': 'i', # Italian
        }
        
        new_lang = lang_map.get(prefix, self.lang_code)
        
        if new_lang != self.lang_code:
            logger.info(f"[TTS] Language changed to '{new_lang}' based on voice '{voice_name}'")
            self.lang_code = new_lang
            # Re-initialize pipeline for new language
            if self.has_tts:
                try:
                    from kokoro import KPipeline
                    # Try offline first
                    os.environ["HF_HUB_OFFLINE"] = "1"
                    self.pipeline = KPipeline(lang_code=self.lang_code, repo_id='hexgrad/Kokoro-82M')
                except BaseException:
                    try:
                        logger.info(f"[TTS] Language model for '{new_lang}' might be missing. Enabling network for download...")
                        os.environ["HF_HUB_OFFLINE"] = "0"
                        self.pipeline = KPipeline(lang_code=self.lang_code, repo_id='hexgrad/Kokoro-82M')
                    except BaseException as e:
                        logger.error(f"[TTS] Failed to initialize pipeline for lang '{new_lang}': {e}")
                finally:
                    os.environ["HF_HUB_OFFLINE"] = "1"

    def set_enabled(self, enabled: bool):
        """Enables or disables TTS."""
        self.enabled = enabled
        if not enabled:
            self.stop()

    def is_busy(self):
        """Checks if the system is currently speaking or has items in queue."""
        return self._is_playing or not self.text_queue.empty()

    def speak(self, text: str):
        """Enqueues a phrase to be spoken."""
        if not self.enabled or not text.strip():
            return

        # Auto-start worker if needed
        self.start()

        self.text_queue.put(text.strip())

    def wait_for_completion(self):
        """Waits for all items in the speech queue to be processed."""
        self.text_queue.join()

    def shutdown(self):
        """Graceful shutdown of the system."""
        self.stop_event.set()
        self.text_queue.put(None)  # Sentinel
        if self.worker_thread:
            self.worker_thread.join(timeout=2)
            self.worker_thread = None
        if self.pyaudio_instance:
            self.pyaudio_instance.terminate()
        logger.info("[TTS] System shut down.")


# Global instance
tts = TTSManager()

# Compatibility Functions


def start_workers():
    tts.start()


def stop_all():
    tts.stop()


def speak_sentence(text: str):
    tts.speak(text)


def is_speaking():
    """Checks if TTS is currently active."""
    return tts.is_busy()


async def speak_stream(text_stream):
    """Placeholder for stream support if needed."""
    if isinstance(text_stream, str):
        tts.speak(text_stream)
    else:
        # Handle async iterator if possible
        async for chunk in text_stream:
            if chunk:
                tts.speak(chunk)


def wait_speech_complete():
    tts.wait_for_completion()


def shutdown():
    tts.shutdown()

