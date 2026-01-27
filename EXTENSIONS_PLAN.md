# Plano de Extensões MomAI (Estilo Obsidian)

Este documento descreve a arquitetura e o roteiro de implementação para o sistema de extensões da MomAI.

## 1. Visão Geral
O sistema de extensões permite que desenvolvedores adicionem novas capacidades (Ferramentas, Agentes e UI) à MomAI de forma modular. Inspirado no Obsidian e VS Code, o foco é em **Transparência**, **Extensibilidade** e **Simplicidade**.

## 2. Arquitetura

### 2.1 Backend (Python + `pluggy`)
- **Gerenciador:** `ExtensionManager` em `apps/core/services/extensions/manager.py`.
- **Diretórios de Busca:** 
    1. `apps/core/extensions/` (Built-in/Oficiais do Monorepo).
    2. `%APPDATA%/MomAI/extensions/` (Instaladas pelo usuário).
- **Instalador:** `ExtensionInstaller` que consome o `registry.json` via GitHub Raw para evitar rate limits.

### 2.2 Registro de Extensões (`registry.json`)
Hospedado no GitHub Raw: `https://raw.githubusercontent.com/WesleyQDev/MomAI/main/registry.json`.
Contém o mapeamento de IDs para URLs de download (`.zip`) das extensões.

## 3. Fluxo de Instalação
1. **Fetch:** MomAI baixa o `registry.json`.
2. **Download:** O usuário escolhe uma extensão; o backend baixa o `.zip`.
3. **Verify:** Verifica se o autor é oficial (`WesleyQDev`).
4. **Deploy:** Extrai na pasta de dados do usuário e instala dependências via `uv`.

## 3. Manifesto e Permissões (`manifest.json`)
A segurança é baseada em **Transparência Declarativa**. O usuário vê exatamente o que a extensão acessa.

```json
{
  "id": "momai-spotify",
  "name": "Spotify Controller",
  "author": "WesleyQDev",
  "description": "Controle sua música localmente.",
  "permissions": {
    "network": ["api.spotify.com"],
    "files": ["read"],
    "system": ["media_keys"]
  },
  "features": {
    "sidebar": true,
    "agent": "SpotifyAgent"
  }
}
```

## 4. Segurança (Sem Sandbox Restritivo)
- **Assinatura de Autor:** Plugins de `author: "WesleyQDev"` são considerados oficiais.
- **Safe Mode:** Plugins de terceiros exigem aprovação explícita do usuário.
- **Auditoria de Imports:** O `ExtensionManager` verificará se os imports do plugin condizem com as permissões declaradas.

## 5. Roteiro de Implementação

### Fase 1: Fundação (Backend)
- [ ] Criar `apps/core/services/extensions/manager.py`.
- [ ] Implementar carregamento dinâmico de pastas.
- [ ] Integrar hooks do `pluggy`.
- [ ] Atualizar `main.py` para carregar o manager no startup.

### Fase 2: Integração de Inteligência
- [ ] Atualizar `indexer.py` para indexar `intents` de extensões no LanceDB.
- [ ] Ajustar o `dynamic_extension_node` no LangGraph para usar as ferramentas dos plugins.

### Fase 3: Frontend Dinâmico
- [ ] Criar evento WebSocket para sincronizar extensões.
- [ ] Refatorar `LateralBar.tsx` para renderizar itens dinâmicos.
- [ ] Criar tela de "Gerenciamento de Extensões" nas configurações.

### Fase 4: Primeira Extensão Oficial
- [ ] Implementar `extensions/system_info` como prova de conceito.
