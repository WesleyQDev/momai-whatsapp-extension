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
        # Caminho: apps/core/services/extensions/installer.py -> ../../../../registry.json
        local_registry = Path(__file__).parent.parent.parent.parent.parent / "registry.json"
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

            # Lógica para lidar com ZIPs do GitHub que vêm com uma pasta raiz (ex: repo-main/)
            contents = list(target_dir.iterdir())
            if len(contents) == 1 and contents[0].is_dir():
                subfolder = contents[0]
                print(f"[Installer] Movendo conteúdo de {subfolder.name} para a raiz...")
                for item in subfolder.iterdir():
                    shutil.move(str(item), str(target_dir))
                subfolder.rmdir()


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
        """Usa o módulo venv padrão para criar um ambiente isolado e instalar dependências."""
        import subprocess
        import sys
        
        target_dir = requirements_path.parent
        venv_dir = target_dir / ".venv"
        
        try:
            # 1. Cria o VENV se não existir
            if not venv_dir.exists():
                print(f"[Installer] Criando ambiente virtual em {venv_dir}...")
                subprocess.run([sys.executable, "-m", "venv", str(venv_dir)], check=True)
            
            # 2. Determina o caminho do executável python dentro do VENV
            if sys.platform == "win32":
                python_exe = venv_dir / "Scripts" / "python.exe"
            else:
                python_exe = venv_dir / "bin" / "python"

            if not python_exe.exists():
                raise FileNotFoundError(f"Python não encontrado no VENV: {python_exe}")

            # 3. Instala as dependências usando o pip do VENV
            print(f"[Installer] Instalando dependências de {requirements_path} no VENV...")
            subprocess.run([str(python_exe), "-m", "pip", "install", "-r", str(requirements_path)], check=True)
            
            print(f"[Installer] Dependências instaladas com sucesso no ambiente isolado.")
            
        except Exception as e:
            print(f"[Installer] Erro ao configurar ambiente isolado para {target_dir.name}: {e}")

# Singleton
extension_installer = ExtensionInstaller()
