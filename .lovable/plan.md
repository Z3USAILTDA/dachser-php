# Por que o 2º teste falhou

O log do navegador mostra:

> `Lote: extração de linha digitável falhou — Linha digitável com tamanho inválido (113 dígitos)`

Ou seja, a Edge Function `extract-boleto-barcode` **respondeu**, mas o conteúdo extraído tinha **113 dígitos** — fora dos tamanhos válidos (47 boleto bancário / 48 arrecadação).

## Causa

DAIs frequentemente contêm **mais de uma linha digitável** no mesmo PDF (DAI principal + parcelas / GRU complementar / 2ª via). No 1º teste o PDF tinha só 1 linha digitável; no 2º o PDF tinha múltiplas.

O prompt em `EXTRACTION_PROMPT` (linhas 173-192 de `supabase/functions/extract-boleto-barcode/index.ts`) **não diz** ao Claude o que fazer quando há mais de uma. Resultado: o modelo concatenou os dígitos de 2-3 códigos na mesma linha `LIMPA:`, e o parser `parseExtractionResponse` (regex `/LIMPA:\s*(\d+)/`) capturou todos de uma vez → 113 dígitos → reprovado na validação de tamanho.

Não é problema do anexo no voucher nem do `save_linha_digitavel`. O DAI foi vinculado normalmente; só a extração textual variou entre os PDFs.

## Plano de correção (cirúrgico, somente em `extract-boleto-barcode/index.ts`)

1. **Reforçar o prompt** (`EXTRACTION_PROMPT` e `buildRetryPrompt`):
   - Adicionar instrução explícita: *"Se houver MAIS DE UMA linha digitável no documento (ex.: DAI com parcelas, GRU complementar, 2ª via), retorne SOMENTE a do valor principal/total. Nunca concatene dígitos de códigos diferentes."*

2. **Defender o parser** `parseExtractionResponse` contra resposta concatenada:
   - Se a string capturada tiver `> 48` dígitos, tentar fatiar nos tamanhos válidos: primeiros 48 começando com `8` (arrecadação) ou primeiros 47 (bancário), validar com `validateLinhaDigitavel` / `validateLinhaDigitavelArrecadacao` e usar a primeira fatia que passar.
   - Se nenhuma fatia validar, retornar string vazia (mantém o comportamento atual de "não encontrado", em vez de mandar 113 dígitos para validação).

3. **Logar no servidor** o tamanho bruto retornado pelo Claude antes da validação, para diagnosticar futuros casos.

## Fora de escopo

- Frontend `BatchDocumentBinderDialog.tsx` (a lógica DAI×BOLETO já está correta).
- `mariadb-proxy` / `save_linha_digitavel`.
- Fluxo unitário e PRE_LANCAMENTO.
- Mudança de modelo Anthropic.

## Memória

Atualizar `mem://vouchers/boleto-extraction-arrecadacao-support` adicionando: *DAIs com múltiplas parcelas devem retornar apenas a linha digitável principal; parser deve fatiar e validar quando recebe `>48` dígitos.*
