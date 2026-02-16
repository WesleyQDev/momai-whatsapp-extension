import requests
import zipfile
import shutil
import json
import os
from pathlib import Path
from typing import List, Dict, Any
from .manager import skill_registry

REGISTRY_URL = "https://raw.githubusercontent.com/WesleyQDev/MomAI/main/registry.json"


class ExtensionInstaller:
    """Handles the installation of extensions (skills) from a registry."""

    def __init__(self):
        self.user_dir = skill_registry.base_dirs.get(
            "user",
            Path(__file__).parent.parent.parent / "skills_extensions" / "user",
        )

    def fetch_registry(self) -> List[Dict[str, Any]]:
        """Fetches the list of available extensions."""
        local_registry = (
            Path(__file__).parent.parent.parent.parent.parent / "registry.json"
        )
        if local_registry.exists():
            try:
                print(f"[Installer] Using local registry: {local_registry}")
                with open(local_registry, "r", encoding="utf-8") as f:
                    data = json.load(f)
                return data.get("extensions", [])
            except Exception as e:
                print(f"[Installer] Error reading local registry: {e}")

        try:
            print(f"[Installer] Fetching registry from cloud: {REGISTRY_URL}")
            response = requests.get(REGISTRY_URL, timeout=10)
            response.raise_for_status()
            data = response.json()
            return data.get("extensions", [])
        except Exception as e:
            print(f"[Installer] Error fetching registry: {e}")
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

            if target_dir.exists():
                shutil.rmtree(target_dir)

            with zipfile.ZipFile(temp_zip, "r") as zip_ref:
                zip_ref.extractall(target_dir)

            contents = list(target_dir.iterdir())
            if len(contents) == 1 and contents[0].is_dir():
                subfolder = contents[0]
                print(f"[Installer] Moving content from {subfolder.name}...")
                for item in subfolder.iterdir():
                    shutil.move(str(item), str(target_dir))
                subfolder.rmdir()

            temp_zip.unlink()

            pyproject = target_dir / "pyproject.toml"
            requirements = target_dir / "requirements.txt"

            if pyproject.exists():
                self._install_requirements_uv(pyproject)
            elif requirements.exists():
                self._install_requirements_legacy(requirements)

            skill_registry.load_all()
            print(f"[Installer] {extension_id} installed successfully!")
            return True

        except Exception as e:
            print(f"[Installer] Failed to install {extension_id}: {e}")
            if temp_zip.exists():
                temp_zip.unlink()
            return False

    def _install_requirements_uv(self, pyproject_path: Path):
        import subprocess
        import os

        target_dir = pyproject_path.parent

        try:
            uv_bin = os.environ.get("MOMAI_UV_BIN", "uv")
            print(f"[Installer] Syncing dependencies with {uv_bin}...")
            subprocess.run([uv_bin, "sync"], cwd=str(target_dir), check=True)
            print(f"[Installer] Dependencies synced.")
        except Exception as e:
            print(f"[Installer] UV error: {e}")
            self._install_requirements_legacy(pyproject_path)

    def _install_requirements_legacy(self, requirements_path: Path):
        import subprocess
        import sys

        target_dir = requirements_path.parent
        venv_dir = target_dir / ".venv"

        try:
            if not venv_dir.exists():
                print(f"[Installer] Creating venv at {venv_dir}...")
                subprocess.run(
                    [sys.executable, "-m", "venv", str(venv_dir)], check=True
                )

            if sys.platform == "win32":
                python_exe = venv_dir / "Scripts" / "python.exe"
            else:
                python_exe = venv_dir / "bin" / "python"

            if not python_exe.exists():
                raise FileNotFoundError(f"Python not found: {python_exe}")

            print(f"[Installer] Installing dependencies...")
            if requirements_path.name == "pyproject.toml":
                subprocess.run(
                    [str(python_exe), "-m", "pip", "install", "."],
                    cwd=str(target_dir),
                    check=True,
                )
            else:
                subprocess.run(
                    [
                        str(python_exe),
                        "-m",
                        "pip",
                        "install",
                        "-r",
                        str(requirements_path),
                    ],
                    check=True,
                )

            print(f"[Installer] Dependencies installed.")

        except Exception as e:
            print(f"[Installer] Error: {e}")


extension_installer = ExtensionInstaller()
