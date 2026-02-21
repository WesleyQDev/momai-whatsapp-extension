# Changelog

Acompanhe todas as atualizações e mudanças da MomAI.

---

## 0.2.5 - 2026-02-21
Correções de Inicialização (DLL failure)

## ✨ Melhorias
- **Detecção de Dependências do Windows:** Adicionada detecção específica para o erro "Uma rotina de inicialização da biblioteca de vínculo dinâmico (DLL) falhou" (comum no NumPy/Torch). O aplicativo agora identifica automaticamente quando o Microsoft Visual C++ Redistributable está faltando e fornece o link direto para instalação, evitando loops de reinicialização.

## 0.2.4 - 2026-02-21
Melhorias Visuais e de Inicialização

## ✨ Melhorias
- **Feedback de Inicialização:** Adicionada barra de progresso e mensagens de status detalhadas durante o bootstrap do ambiente Python.
- **Interface e Estilo:** Ajustes finos no CSS global e na página inicial para uma experiência mais fluida.

## 0.2.3 - 2026-02-21
Correções de Janela no Linux

## Correções
- **Inicialização no Ubuntu/Linux:** Corrigido problema onde o aplicativo iniciava minimizado em alguns ambientes Linux (como GNOME). Adicionada lógica de foco explícito e um pequeno delay na maximização para garantir que o Gerenciador de Janelas processe a exibição corretamente.

## 0.2.2 - 2026-02-21
Correções e Estabilidade

## Correções de Infraestrutura
- **Colisão de Artefatos no GitHub Release:** Corrigido o erro que causava falha na etapa final do pipeline de publicação por tentar fazer o upload de dois arquivos `builder-debug.yml` idênticos (gerados pelos builds de Windows e Linux) simultaneamente para o mesmo Release. Evitando o erro `HTTP 422: Validation Failed`.

## 0.2.1 - 2026-02-21
Correções e Estabilidade

## Correções de Infraestrutura
- **Rotina de Build CI Linux:** Removida dependência obsoleta (`libgconf-2-4`) do pipeline de integração contínua. Essa mudança garante suporte total a compilações nativas de pacotes linux rodando nas imagens atualizadas e imutáveis `ubuntu-24.04` do GitHub.

## 0.2.0 - 2026-02-21
Suporte Oficial para Linux

## Novas Funcionalidades

- **Compatibilidade com Linux (AppImage & DEB):** Implementação de suporte nativo para distribuições Linux. O sistema agora realiza o bootstrap automatizado do ambiente Python e gerencia dependências de áudio (PortAudio/ALSA) de forma transparente, garantindo paridade de recursos com a versão Windows.
- **Distribuição Inteligente Segura:** O portal oficial implementa agora lógica de detecção de SO via User-Agent para fornecer automaticamente o binário mais adequado (AppImage/deb/exe), otimizando o fluxo de aquisição para novos usuários.

## Melhorias de Infraestrutura

- **Build Engine Unificado:** Reestruturação do pipeline de CI/CD (GitHub Actions) para suportar compilação paralela multi-arch. Isso garante que todas as futuras atualizações sejam entregues simultaneamente para Windows e Linux com integridade verificada.
- **Ambiente de Runtime Isolado:** Refinamento dos scripts de inicialização para garantir permissões de execução corretas em ambientes POSIX, aumentando a robustez do software em diferentes distribuições.

---

## 0.1.3 - 2026-02-21
Correção de compatibilidade com usernames do Windows que contêm espaços.

## 🐛 Correções

- **Falha ao iniciar em contas Windows com espaços no nome:** Corrigido erro crítico onde o bootstrap do ambiente Python falhava em computadores cujo nome de usuário do Windows continha espaços (ex: "Central de Veiculos"). O processo `uv` recebia o caminho partido pelo `cmd.exe`, resultando no erro `'C:\Users\Nome' não é reconhecido como um comando interno`.

---

## 0.1.2 - 2026-02-21
Correções no sistema de aceleração por hardware.

## 🐛 Correções

- **Aceleração automática preferia CPU ao invés da GPU:** Corrigido bug onde o modo "Automático" nas configurações de aceleração ignorava a GPU do usuário e utilizava CPU. A detecção de hardware foi aprimorada para identificar corretamente GPUs NVIDIA (CUDA), AMD/Intel (Vulkan) mesmo quando nenhum engine estava instalado, e o status exibido nas configurações agora reflete o backend real sendo utilizado.

---

## 0.1.1 - 2026-02-21
Essa versão engloba todas as novidades preparadas para a v0.1.0, junto com correções críticas no sistema de atualizações!

## 🚀 Novas Funcionalidades

- **Versionamento dinâmico na interface:** A versão do aplicativo agora é exibida dinamicamente na tela de onboarding inicial e no painel de configurações, sempre refletindo a versão atual da release.
- **Novo endpoint de versão:** Adicionado endpoint dedicado para consulta da versão atual da aplicação.

## ⚙️ Melhorias

- **Sincronização automática de versão no CI/CD:** O pipeline de integração contínua agora atualiza automaticamente a versão no `package.json` ao publicar uma tag de release, eliminando a necessidade de atualização manual a cada novo lançamento.

## 🐛 Correções

- **Falha no pipeline de release:** Corrigido erro no workflow de publicação automática que impedia a criação correta da release v0.1.0.