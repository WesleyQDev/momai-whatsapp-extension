# MomAI Core

Backend Python para a aplicação MomAI - assistente virtual de código aberto, local-first e focada em privacidade.

## Arquitetura

O MomAI Core utiliza uma arquitetura baseada em **LangGraph** para orquestração de agentes, com as seguintes camadas:

- **API Layer (FastAPI):** Endpoints REST para chat, lembretes, configurações, extensões e modo gaming
- **Agent Layer:** Agentes especializados (Search, System, Interface, Scheduler)
- **AI Layer:** Integrações com LLMs locais (llama.cpp) e cloud (Groq, Gemini)
- **Voice Layer:** Wake Word (Vosk) e TTS streaming (Kokoro)
- **Data Layer:** SQLite + LanceDB para persistência e busca vetorial

## Funcionalidades

- **Chat com Streaming:** Respostas em tempo real com TTS
- **Roteamento Semântico:** Identificação de intenções via LanceDB
- **Tool RAG:** Carregamento dinâmico de ferramentas
- **Wake Word:** Ativação por voz ("Sistema")
- **Lembretes Proativos:** Agendamento persistente
- **Modo Gaming:** Integração com FortScript para pausar IA durante jogos

## Estrutura

```
apps/core/
├── ai/              # Orquestrador e modelos de IA
├── agents/          # Agentes especializados
├── api/             # Endpoints FastAPI
├── database/        # SQLite e LanceDB
├── domain/          # Entidades de domínio
├── services/        # Serviços de voz, memória, lembretes
├── tools/           # Ferramentas do sistema
└── utils/           # Utilitários
```

## Configuração

Crie um arquivo `.env` com as variáveis necessárias:

```bash
# API Keys (opcionais - pode usar modelos locais)
GROQ_API_KEY=your_groq_key
GOOGLE_GENAI_API_KEY=your_google_key
OPENAI_API_KEY=your_openai_key

# Configurações do servidor
HOST=127.0.0.1
PORT=8000
MOMAI_DEBUG=false
```

## Executando

```bash
# Com uv
cd apps/core
uv run python main.py

# ou via pnpm (monorepo)
pnpm run dev
```

## Requisitos

- Python 3.12+
- FFmpeg (para áudio)
- Modelos GGUF (Qwen3)
