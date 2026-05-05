---
name: Boleto Extraction Arrecadação Support
description: extract-boleto-barcode supports both bancário (47 dig) and arrecadação/convênio (48 dig, starts with 8) FEBRABAN layouts
type: feature
---
A edge function `extract-boleto-barcode` aceita os dois layouts FEBRABAN:

- **Bancário**: 47 dígitos, 5 grupos. Validação: mod-10 nos 3 campos + mod-11 no DV geral (`validateLinhaDigitavel`).
- **Arrecadação/Convênio** (DAI, DARF, tributos, taxas, concessionárias): **48 dígitos**, começa com `8`, em 4 grupos de 12 (11 dígitos + 1 DV). Algoritmo do DV depende do 3º dígito do código:
  - `6` ou `7` → mod-10 (`calcModulo10`)
  - `8` ou `9` → mod-11 com pesos cíclicos 2..9 (`calcModulo11Arrecadacao`); resto 0/1/10/11 → DV 0
  - Função: `validateLinhaDigitavelArrecadacao`

**Detecção do tipo**: pelo primeiro dígito do código limpo. Se vier 47 dígitos começando com `8`, considerar arrecadação truncada e re-pedir ao LLM com prompt focado em arrecadação (defesa contra "compressão" — o LLM corta um dígito para encaixar no formato bancário).

`formatLinhaDigitavel` formata ambos os tamanhos. Resposta da função inclui `tipo: 'BANCARIO' | 'ARRECADACAO'`.
