<div align="center">

![MomAI](apps/docs/logo/logo.png)

[![GitHub](https://img.shields.io/badge/GitHub-WesleyQDev%2FMomAI-181717?style=for-the-badge&logo=github)](https://github.com/WesleyQDev/MomAI)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

</div>

## O que é MomAI?

MomAI é uma aplicação web construída em Electron e Python, focada no usuário doméstico — aquela pessoa que deseja automatizar tarefas do computador ou simplesmente conversar com uma assistente privada, mas com um diferencial importante:

- **Sem comprometer sua privacidade**
- **Você tem controle total das automações**
- **Nenhuma assinatura obrigatória**

Sabe como nos filmes as IAs parecem capazes de fazer qualquer coisa? A ideia da MomAI é permitir que ela evolua conforme suas necessidades. Através de extensões, a assistente pode "aprender" novas habilidades.

### O que diferencia a MomAI?

- **Privacidade em primeiro lugar.** Processamos o máximo possível (voz, embeddings, LLM) localmente no seu hardware.
- **Ação, não apenas sugestão.** Enquanto outros assistentes apenas sugerem o que fazer, a MomAI age. Ela tem acesso controlado (por você) às ferramentas fornecidas pelas extensões.
- **Agentes especializados.** Em vez de uma IA que "acha que sabe tudo", utilizamos agentes focados em tarefas específicas (pesquisar, agendar, manipular arquivos).

### Destaques da Versão Atual

- **Roteamento Semântico (LanceDB):** Identifica intenções do usuário em milissegundos usando busca vetorial local, economizando tokens e tempo.
- **Tool RAG:** Carrega dinamicamente apenas as ferramentas necessárias para cada tarefa, permitindo um ecossistema de centenas de extensões sem perda de performance.
- **Motor de IA Local (Server Mode):** Roda modelos Llama/Qwen via `llama.cpp` em processo dedicado, garantindo performance máxima.
- **Streaming TTS Real-time:** Fala com você enquanto ainda está pensando, com latência mínima.
- **Wake Word Local:** Diga "Sistema" para ativar a assistente sem precisar tocar no teclado.
- **Interface Moderna:** Dashboard com monitoramento de recursos em tempo real e interface gráfica dinâmica.

### Por onde começar?

- **[Entenda a Filosofia](https://wesleyqdev.github.io/momai/pt-BR/por-que-momai)**: Descubra por que criamos uma assistente focada em pessoas, não em dados.
- **[Guia para Desenvolvedores](https://wesleyqdev.github.io/momai/pt-BR/como-funciona)**: Entenda a arquitetura que torna a MomAI invisível e poderosa.

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
