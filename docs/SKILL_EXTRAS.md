# Extras em Skills

Este documento explica como adicionar **snippets** e **cards** às suas skills para exibir conteúdo rico no chat.

## Visão Geral

Além de retornar texto simples, suas tools podem retornar **extras** que serão exibidos no chat como:

- **Snippets**: Blocos de texto com título e ícone
- **Cards**: Cards interativos com imagem, título, descrição e link
- **Sources**: Fontes/links (já existente)

## Como Retornar Extras

Sua tool deve retornar um dicionário com a chave `extras`:

```python
from langchain_core.tools import tool

@tool
def buscar_produto(produto: str):
    """
    Busca informações de um produto.
    
    Args:
        produto: Nome do produto para buscar
    """
    resultado = api.buscar(produto)
    
    return {
        "result": f"Encontrei: {resultado['nome']}",
        "extras": {
            "snippets": [
                {
                    "title": "Detalhes do Produto",
                    "content": resultado["descricao"],
                    "icon": "📦"
                }
            ],
            "cards": [
                {
                    "type": "product",
                    "title": resultado["nome"],
                    "image": resultado["imagem"],
                    "price": resultado["preco"],
                    "description": resultado["descricao_curta"],
                    "link": resultado["url"]
                }
            ],
            "sources": [
                {
                    "url": resultado["url"],
                    "title": resultado["nome"],
                    "snippet": resultado["resumo"]
                }
            ]
        }
    }
```

## Formato dos Extras

### Snippets

```python
{
    "title": "Título do Snippet",
    "content": "Conteúdo do snippet...",
    "icon": "📝"  # Opcional - emoji ou texto
}
```

### Cards

```python
{
    "type": "product",  # Tipo do card (pode ser qualquer string)
    "title": "Título do Card",
    "image": "https://exemplo.com/imagem.jpg",  # Opcional
    "description": "Descrição do card...",  # Opcional
    "price": "R$ 99,90",  # Opcional
    "link": "https://exemplo.com/produto"  # Opcional
}
```

Você pode adicionar qualquer campo adicional ao card - ele será renderizado dinamicamente.

### Sources

```python
{
    "url": "https://exemplo.com",
    "title": "Título da Fonte",
    "snippet": "Trecho da fonte..."
}
```

## Exemplo Completo: Skill de Previsão do Tempo

```python
# tools.py
from langchain_core.tools import tool

@tool
def previsao_tempo(cidade: str):
    """Busca a previsão do tempo para uma cidade."""
    dados = api.clima(cidade)
    
    return {
        "result": f"Temperatura em {cidade}: {dados['temp']}°C",
        "extras": {
            "cards": [
                {
                    "type": "weather",
                    "title": f"Previsão para {cidade}",
                    "image": dados["icone"],
                    "description": dados["condicao"],
                    "temperature": f"{dados['temp_min']}° - {dados['temp_max']}°"
                }
            ],
            "snippets": [
                {
                    "title": "Detalhes",
                    "content": f"Umidade: {dados['umidade']}% | Vento: {dados['vento']} km/h",
                    "icon": "🌤️"
                }
            ]
        }
    }
```

## Boas Práticas

1. **Sempre retorne `result`**: O agente precisa do texto da resposta
2. **Mantenha extras opcionais**: Nem sempre você terá extras para retornar
3. **Use tipos semânticos**: O campo `type` no card ajuda no processamento futuro
4. **Limite o tamanho**: Snippets muito longos serão truncados na exibição

## Configuração na Skill

No arquivo `skill.md`, certifique-se de incluir a tool na lista `allowed-tools`:

```yaml
---
name: clima
description: Skill para previsão do tempo
allowed-tools: previsao_tempo
---
```

## Notas

- Os extras são extraídos automaticamente pelo sistema
- Cards e snippets são exibidos após a resposta do agente
- Sources mantêm compatibilidade com o sistema anterior
