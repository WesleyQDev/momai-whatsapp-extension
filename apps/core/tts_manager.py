import asyncio
import subprocess
import tempfile
import os
import threading

# Tenta importar edge_tts, se falhar não derruba o app
try:
    import edge_tts
    HAS_TTS = True
except ImportError:
    HAS_TTS = False


async def _produce_audio(text: str, file_path: str):
    """Gera o arquivo MP3."""
    communicate = edge_tts.Communicate(text, voice="pt-BR-FranciscaNeural")
    await communicate.save(file_path)


def _play_audio_windows(file_path: str):
    """Executa o PowerShell em uma thread separada."""
    try:
        ps_command = f'''
Add-Type -AssemblyName presentationCore
$mediaPlayer = New-Object System.Windows.Media.MediaPlayer
$mediaPlayer.Open([Uri]"{file_path}")
$mediaPlayer.Play()
while ($mediaPlayer.NaturalDuration.HasTimeSpan -eq $false) {{ Start-Sleep -Milliseconds 100 }}
$duracao = $mediaPlayer.NaturalDuration.TimeSpan.TotalSeconds
Start-Sleep -Seconds ($duracao + 0.5)
$mediaPlayer.Close()
'''
        subprocess.run(
            ["powershell", "-Command", ps_command],
            creationflags=subprocess.CREATE_NO_WINDOW,
            timeout=60  # Segurança para não ficar infinito
        )
    except Exception as e:
        print(f"[TTS Player Error] {e}")
    finally:
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except:
                pass


async def speak(text: str):
    """Fluxo principal do TTS."""
    if not HAS_TTS:
        print("[TTS] Erro: Biblioteca 'edge-tts' não encontrada no ambiente.")
        return

    if not text.strip():
        return

    print(f"[TTS] Preparando áudio para: {text[:30]}...")

    # Limpeza básica de Markdown e Emojis
    clean_text = text.replace('*', '').replace('#', '').replace('`', '')
    # Remove emojis (caracteres fora do plano básico do Unicode)
    clean_text = "".join(c for c in clean_text if c <= "\uFFFF")

    try:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            temp_file = tmp.name

        # 1. Gera o áudio (Async)
        await _produce_audio(clean_text, temp_file)

        # 2. Reproduz (Em Thread para não bloquear o loop async do FastAPI)
        threading.Thread(target=_play_audio_windows,
                         args=(temp_file,), daemon=True).start()

    except Exception as e:
        print(f"[TTS Error] {e}")


def speak_sync(text: str):
    asyncio.run(speak(text))


if __name__ == "__main__":
    if HAS_TTS:
        speak_sync("Teste de áudio da MomAI")
    else:
        print("Instale: pip install edge-tts")
