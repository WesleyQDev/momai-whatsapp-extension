import queue
import sounddevice as sd
import numpy as np
import threading
import logging
import time
import torch
import re
from faster_whisper import WhisperModel

# Configure logger
logger = logging.getLogger("uvicorn.error")


class WakeWordDetector:
    """
    Wake Word Detector with proper end-of-speech detection.
    
    Instead of continuously transcribing a rolling buffer (which causes premature
    recognition), this detector uses a state machine approach:
    
    1. IDLE: Monitoring for speech activity via energy levels
    2. LISTENING: Speech detected, recording utterance into a growing buffer
    3. PROCESSING: Silence detected after speech, transcribe the complete utterance
    
    This ensures we only transcribe AFTER the user finishes speaking.
    """

    # States
    STATE_IDLE = "idle"
    STATE_LISTENING = "listening"
    STATE_PROCESSING = "processing"

    def __init__(self, keyword="sistema", callback=None, bypass_condition=None):
        """
        Initializes the Wake Word detector using Faster-Whisper.
        """
        self.keyword = keyword.lower()
        self.callback = callback
        self.bypass_condition = bypass_condition
        self.running = False
        self.thread = None
        self.processing_thread = None
        self.lock = threading.Lock()

        # Faster-Whisper Configuration
        try:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            compute_type = "float16" if device == "cuda" else "int8"

            # Upgrade to 'small' for MUCH better English/Technical recognition
            logger.info(f"[WakeWord] Initializing Faster-Whisper (small) on {device} ({compute_type})...")
            self.model = WhisperModel("small", device=device, compute_type=compute_type)
        except Exception as e:
            logger.error(f"[WakeWord] Failed to load 'small' Whisper: {e}. Falling back to 'base' on CPU.")
            self.model = WhisperModel("base", device="cpu", compute_type="int8")

        self.audio_queue = queue.Queue(maxsize=200)
        self.processing_queue = queue.Queue(maxsize=2)
        self.sample_rate = 16000

        # --- Speech detection parameters ---
        # Energy threshold to consider a chunk as "speech"
        self.speech_energy_threshold = 0.008
        # How many consecutive silent chunks before we consider speech ended
        # Each chunk is ~250ms (blocksize=4000 at 16kHz), so 6 chunks ≈ 1.5s
        self.silence_chunks_required = 6
        # Minimum speech duration (in chunks) to avoid processing noise bursts
        # 3 chunks ≈ 0.75s minimum speech
        self.min_speech_chunks = 3
        # Maximum recording duration in seconds (safety limit)
        self.max_recording_duration = 15.0

        # --- State machine ---
        self.state = self.STATE_IDLE
        self.speech_buffer = []  # List of numpy arrays (recorded speech chunks)
        self.speech_chunk_count = 0  # How many chunks had speech energy
        self.silence_counter = 0  # Consecutive silent chunks since last speech
        self.recorded_samples = 0  # Total samples accumulated in current speech

        # --- Cooldown ---
        self.last_trigger_time = 0
        self.trigger_cooldown = 2.0
        self.last_text = ""
        self.last_text_time = 0.0
        self.text_repeat_cooldown = 1.0

    def _audio_callback(self, indata, frames, time_info, status):
        """Callback for sounddevice."""
        if status:
            if "overflow" not in str(status).lower():
                logger.warning(f"[WakeWord] Audio Status: {status}")

        try:
            self.audio_queue.put_nowait(indata.copy().flatten())
        except queue.Full:
            try:
                self.audio_queue.get_nowait()
                self.audio_queue.put_nowait(indata.copy().flatten())
            except Exception:
                pass

    def _get_chunk_energy(self, chunk):
        """Calculate RMS energy of an audio chunk."""
        return np.sqrt(np.mean(chunk ** 2))

    def _listen_loop(self):
        """Main listening loop with state-machine based speech segmentation."""
        logger.info("[WakeWord] Starting Faster-Whisper listening loop...")

        try:
            with sd.InputStream(
                samplerate=self.sample_rate,
                channels=1,
                dtype='float32',
                blocksize=4000,  # 250ms chunks at 16kHz
                callback=self._audio_callback
            ):
                logger.info("[WakeWord] Microphone active. Ready and listening!")

                while self.running:
                    # Get audio chunk (blocking with timeout)
                    try:
                        chunk = self.audio_queue.get(timeout=0.5)
                    except queue.Empty:
                        continue

                    if not self.running:
                        break

                    energy = self._get_chunk_energy(chunk)
                    is_speech = energy > self.speech_energy_threshold

                    if self.state == self.STATE_IDLE:
                        if is_speech:
                            # Speech started! Transition to LISTENING
                            self.state = self.STATE_LISTENING
                            self.speech_buffer = [chunk]
                            self.speech_chunk_count = 1
                            self.silence_counter = 0
                            self.recorded_samples = len(chunk)
                            logger.debug("[WakeWord] Speech detected, recording...")

                    elif self.state == self.STATE_LISTENING:
                        self.speech_buffer.append(chunk)
                        self.recorded_samples += len(chunk)

                        if is_speech:
                            self.speech_chunk_count += 1
                            self.silence_counter = 0
                        else:
                            self.silence_counter += 1

                        # Check if recording is too long (safety limit)
                        recording_duration = self.recorded_samples / self.sample_rate

                        if recording_duration >= self.max_recording_duration:
                            logger.info(f"[WakeWord] Max recording duration reached ({recording_duration:.1f}s). Processing...")
                            self.state = self.STATE_PROCESSING

                        # Check if enough silence has passed to consider speech ended
                        elif self.silence_counter >= self.silence_chunks_required:
                            if self.speech_chunk_count >= self.min_speech_chunks:
                                logger.debug(
                                    f"[WakeWord] Speech ended. "
                                    f"Duration: {recording_duration:.1f}s, "
                                    f"Speech chunks: {self.speech_chunk_count}"
                                )
                                self.state = self.STATE_PROCESSING
                            else:
                                # Too short, probably just noise
                                logger.debug("[WakeWord] Too short, ignoring noise burst.")
                                self._reset_state()

                    if self.state == self.STATE_PROCESSING:
                        self._enqueue_recording()
                        self._reset_state()

        except Exception as e:
            logger.error(f"[WakeWord] Fatal microphone error: {e}")
            self.running = False

    def _reset_state(self):
        """Reset state machine to IDLE."""
        self.state = self.STATE_IDLE
        self.speech_buffer = []
        self.speech_chunk_count = 0
        self.silence_counter = 0
        self.recorded_samples = 0

    def _enqueue_recording(self):
        """Queue recorded audio for transcription without blocking capture."""
        if not self.speech_buffer:
            return

        audio = np.concatenate(self.speech_buffer)
        try:
            self.processing_queue.put_nowait(audio)
        except queue.Full:
            try:
                self.processing_queue.get_nowait()
                self.processing_queue.put_nowait(audio)
            except Exception:
                pass

    def _processing_loop(self):
        """Background transcription loop."""
        while self.running or not self.processing_queue.empty():
            try:
                audio = self.processing_queue.get(timeout=0.5)
            except queue.Empty:
                continue

            self._process_recording(audio)

    def _process_recording(self, audio):
        """Transcribe the recorded speech buffer and process the result."""
        if audio is None or len(audio) == 0:
            return

        duration = len(audio) / self.sample_rate
        logger.info(f"[WakeWord] Transcribing {duration:.1f}s of audio...")

        try:
            segments, info = self.model.transcribe(
                audio,
                language="pt",  # Auto-detect allows English words to be recognized better
                beam_size=7,    # Increased for better precision
                best_of=7,
                initial_prompt="Sistema",  # Critical for keyword accuracy
                vad_filter=True,
                vad_parameters=dict(
                    min_silence_duration_ms=500,
                    speech_pad_ms=300,
                    threshold=0.35,
                ),
                no_speech_threshold=0.5,
                log_prob_threshold=-0.8,
                condition_on_previous_text=False,
            )

            raw_text = "".join([s.text for s in segments]).strip()

            if not raw_text:
                logger.debug("[WakeWord] Empty transcription, ignoring.")
                return

            # Clean text from Whisper artifacts and punctuation
            text = re.sub(r'[^\w\s]', '', raw_text).lower().strip()
            # Remove extra whitespace
            text = re.sub(r'\s+', ' ', text)

            if not text or len(text) < 2:
                return

            # Filter out common Whisper hallucinations
            hallucinations = [
                "obrigado", "legendado", "legenda", "legendas",
                "inscreva", "inscrever", "subscribe", "obrigada",
                "tchau", "até", "continue assistindo",
                "thank you", "thanks for watching",
            ]
            text_lower = text.lower()
            if any(h in text_lower for h in hallucinations):
                logger.debug(f"[WakeWord] Filtered hallucination: '{text}'")
                return

            # Check for repetitive text (another hallucination pattern)
            words = text.split()
            if len(words) >= 4:
                unique_words = set(words)
                if len(unique_words) <= 2:
                    logger.debug(f"[WakeWord] Filtered repetitive text: '{text}'")
                    return

            now = time.time()
            is_repeat = text == self.last_text and (now - self.last_text_time) < self.text_repeat_cooldown
            if not is_repeat:
                logger.info(f"[WakeWord] Transcribed: '{raw_text}'")
                self._handle_transcription(text, raw_text)
                self.last_text = text
                self.last_text_time = now

        except Exception as e:
            logger.error(f"[WakeWord] Transcription error: {e}")

    def _play_feedback(self, sound_type):
        """Plays a high-quality, soft feedback sound."""
        try:
            # Common parameters
            sr = self.sample_rate
            
            tone = None

            if sound_type == "start_listening":
                # Subtle "pop" or "breath" (not currently used)
                duration = 0.15
                t = np.linspace(0, duration, int(sr * duration), False)
                freq = 440
                tone = 0.1 * np.sin(2 * np.pi * freq * t) * np.exp(-15 * t)
            
            elif sound_type == "stop_listening":
                # Subtle low "thump"
                duration = 0.15
                t = np.linspace(0, duration, int(sr * duration), False)
                freq = 300
                tone = 0.1 * np.sin(2 * np.pi * freq * t) * np.exp(-20 * t)
            
            elif sound_type == "success":
                # Modern "Glassy" Chime (C Major 7th ish feel)
                duration = 0.6 
                t = np.linspace(0, duration, int(sr * duration), False)
                
                # Frequencies: C5, E5, G5 (C Major Triad) + C6 (Octave)
                f1, f2, f3, f4 = 523.25, 659.25, 783.99, 1046.50
                
                # Mix with exponential decay
                v1 = np.sin(2 * np.pi * f1 * t) * np.exp(-8 * t)
                v2 = np.sin(2 * np.pi * f2 * t) * np.exp(-10 * t)
                v3 = np.sin(2 * np.pi * f3 * t) * np.exp(-12 * t)
                v4 = np.sin(2 * np.pi * f4 * t) * np.exp(-14 * t) * 0.4
                
                tone = (v1 + 0.8*v2 + 0.8*v3 + 0.5*v4) * 0.08

            if tone is not None:
                fade_in = min(50, len(tone))
                tone[:fade_in] *= np.linspace(0, 1, fade_in)
                audio = tone.astype(np.float32)
                sd.play(audio, samplerate=sr)
        except Exception:
            pass

    def _stop_tts(self):
        """Stop any ongoing TTS playback."""
        try:
            import services.voice.tts as tts
            if tts.is_speaking():
                logger.info("[WakeWord] Interruption! Stopping TTS.")
                tts.stop_all()
        except Exception:
            pass

    def _handle_transcription(self, text, raw_text):
        """Processes a complete transcription to find the keyword or handle bypass."""
        now = time.time()

        # 1. Check for Keyword variations FIRST (Precedence)
        variations = [
            "hey sistema", "ei sistema", "e sistema",
            "o sistema", "no sistema", "oi sistema",
            self.keyword,
        ]

        keyword_pattern = r"\\b(?:" + "|".join(re.escape(v) for v in variations) + r")\\b"
        match = re.search(keyword_pattern, text)
        detected_variation = match.group(0) if match else None

        if detected_variation:
            if (now - self.last_trigger_time) < self.trigger_cooldown:
                return

            self.last_trigger_time = now
            self._stop_tts()
            self._play_feedback("success") # Feedback sound immediately!

            # Clean and extract command
            command_clean = text.replace(detected_variation, "", 1).strip()
            
            # Reconstruct clean command from raw text to preserve punctuation/casing
            words = raw_text.split()
            variation_words = set(detected_variation.split())
            cmd_words = []
            skip_count = 0
            for w in words:
                clean_w = re.sub(r'[^\w\s]', '', w).lower()
                if clean_w in variation_words and skip_count < len(variation_words):
                    skip_count += 1
                    continue
                cmd_words.append(w)
            
            final_cmd = " ".join(cmd_words).strip()
            # If for some reason the word-by-word reconstruction leaves us empty but cleaned was not
            if not final_cmd and command_clean:
                final_cmd = command_clean

            logger.info(f"[WakeWord] Keyword detected. Command: '{final_cmd if final_cmd else '(empty)'}'")
            
            if self.callback:
                # Small sleep to let the chime start before the UI reacts
                time.sleep(0.1)
                self.callback(final_cmd)
            return

        # 2. Bypass Mode (Only if keyword NOT detected)
        if self.bypass_condition and self.bypass_condition():
            if len(text) < 3 or (now - self.last_trigger_time) < self.trigger_cooldown:
                return

            logger.info(f"[WakeWord] Bypass active (conversation). Message: '{raw_text}'")
            self._stop_tts()
            self.last_trigger_time = now
            if self.callback:
                # No success sound in continuous conversation to avoid being intrusive
                self.callback(raw_text)
            return

    def start(self):
        """Start the detector in a background thread."""
        with self.lock:
            if not self.running:
                self.running = True
                self.processing_thread = threading.Thread(target=self._processing_loop, daemon=True)
                self.thread = threading.Thread(target=self._listen_loop, daemon=True)
                self.processing_thread.start()
                self.thread.start()

    def stop(self):
        """Stop the detector."""
        self.running = False
        if self.thread:
            self.thread.join(timeout=2)
        if self.processing_thread:
            self.processing_thread.join(timeout=2)


if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG)
    detector = WakeWordDetector(callback=lambda t: print(f"> {t}"))
    detector.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        detector.stop()
