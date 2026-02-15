---
name: websearch
description: Use esta skill para realizar pesquisas na internet em tempo real, buscar notícias atualizadas, verificar o clima ou extrair conteúdo de sites específicos.
metadata:
  author: MomAI Core
  version: "1.2"
allowed-tools: duckduckgo_search, duckduckgo_news
---

# websearch

## Visão Geral
Esta skill fornece acesso ao mundo externo, permitindo que a MomAI supere seu limite de conhecimento estático e forneça fatos atuais.

## Instruções

### 1. Decidir quando buscar
Sempre que o usuário perguntar por fatos, preços, notícias ou eventos que mudam com o tempo, ative a busca imediatamente.

### 2. Múltiplos tópicos = Múltiplas buscas
Se o usuário perguntar sobre DIFERENTES tópicos ou locais, faça UMA busca SEPARADA para cada um:
- "preço dólar e temperatura Curitiba" → 1ª busca: dólar, 2ª busca: temperatura Curitiba
- "notícias sobre IA e sobre economia" → 1ª busca: IA, 2ª busca: economia
- NÃO tente buscar tudo em uma única query

### 3. Executar múltiplas buscas se necessário
- Faça ATÉ 3 buscas diferentes no total
- Se o primeiro resultado não for satisfatório, refine a busca com termos diferentes
- NÃO faça a mesma busca múltiplas vezes

### 4. Sintetizar resultados
Após todas as buscas, analise os resultados e resuma os pontos mais importantes em uma resposta final clara. Não despeje o conteúdo bruto da web para o usuário.

### 5. Tratar falhas
Se a internet estiver indisponível ou a busca não retornar nada útil após 3 tentativas, informe o usuário de forma técnica e sugira tentar novamente mais tarde.
