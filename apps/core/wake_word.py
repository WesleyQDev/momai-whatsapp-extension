import os
import queue
import sounddevice as sd
import vosk
import json
import threading
import logging
import time

# Configurar logger
logger = logging.getLogger("uvicorn.error")


class WakeWordDetector:
    def __init__(self, keyword="sistema", callback=None):
        self.keyword = keyword.lower()
        self.callback = callback
        self.running = False
        self.thread = None

        # Configuração do Vosk - Modelo Small
        model_path = "vosk-model-small-pt-0.3"
        if not os.path.exists(model_path):
            logger.error(
                f"[WakeWord] Modelo Vosk não encontrado em {model_path}")
            raise FileNotFoundError(f"Model not found: {model_path}")

        self.model = vosk.Model(model_path)
        self.q = queue.Queue()

    def _audio_callback(self, indata, frames, time, status):
        """Callback chamado pelo sounddevice para cada chunk de áudio."""
        if status:
            logger.warning(f"[WakeWord] Audio Status: {status}")
        self.q.put(bytes(indata))

    def _listen_loop(self):
        logger.info("[WakeWord] Iniciando loop de escuta 100% Local (Vosk)...")

        device_info = sd.query_devices(sd.default.device[0], 'input')
        samplerate = int(device_info['default_samplerate'])

        try:
            with sd.RawInputStream(samplerate=samplerate, blocksize=8000, device=sd.default.device[0],
                                   dtype='int16', channels=1, callback=self._audio_callback):

                rec = vosk.KaldiRecognizer(self.model, samplerate)

                logger.info("[WakeWord] Pronto e ouvindo!")

                while self.running:
                    try:
                        # Timeout para permitir checar self.running
                        data = self.q.get(timeout=1.0)

                        if rec.AcceptWaveform(data):
                            # Reconheceu uma frase completa
                            result = json.loads(rec.Result())
                            text = result.get("text", "").lower()

                            if text:
                                self._process_text(text)

                        else:
                            # Reconhecimento parcial
                            # Opcional: verificar wake word aqui para ser mais rápido
                            partial = json.loads(rec.PartialResult())
                            p_text = partial.get("partial", "").lower()

                            # Se a keyword for detectada no parcial e tiver contexto de comando...
                            variations = [self.keyword, "o sistema",
                                          "no sistema", "sistema", "e sistema"]
                            if any(v in p_text for v in variations):
                                # Se detectamos a keyword no parcial, não interrompemos, deixamos completar a frase
                                # para pegar o comando inteiro.
                                pass

                    except queue.Empty:
                        continue
                    except Exception as e:
                        logger.error(f"[WakeWord] Erro no loop: {e}")

        except Exception as e:
            logger.error(f"[WakeWord] Erro fatal no microfone: {e}")
            self.running = False

    def _process_text(self, text):
        # Verifica wake word ou variações
        variations = [self.keyword, "o sistema",
                      "no sistema", "sistema", "e sistema", "cistema"]

        detected_variation = next((v for v in variations if v in text), None)

        if detected_variation:
            logger.info(f"[WakeWord] Palavra-chave detectada: '{text}'")

            # 1. Para o TTS se estiver falando
            try:
                import tts_manager
                tts_manager.stop_all()
            except:
                pass

            # 2. Beep de confirmação apenas se houver comando junto
            # Se a pessoa só falou "sistema", a gente bipa. Se falou "sistema ligar luz", a gente executa direto.
            # print("\a")

            # 3. Extrai comando
            # Remove a variação detectada e espaços extras
            command = text.replace(detected_variation, "", 1).strip()

            # Limpeza extra
            command = command.lstrip(",").lstrip(".").strip()

            if command:
                # Comando veio junto. Ex: "sistema que horas são" -> "que horas são"
                print("\a")  # Beep rápido
                logger.info(f"[WakeWord] Comando extraído: '{command}'")
                if self.callback:
                    self.callback(command)
            else:
                # Comando vazio, apenas acordou.
                # Como o Vosk é contínuo, simplesmente ignoramos "acordar sem comando"
                # ou podemos pedir para repetir. Por enquanto, só confirma com beep.
                print("\a")
                pass

    def start(self):
        if not self.running:
            self.running = True
            self.thread = threading.Thread(
                target=self._listen_loop, daemon=True)
            self.thread.start()

    def stop(self):
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
