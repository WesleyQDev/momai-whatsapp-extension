---
title: O nascimento de uma assistente privada
date: 27 de Abril, 2026
image: https://i.ibb.co/LXgHdCFK/image.png
featured: true
---

Estou lançando a primeira versão da **MomAI**, uma assistente pessoal de computador que roda inteiramente no seu hardware.

## O que é a MomAI?

A MomAI é uma assistente de inteligência artificial local. Ela não depende de internet, não exige login e não envia seus dados para nenhum servidor. Tudo roda e fica armazenado na sua própria máquina.

O nome vem da ideia de ser a "mãe" do seu sistema — ela organiza, lembra e ajuda no que for preciso. E é totalmente gratuita.

## O que ela faz hoje?

Nesta versão você pode criar e gerenciar anotações, agendar lembretes com notificação por voz, e pedir para ela buscar informações na internet. A ativação por voz também já funciona: basta dizer **"Sistema"** e ela começa a ouvir, tudo processado localmente.

Ela também detecta quando você está rodando um jogo ou processo pesado no PC e pausa os processos de IA automaticamente para não comprometer o desempenho.

## Requisitos

O recomendado é **16GB de RAM** e uma **placa de vídeo com pelo menos 6GB de VRAM**. A MomAI roda modelos de linguagem localmente usando o **llama.cpp** com o modelo **Qwen**, o que exige um hardware razoável mas garante funcionamento totalmente offline.

## Arquitetura

O frontend é feito em Electron com React, e o backend em Python com FastAPI. A comunicação entre os dois acontece por WebSocket e API REST. No backend, a orquestração da IA é feita com LangGraph — um sistema de agentes que decide qual ferramenta usar para cada situação.

O projeto ainda vai passar por mudanças, mas a base está sólida. A MomAI já conta com uma loja de extensões para expandir suas capacidades, e novas funcionalidades serão adicionadas com frequência através de atualizações regulares.

— WesleyQDev
