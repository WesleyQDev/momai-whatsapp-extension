# 🧠 Plano de Reestruturação: MomAI Hybrid Brain (LanceDB Edition)

## 1. Visão Geral
Revolucionar a performance do MomAI através de um sistema de **Roteamento Semântico Híbrido** e **Recuperação Dinâmica de Ferramentas (Tool RAG)**. Utilizaremos o **LanceDB** para gerenciar milhares de capacidades de extensões com latência mínima.

## 2. Componentes Principais

### A. Motor de Embeddings (Local)
*   **Modelo:** `Qwen/Qwen3-Embedding-0.6B-GGUF`
*   **Função:** Converter entradas do usuário, descrições de ferramentas e documentos em vetores de alta dimensionalidade.
*   **Execução:** Via `llama-cpp-python` ou servidor local já existente.

### B. Vetor Database: LanceDB
*   **Por que LanceDB:** Local-first, permite busca vetorial e SQL simultaneamente, ideal para filtrar ferramentas por "categoria" ou "extensão ativa".
*   **Tabelas:**
    1.  `intent_examples`: Exemplos de frases para roteamento rápido para agentes (System, Search, etc).
    2.  `tool_library`: Descrições detalhadas de todas as funções das extensões.
    3.  `capability_summaries`: Resumos de alto nível do que cada extensão faz (para responder "O que você consegue fazer?").

### C. Roteador Semântico Híbrido (Hybrid Router)
*   **Camada 1 (Vetor):** Compara a entrada com `intent_examples`. Se a similaridade for alta (> 0.85), roteia imediatamente.
*   **Camada 2 (LLM Fallback):** Se a intenção for ambígua, o orquestrador LLM decide o caminho.

## 3. Solução de Escalabilidade: Tool RAG
Para suportar milhares de ferramentas sem estourar o contexto do LLM:
1.  O usuário faz um pedido.
2.  O sistema busca no **LanceDB** as Top-K ferramentas (ex: 5 a 10) cujas descrições melhor combinam com o pedido.
3.  Apenas os schemas (JSON) dessas ferramentas são injetados no prompt do Agente.
4.  **Auto-Discovery:** Quando perguntado "O que você pode fazer?", uma ferramenta de busca consulta o LanceDB e gera um resumo dinâmico das capacidades instaladas.

## 4. Pipeline de Resposta e UX
*   **Streaming de Status:** O backend enviará eventos via WebSocket durante cada fase:
    *   `{"status": "identifying_intent"}`
    *   `{"status": "retrieving_tools", "meta": ["volume_control", "media_player"]}`
    *   `{"status": "executing_action"}`
*   **Paralelismo:** Busca de ferramentas e processamento de intenção ocorrem em paralelo.

## 5. Cronograma de Implementação

### Fase 1: Infraestrutura de Dados
*   Configurar `lancedb` no diretório `apps/core/database/`.
*   Implementar o wrapper para o modelo `Qwen3-Embedding`.

### Fase 2: Indexação e Roteamento
*   Indexar as ferramentas atuais (`system_actions.py`) no LanceDB.
*   Criar o nó `SemanticRouter` no LangGraph.

### Fase 3: Tool Retrieval Logic
*   Implementar o seletor dinâmico de ferramentas antes da execução dos agentes especialistas.

### Fase 4: Integração UI e Refinamento
*   Atualizar o frontend para exibir os status de "pensamento" de forma polida.
