---
name: scheduler
description: Gerencia lembretes e tarefas agendadas do usuário. Use sempre que o usuário quiser criar, ver, listar ou excluir lembretes, alarmes ou notificações programadas.
allowed-tools: create_reminder, list_reminders, delete_reminder
metadata:
  author: MomAI Core
  version: 1.0.0
---

# Scheduler Skill

## Quando usar esta skill

Use esta skill sempre que o usuário mencionar:
- Criar/marcar/programar lembretes
- Listar/ver lembretes pendentes/ativos
- Excluir/remover/cancelar lembretes
- Agendar alarmes ou notificações
- Lembrar de tarefas futuras

## Ferramentas disponíveis

### 1. create_reminder
Cria um novo lembrete ou alarme.

**Quando usar:** Quando o usuário quer lembrar de algo no futuro.

**Exemplos de chamada:**
- "Me lembre de beber água às 17h"
- "Acorda-me às 7:50 para jogar o lixo"
- "Me lembre de verificar a água na geladeira amanhã às 13h"

**Parâmetros:**
- `title`: Título curto do lembrete (ex: "Beber água")
- `scheduled_time`: Data/hora em formato ISO (YYYY-MM-DD HH:MM:SS)
- `content`: Detalhes opcionais (ex: "2 copos")
- `repeat_interval`: Opcional - repetitions "minutes", "hours", "days", "weeks", "months"
- `repeat_value`: Opcional - valor para o intervalo (ex: 30 para "a cada 30 minutos")

---

### 2. list_reminders
Lista todos os lembretes ativos e pendentes.

**Quando usar:** Quando o usuário quer ver quais lembretes estão agendados.

**Exemplos de chamada:**
- "Liste meus lembretes"
- "Quais lembretes eu tenho?"
- "Mostra meus lembretes pendentes"

**Retorna:** Lista simplificada, para ser facíl pro text to speak

---

### 3. delete_reminder
Exclui um lembrete pelo ID.

**Quando usar:** Quando o usuário quer cancelar/remover um lembrete específico.

**Exemplos de chamada:**
- "Delete o lembrete ID 5"
- "Remove o lembrete de jogar lixo"
- "Cancela o lembrete ID 3"

**Parâmetros:**
- `reminder_id`: ID numérico do lembrete (obtido via list_reminders)

---

## Fluxo de uso

1. **Para criar lembrete:** Use `create_reminder` com título e horário
2. **Para ver lembretes:** Use `list_reminders` primeiro
3. **Para excluir:** Use `delete_reminder` com o ID correto

## Formato de data/hora

Use sempre formato ISO: `YYYY-MM-DD HH:MM:SS`

Exemplos:
- Hoje às 17h: `2026-02-15 17:00:00`
- Amanhã às 8h: `2026-02-16 08:00:00`
- Data específica: `2026-02-20 14:30:00`

## Notas

- Sempre confirme a criação do lembrete mostrando o ID gerado
- Mostre o ID ao listar para o usuário poder excluir depois
- Para lembretes recorrentes, use repeat_interval + repeat_value
