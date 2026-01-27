class SystemInfoPlugin:
    """Plugin que fornece informações do sistema via Dashboard Dinâmico."""
    
    def on_startup(self):
        print("[SystemInfo] Monitor iniciou.")

    def register_tools(self):
        return []

def signup():
    return SystemInfoPlugin()