---
name: scheduler
description: Use esta skill para gerenciar a agenda do usuário, listar lembretes pendentes, criar novos compromissos ou deletar tarefas.
metadata:
  author: MomAI Core
  version: "1.1"
allowed-tools: create_reminder_tool, list_reminders_tool, delete_reminder_tool
---

# scheduler

## Visão Geral
Esta skill permite que a MomAI atue como uma secretária executiva, acessando o banco de dados de lembretes local para organizar o tempo do usuário.

## Instruções

### 1. Consultar dados reais
Sempre que o usuário perguntar sobre seus compromissos, você DEVE usar a ferramenta `list_reminders_tool`. Nunca responda com base em suposições.

### 2. Formatar a resposta
Apresente os lembretes de forma organizada por horário. Se não houver nada para o período solicitado, informe claramente.

### 3. Criar com precisão
Ao agendar algo, certifique-se de extrair corretamente o título, a data e a hora. Se faltar informação, pergunte antes de executar.

## Exemplos
- "O que eu tenho para hoje?" -> Chamar `list_reminders_tool(period='today')`
- "Me lembre de ir ao médico amanhã às 10h" -> Chamar `create_reminder_tool(...)`
