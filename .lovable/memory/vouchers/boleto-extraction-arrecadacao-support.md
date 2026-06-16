---
name: Boleto Extraction Arrecadação Support
description: extract-boleto-barcode suporta bancário (47) e arrecadação (48, começa com 8); trata DAIs com múltiplas linhas digitáveis
type: feature
---
`extract-boleto-barcode` (Edge Function) suporta:
- Boleto bancário: 47 dígitos, mod-10/mod-11.
- Arrecadação/convênio (DAI, DARF, tributos): 48 dígitos começando com 8, mod-10 ou mod-11 conforme 3º dígito.

**Múltiplas linhas digitáveis no mesmo PDF** (DAI com parcelas, GRU complementar, 2ª via):
- Prompt instrui o modelo a retornar SOMENTE a linha do valor principal/total e nunca concatenar dígitos de códigos diferentes.
- `parseExtractionResponse` defende contra resposta concatenada: se receber `>48` dígitos, fatia janelas de 48 (arrecadação, começando com 8) e 47 (bancário) testando validação matemática; usa a primeira que passar. Sem fatia válida, trunca aos primeiros 48/47 para que o erro reportado tenha tamanho coerente em vez de string gigante.
