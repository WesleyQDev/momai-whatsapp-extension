<div align="center">

![MomAI](docs/logo/logo.png)

[![GitHub](https://img.shields.io/badge/GitHub-WesleyQDev%2FMomAI-181717?style=for-the-badge&logo=github)](https://github.com/WesleyQDev/MomAI)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

</div>



## O que é MomAI?

MomAI é uma assistente virtual de código aberto, criada no Brasil, que você pode personalizar com extensões. Diferente de assistentes comuns, você tem **controle total** sobre quais funcionalidades instalar e onde seus dados são armazenados.

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

**Agentes de Delegação:**

- **InterfaceAgent** - Cria telas, gráficos e relatórios
- **SchedulerAgent** - Gerencia agendamentos e lembretes
- **SearchAgent** - Realiza pesquisas na internet

**Agentes de Eventos:**

- **ReminderAgent** - Avisa por voz quando chega a hora
- **SystemAgent** - Age com eventos do sistema operacional

## Sistema de Extensões

O diferencial do MomAI é permitir que você escolha quais capacidades sua assistente terá:

- **WhatsApp** - Integração via Evolution API
- **Navegação** - Automação de navegadores
- **Planilhas** - Interação com planilhas do workspace
- **Notas** - Integração com Notion, Obsidian, Anytype
- **Smart Home** - Controle de dispositivos IoT

## Documentação

Para instruções de instalação, guia de contribuição, detalhes técnicos e mais informações, acesse a documentação completa:

**[https://wesleyydev.mintlify.app](https://wesleyydev.mintlify.app)**

## Licença

Este projeto está licenciado sob a licença MIT. Veja o arquivo [LICENSE](docs/LICENSE) para mais detalhes.

---

<div align="center">

**Feito com ❤️ no Brasil**

[GitHub](https://github.com/WesleyQDev/MomAI) • [Documentação](https://wesleyydev.mintlify.app) • [Reportar Bug](https://github.com/WesleyQDev/MomAI/issues)

</div>
