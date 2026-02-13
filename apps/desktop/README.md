# MomAI Desktop

Interface desktop Electron para MomAI - assistente virtual de código aberto.

## Stack

- **Electron** + **React 19** + **TypeScript**
- **Tailwind CSS** para estilização
- **Lucide Icons**

## Funcionalidades

- Interface moderna com suporte a temas
- Monitoramento de recursos em tempo real
- Visualização de grafo de interações
- Comunicação via HTTP e WebSocket com o backend
- Chat em tempo real com streaming de respostas e TTS

## Configuração

### Install

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

### Build

```bash
# For windows
pnpm build:win

# For macOS
pnpm build:mac

# For Linux
pnpm build:linux
```

## Requisitos

- Node.js 18+
- pnpm 8+
- Backend MomAI Core rodando em `http://127.0.0.1:8000`
