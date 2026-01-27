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
    def __init__(self):
        self.user_dir = extension_manager._get_user_extensions_dir()

    def fetch_registry(self) -> List[Dict[str, Any]]:
        """Busca a lista de extensões disponíveis. Tenta localmente primeiro (dev) depois nuvem."""
        # 1. Tenta Registry Local (para testes e desenvolvimento)
        local_registry = Path(__file__).parent.parent.parent.parent / "registry.json"
        if local_registry.exists():
            try:
                print(f"[Installer] Usando registro local: {local_registry}")
                with open(local_registry, "r", encoding="utf-8") as f:
                    data = json.load(f)
                return data.get("extensions", [])
            except Exception as e:
                print(f"[Installer] Erro ao ler registro local: {e}")

        # 2. Fallback para Nuvem (Oficial)
        try:
            print(f"[Installer] Buscando registro na nuvem: {REGISTRY_URL}")
            response = requests.get(REGISTRY_URL, timeout=10)
            response.raise_for_status()
            data = response.json()
            return data.get("extensions", [])
        except Exception as e:
            print(f"[Installer] Erro ao buscar registro na nuvem: {e}")
            return []


    def install(self, download_url: str, extension_id: str) -> bool:
        """Baixa e instala uma extensão a partir de uma URL de ZIP."""
        temp_zip = self.user_dir / f"{extension_id}.zip"
        target_dir = self.user_dir / extension_id

        try:
            print(f"[Installer] Baixando {extension_id}...")
            response = requests.get(download_url, stream=True)
            response.raise_for_status()

            with open(temp_zip, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            # Limpa diretório antigo se existir
            if target_dir.exists():
                shutil.rmtree(target_dir)

            # Extrai
            with zipfile.ZipFile(temp_zip, 'r') as zip_ref:
                zip_ref.extractall(target_dir)

            # Remove o ZIP
            temp_zip.unlink()

            # Tenta instalar dependências Python via uv se houver requirements.txt
            requirements = target_dir / "requirements.txt"
            if requirements.exists():
                self._install_requirements(requirements)

            print(f"[Installer] {extension_id} instalado com sucesso!")
            return True

        except Exception as e:
            print(f"[Installer] Falha na instalação de {extension_id}: {e}")
            if temp_zip.exists(): temp_zip.unlink()
            return False

    def _install_requirements(self, requirements_path: Path):
        """Usa o uv para instalar dependências no ambiente atual."""
        import subprocess
        try:
            print(f"[Installer] Instalando dependências de {requirements_path}...")
            subprocess.run(["uv", "pip", "install", "-r", str(requirements_path)], check=True)
        except Exception as e:
            print(f"[Installer] Erro ao instalar dependências: {e}")

# Singleton
extension_installer = ExtensionInstaller()
