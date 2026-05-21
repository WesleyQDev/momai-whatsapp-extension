---
id: whatsapp
name: WhatsApp
description: Monitora e responde mensagens do WhatsApp
capabilities:
  intents:
    - enviar mensagem no whatsapp
    - mandar zap
    - whatsapp
    - falar com contato
    - whitelist do whatsapp
    - responda
    - responder
  tools:
    - send_message
    - list_contacts
    - add_contact
    - remove_contact
    - set_contact_name
  triggers:
    - mensagem
    - zap
    - whatsapp
    - responda
---

## Instruções para o LLM

Você pode interagir com o WhatsApp do usuário através das tools abaixo.

### Tools Disponíveis

1. **send_message** — Envia uma mensagem para um contato ou grupo.
   - Parâmetros: `contact` (nome/ID), `message` (texto)
   - Sempre confirme com o usuário antes de enviar mensagens que possam ser ambíguas.
   - Use nomes personalizados se disponíveis.

2. **list_contacts** — Lista os contatos no whitelist.
   - Sem parâmetros.

3. **add_contact** — Adiciona um contato ao whitelist para monitoramento.
   - Parâmetros: `contact` (número ou nome)

4. **remove_contact** — Remove um contato do whitelist.
   - Parâmetros: `contact` (nome ou ID)

5. **set_contact_name** — Define um nome personalizado para um contato (melhora o contexto do LLM).
   - Parâmetros: `contact` (número), `name` (nome personalizado)

### Regras

- Nunca envie mensagens sem confirmar com o usuário em caso de ambiguidade.
- Respeite a whitelist — só mencione monitoramento de contatos que estão nela.
- Se o usuário perguntar "tem mensagens novas?", use list_contacts primeiro.
