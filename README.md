<div align="center">

![MomAI](apps/docs/logo/logo.png)

[![GitHub](https://img.shields.io/badge/GitHub-WesleyQDev%2FMomAI-181717?style=for-the-badge&logo=github)](https://github.com/WesleyQDev/MomAI)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

</div>

## O que é MomAI?

MomAI é uma assistente virtual de código aberto, **local-first** e focada em privacidade. Ela combina a inteligência dos LLMs modernos com a capacidade de executar ações reais no seu computador.

### Destaques da Versão Atual

- **Motor de IA Local (Server Mode):** Roda modelos Llama/Qwen via `llama.cpp` em processo dedicado (C++), garantindo performance máxima sem travar a interface.
- **Streaming TTS Real-time:** Fala com você enquanto ainda está pensando, com latência mínima e quebra inteligente de frases.
- **Híbrida:** Alterne instantaneamente entre modelos locais (Offline) e nuvem (Groq/Gemini) com um clique.
- **Interface Moderna:** Desktop App feito em Electron + React

### Por que usar MomAI?

- **Privacidade** - Seus dados ficam no seu computador
- **Extensível** - Adicione apenas as funcionalidades que você precisa
- **Código Aberto** - Licença MIT, totalmente gratuito
- **Multiplataforma** - Windows, Linux e Mac

## Funcionalidades

- Armazenamento local de informações
- Execução automática de tarefas baseada em eventos
- Lembretes com notificação por voz
- Comandos de voz
- Conexão com aplicativos e serviços através de extensões

## Arquitetura

MomAI é construída como uma equipe de agentes especializados. O **MomAgent** atua como gerente principal, delegando tarefas para agentes especializados conforme a necessidade.

O backend Python atua como orquestrador, gerenciando o ciclo de vida do servidor de inferência local e das ferramentas.

## Documentação

Para instruções de instalação, guia de contribuição, detalhes técnicos e mais informações, acesse a documentação completa:

**[https://wesleyqdev.github.io/momai](https://wesleyqdev.github.io/momai)**

## Licença

Este projeto está licenciado sob a licença MIT. Veja o arquivo [LICENSE](apps/docs/LICENSE) para mais detalhes.

---

<div align="center">

**Feito com ❤️ WesleyQDev**

[GitHub](https://github.com/WesleyQDev/MomAI) • [Documentação](https://wesleyqdev.github.io/momai) • [Reportar Bug](https://github.com/WesleyQDev/MomAI/issues)

</div>