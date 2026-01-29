import requests
import zipfile
import shutil
import json
import os
from pathlib import Path
from typing import List, Dict, Any
from .manager import extension_manager

REGISTRY_URL = "https://raw.githubusercontent.com/WesleyQDev/MomAI/main/registry.json"

class ExtensionInstaller:
    """Handles the installation of extensions from a registry."""
    def __init__(self):
        self.user_dir = extension_manager._get_user_extensions_dir()

    def fetch_registry(self) -> List[Dict[str, Any]]:
        """Fetches the list of available extensions. Tries locally first (dev) then cloud."""

        local_registry = Path(__file__).parent.parent.parent.parent.parent / "registry.json"
        if local_registry.exists():
            try:
                print(f"[Installer] Usando registro local: {local_registry}")
                with open(local_registry, "r", encoding="utf-8") as f:
                    data = json.load(f)
                return data.get("extensions", [])
            except Exception as e:
                print(f"[Installer] Erro ao ler registro local: {e}")


        # 2. Fallback to Cloud (Official)
        try:
            print(f"[Installer] Fetching registry from cloud: {REGISTRY_URL}")
            response = requests.get(REGISTRY_URL, timeout=10)
            response.raise_for_status()
            data = response.json()
            return data.get("extensions", [])
        except Exception as e:
            print(f"[Installer] Error fetching registry from cloud: {e}")
            return []


    def install(self, download_url: str, extension_id: str) -> bool:
        """Downloads and installs an extension from a ZIP URL."""
        temp_zip = self.user_dir / f"{extension_id}.zip"
        target_dir = self.user_dir / extension_id

        try:
            print(f"[Installer] Downloading {extension_id}...")
            response = requests.get(download_url, stream=True)
            response.raise_for_status()

            with open(temp_zip, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            # Clear old directory if it exists
            if target_dir.exists():
                shutil.rmtree(target_dir)

            # Extract
            with zipfile.ZipFile(temp_zip, 'r') as zip_ref:
                zip_ref.extractall(target_dir)

            # Logic to handle GitHub ZIPs that come with a root folder (e.g., repo-main/)
            contents = list(target_dir.iterdir())
            if len(contents) == 1 and contents[0].is_dir():
                subfolder = contents[0]
                print(f"[Installer] Moving content from {subfolder.name} to root...")
                for item in subfolder.iterdir():
                    shutil.move(str(item), str(target_dir))
                subfolder.rmdir()


            # Remove the ZIP
            temp_zip.unlink()

            # Try to install Python dependencies via uv if pyproject.toml exists
            pyproject = target_dir / "pyproject.toml"
            requirements = target_dir / "requirements.txt"
            
            if pyproject.exists():
                self._install_requirements_uv(pyproject)
            elif requirements.exists():
                self._install_requirements_legacy(requirements)

            print(f"[Installer] {extension_id} instalado com sucesso!")
            return True

        except Exception as e:
            print(f"[Installer] Falha na instalação de {extension_id}: {e}")
            if temp_zip.exists(): temp_zip.unlink()
            return False

    def _install_requirements_uv(self, pyproject_path: Path):
        """Usa o uv para gerenciar dependências de forma ultrarápida."""
        import subprocess
        import sys
        import os
        
        target_dir = pyproject_path.parent
        
        try:
            # Priorize the uv binary passed by Electron
            uv_bin = os.environ.get("MOMAI_UV_BIN", "uv")
            
            print(f"[Installer] Sincronizando dependências com {uv_bin} em {target_dir}...")
            
            # Synchronize the extension environment
            subprocess.run([uv_bin, "sync"], cwd=str(target_dir), check=True)
            print(f"[Installer] Dependencies synchronized successfully via uv.")
            
        except Exception as e:
            print(f"[Installer] Error using uv for {target_dir.name}: {e}")
            # Fallback to the legacy mode if uv fails or is not present
            print("[Installer] Tentando fallback para venv tradicional...")
            self._install_requirements_legacy(pyproject_path)

    def _install_requirements_legacy(self, requirements_path: Path):
        """Uses the default venv module to create an isolated environment and install dependencies."""
        import subprocess
        import sys
        
        target_dir = requirements_path.parent
        venv_dir = target_dir / ".venv"
        
        try:
            # 1. Create the VENV if it doesn't exist
            if not venv_dir.exists():
                print(f"[Installer] Creating virtual environment at {venv_dir}...")
                subprocess.run([sys.executable, "-m", "venv", str(venv_dir)], check=True)
            
            # 2. Determine the path to the python executable inside the VENV
            if sys.platform == "win32":
                python_exe = venv_dir / "Scripts" / "python.exe"
            else:
                python_exe = venv_dir / "bin" / "python"

            if not python_exe.exists():
                raise FileNotFoundError(f"Python not found in VENV: {python_exe}")

            # 3. Install dependencies using the VENV pip
            print(f"[Installer] Installing dependencies from {requirements_path} in VENV...")
            if requirements_path.name == "pyproject.toml":
                 subprocess.run([str(python_exe), "-m", "pip", "install", "."], cwd=str(target_dir), check=True)
            else:
                 subprocess.run([str(python_exe), "-m", "pip", "install", "-r", str(requirements_path)], check=True)
            
            print(f"[Installer] Dependencies installed successfully in isolated environment.")
            
        except Exception as e:
            print(f"[Installer] Error configuring isolated environment for {target_dir.name}: {e}")

# Singleton
extension_installer = ExtensionInstaller()
