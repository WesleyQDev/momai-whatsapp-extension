import os
import queue
import sounddevice as sd
import vosk
import json
import threading
import logging
import time

# Configure logger
logger = logging.getLogger("uvicorn.error")


class WakeWordDetector:
    def __init__(self, keyword="sistema", callback=None, bypass_condition=None):
        """
        Initializes the Wake Word detector using Vosk.

        Args:
            keyword (str): The word to listen for.
            callback (callable): Function to call when detected.
            bypass_condition (callable): Function that returns True if wake word should be bypassed.
        """
        self.keyword = keyword.lower()
        self.callback = callback
        self.bypass_condition = bypass_condition
        self.running = False
        self.thread = None
        self.lock = threading.Lock()

        # Vosk Configuration - Small Model
        model_path = "vosk-model-small-pt-0.3"
        if not os.path.exists(model_path):
            logger.error(
                f"[WakeWord] Vosk model not found at {model_path}")
            raise FileNotFoundError(f"Model not found: {model_path}")

        self.model = vosk.Model(model_path)
        self.q = queue.Queue()
        self.last_trigger_time = 0
        self.trigger_cooldown = 1.5 # Seconds between commands

    def _audio_callback(self, indata, frames, time, status):
        """
        Callback called by sounddevice for each audio chunk.
        """
        if status:
            logger.warning(f"[WakeWord] Audio Status: {status}")
        self.q.put(bytes(indata))

    def _listen_loop(self):
        """
        Main listening loop (100% Local via Vosk).
        """
        logger.info("[WakeWord] Starting 100% Local listening loop (Vosk)...")

        device_info = sd.query_devices(sd.default.device[0], 'input')
        samplerate = int(device_info['default_samplerate'])

        try:
            with sd.RawInputStream(samplerate=samplerate, blocksize=8000, device=sd.default.device[0],
                                   dtype='int16', channels=1, callback=self._audio_callback):

                rec = vosk.KaldiRecognizer(self.model, samplerate)

                logger.info("[WakeWord] Ready and listening!")

                while self.running:
                    try:
                        # Timeout allows checking self.running
                        data = self.q.get(timeout=1.0)

                        if rec.AcceptWaveform(data):
                            # Recognized a full phrase
                            result = json.loads(rec.Result())
                            text = result.get("text", "").lower()

                            if text:
                                self._process_text(text)

                        else:
                            # Partial recognition for low-latency interruption
                            partial = json.loads(rec.PartialResult())
                            p_text = partial.get("partial", "").lower()

                            # Variations of the keyword for quick stop
                            variations = [self.keyword, "o sistema", "no sistema", "sistema", "e sistema", "cistema"]
                            if any(v in p_text for v in variations):
                                # If keyword detected in partial, STOP TTS IMMEDIATELY
                                try:
                                    import services.voice.tts as tts
                                    if tts.is_speaking():
                                        logger.info(f"[WakeWord] Interruption detected via partial: '{p_text}'")
                                        tts.stop_all()
                                except:
                                    pass

                    except queue.Empty:
                        continue
                    except Exception as e:
                        logger.error(f"[WakeWord] Loop error: {e}")

        except Exception as e:
            logger.error(f"[WakeWord] Fatal microphone error: {e}")
            self.running = False

    def _process_text(self, text):
        """
        Processes recognized text to detect wake word or bypass mode.
        """
        now = time.time()
        
        # 0. Check for Bypass Mode (Active UI Context)
        if self.bypass_condition and self.bypass_condition():
            # Noise filter in bypass mode: ignore very short texts and respect cooldown
            if len(text.strip()) < 3 or (now - self.last_trigger_time) < self.trigger_cooldown:
                return

            logger.info(
                f"[WakeWord] Bypass active (Interface Open). Command: '{text}'")
            self.last_trigger_time = now
            # Stop TTS if speaking
            try:
                import services.voice.tts as tts
                tts.stop_all()
            except:
                pass

            if self.callback:
                self.callback(text)
            return

        # Check cooldown for normal mode too
        if (now - self.last_trigger_time) < self.trigger_cooldown:
            return

        # Check wake word or variations
        variations = [self.keyword, "o sistema",
                      "no sistema", "sistema", "e sistema", "cistema"]

        detected_variation = next((v for v in variations if v in text), None)

        if detected_variation:
            self.last_trigger_time = now
            logger.info(f"[WakeWord] Keyword detected: '{text}'")

            # 1. Stop TTS if speaking
            try:
                import services.voice.tts as tts
                tts.stop_all()
            except:
                pass

            # 2. Extract command
            # Remove detected variation and extra spaces
            command = text.replace(detected_variation, "", 1).strip()

            # Extra cleanup
            command = command.lstrip(",").lstrip(".").strip()

            if command:
                # Command included. Ex: "sistema que horas são" -> "que horas são"
                print("\a")  # Quick beep
                logger.info(f"[WakeWord] Command extracted: '{command}'")
                if self.callback:
                    self.callback(command)
            else:
                # Empty command, just woke up.
                # Since Vosk is continuous, we just ignore "wake without command"
                # or could ask to repeat. For now, just beep.
                print("\a")
                pass

    def start(self):
        """Starts the detection thread."""
        with self.lock:
            if not self.running:
                self.running = True
                self.thread = threading.Thread(
                    target=self._listen_loop, daemon=True)
                try:
                    self.thread.start()
                except RuntimeError as e:
                    logger.warning(f"[WakeWord] Thread start error ignored: {e}")

    def stop(self):
        """Stops the detection thread."""
        self.running = False
        if self.thread:
            self.thread.join(timeout=2)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    detector = WakeWordDetector()
    detector.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        detector.stop()
