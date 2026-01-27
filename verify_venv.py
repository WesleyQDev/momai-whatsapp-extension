import sys
import os
from pathlib import Path

# Adiciona o diretório apps/core ao sys.path para importar os módulos
sys.path.append(str(Path("apps/core").absolute()))

from services.extensions.installer import extension_installer
from services.extensions.manager import extension_manager

ext_path = Path("apps/core/agents/extensions/env_test").absolute()
req_path = ext_path / "requirements.txt"

print(f"--- Iniciando Instalação Isolada para {ext_path.name} ---")
extension_installer._install_requirements(req_path)

from database.models import SessionLocal, Extension
db = SessionLocal()
ext = db.query(Extension).filter(Extension.id == "com.momai.extension.env_test").first()
if not ext:
    ext = Extension(id="com.momai.extension.env_test", is_enabled=True, is_builtin=False)
    db.add(ext)
else:
    ext.is_enabled = True
db.commit()
db.close()

print("\n--- Verificando Carregamento ---")
# Simula o PluginRegistry carregando a extensão
print(f"Base dirs do manager: {extension_manager.base_dirs}")
extension_manager.load_all()

print(f"sys.path final: {sys.path}")
try:
    import cowsay
    print("\n[SUCESSO] cowsay foi importado corretamente do ambiente isolado!")
    print(f"Localização do cowsay: {cowsay.__file__}")
except ImportError:
    print("\n[FALHA] Não foi possível importar o cowsay.")
    print(f"sys.path atual: {sys.path}")
