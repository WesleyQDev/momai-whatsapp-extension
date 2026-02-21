# Changelog

Acompanhe todas as atualizações e mudanças da MomAI.

## 0.1.1 - 2026-02-21
Essa versão engloba todas as novidades preparadas para a v0.1.0, junto com correções críticas no sistema de atualizações!

## 🚀 Novas Funcionalidades

- **Versionamento dinâmico na interface:** A versão do aplicativo agora é exibida dinamicamente na tela de onboarding inicial e no painel de configurações, sempre refletindo a versão atual da release.
- **Novo endpoint de versão:** Adicionado endpoint dedicado para consulta da versão atual da aplicação.

## ⚙️ Melhorias

- **Sincronização automática de versão no CI/CD:** O pipeline de integração contínua agora atualiza automaticamente a versão no `package.json` ao publicar uma tag de release, eliminando a necessidade de atualização manual a cada novo lançamento.

## 🐛 Correções

- **Falha no pipeline de release:** Corrigido erro no workflow de publicação automática que impedia a criação correta da release v0.1.0.