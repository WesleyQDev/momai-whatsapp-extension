<div align="center">

![MomAI](apps/docs/logo/logo.png)

[![GitHub](https://img.shields.io/badge/GitHub-WesleyQDev%2FMomAI-181717?style=for-the-badge&logo=github)](https://github.com/WesleyQDev/MomAI)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

</div>

## O que é MomAI?

MomAI é uma assistente virtual de código aberto, **local-first** e focada em privacidade. Ela combina a inteligência dos LLMs modernos com a capacidade de executar ações reais no seu computador.

### Destaques da Versão Atual

- **Roteamento Semântico (LanceDB):** Identifica intenções do usuário em milissegundos usando busca vetorial local, economizando tokens e tempo.
- **Tool RAG:** Carrega dinamicamente apenas as ferramentas necessárias para cada tarefa, permitindo um ecossistema de centenas de extensões sem perda de performance.
- **Motor de IA Local (Server Mode):** Roda modelos Llama/Qwen via `llama.cpp` em processo dedicado, garantindo performance máxima.
- **Streaming TTS Real-time:** Fala com você enquanto ainda está pensando, com latência mínima.
- **Wake Word Local:** Diga "Sistema" para ativar a assistente sem precisar tocar no teclado.
- **Interface Moderna:** Dashboard com monitoramento de recursos em tempo real e interface gráfica dinâmica.

### Por que usar MomAI?

- **Privacidade** - Seus dados ficam no seu computador.
- **Extensível** - Adicione apenas as funcionalidades (agentes e ferramentas) que você precisa.
- **Código Aberto** - Licença MIT, totalmente gratuito.
- **Multiplataforma** - Windows, Linux e Mac.

## Funcionalidades

- **Agentes Especialistas:** Pesquisa web, controle de sistema, agendador e interface.
- **Lembretes Inteligentes:** Notificações por voz e repetições customizáveis.
- **Comandos de Voz:** Ativação por palavra-chave ("Sistema") e processamento natural.
- **Conexão com Extensões:** Suporte a ferramentas externas via RAG dinâmico.
- **Instalador Automático:** Baixa e configura o motor local (`llama.cpp`) de acordo com seu hardware (Vulkan/CPU).

## Arquitetura

MomAI utiliza um **Grafo de Agentes (LangGraph)**. O fluxo começa em um **Roteador Semântico** que decide se a tarefa pode ser resolvida localmente por um especialista ou se precisa de orquestração estratégica.

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
