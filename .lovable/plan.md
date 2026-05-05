## Problema

O voucher **20261566990** tem boleto anexado mas a extração da linha digitável falhou. Investigando logs da edge function `extract-boleto-barcode`:

- O Claude **leu corretamente** o código no PDF: `86640002347-3 61321557856-8 92026050811-3 26000174145-3` (4 grupos de 12 dígitos = **48 dígitos**, com hífen separando o DV).
- O documento é um **DAI (Documento de Arrecadação de Importação)**, ou seja, **boleto de arrecadação/convênio**, não bancário.
- Mas o `EXTRACTION_PROMPT` força o formato bancário (47 dígitos / 5 grupos). O modelo "comprime" os 48 → 47 inventando um dígito, e o validador (`validateLinhaDigitavel`, mod-10/mod-11 do layout bancário) rejeita.
- Resultado: front recebe `success: false` e o usuário fica sem a linha digitável, mesmo tendo um boleto válido.

A causa é arquitetural: o extrator suporta apenas **um** dos dois layouts oficiais da FEBRABAN. Arrecadação (códigos iniciados em **8**) e convênios são comuns em comex (DAI, DARF, FUNDAF, ANVISA, taxas de concessionária etc.).

## Mudança

Toda alteração concentrada em `supabase/functions/extract-boleto-barcode/index.ts`. Sem mudanças no front, no banco ou em outras telas.

### 1. Reconhecer os dois formatos

Adicionar detector pelo primeiro dígito do código limpo:
- Começa com `8` → **Arrecadação** (48 dígitos, 4 campos × 12 = 11 dígitos + 1 DV).
- Caso contrário → **Bancário** (47 dígitos, lógica atual preservada).

### 2. Validador de arrecadação

Implementar `validateLinhaDigitavelArrecadacao(barcode48)`:
- Quebra em 4 campos de 12 dígitos.
- Para cada campo, calcula o DV sobre os 11 primeiros:
  - 3º dígito do código (`barcode[2]`) ∈ {`6`,`7`} → **DV mod-10** (já temos `calcModulo10`).
  - 3º dígito ∈ {`8`,`9`} → **DV mod-11** específico de arrecadação (pesos 2..9 cíclicos; resto 0/1/10 → DV 0; senão `11 - resto`).
- Retorna `ValidationResult` no mesmo shape (campo1..campo4 + details), permitindo reuso do retry loop.

### 3. Atualizar prompts

`EXTRACTION_PROMPT` passa a descrever ambos os layouts:

```
Identifique e extraia a linha digitável. Existem DOIS formatos possíveis:

A) BOLETO BANCÁRIO — 47 dígitos, 5 grupos:
   XXXXX.XXXXX XXXXX.XXXXXX XXXXX.XXXXXX X XXXXXXXXXXXXXX

B) ARRECADAÇÃO/CONVÊNIO (DAI, DARF, taxas, tributos — começa com 8):
   48 dígitos, 4 grupos de 12:
   XXXXXXXXXXX-X XXXXXXXXXXX-X XXXXXXXXXXX-X XXXXXXXXXXX-X

RESPONDA:
TIPO: BANCARIO | ARRECADACAO
FORMATADA: <linha formatada conforme o tipo>
LIMPA: <somente dígitos, 47 ou 48>

Se não encontrar: NAO_ENCONTRADO
```

`buildRetryPrompt` recebe um parâmetro extra `tipo: 'BANCARIO' | 'ARRECADACAO'` e descreve os campos corretos no prompt corretivo.

`parseExtractionResponse` continua extraindo a linha `LIMPA:`. O tipo é inferido por `barcode[0] === '8'` (mais robusto do que confiar no que o modelo escreveu em `TIPO:`).

### 4. Pipeline unificado

No `serve()`:

```
clean = parseExtractionResponse(rawResponse1)
tipo = clean.startsWith('8') && clean.length === 48 ? 'ARRECADACAO' : 'BANCARIO'

if (tipo === 'ARRECADACAO' && clean.length === 48) {
  validation = validateLinhaDigitavelArrecadacao(clean)
} else if (tipo === 'BANCARIO' && clean.length === 47) {
  validation = validateLinhaDigitavel(clean)
}

if (!validation.valid) → retry com buildRetryPrompt(validation, tipo)
  (mesma lógica do attempt 2 atual, escolhendo a tentativa com menos erros)
```

`formatLinhaDigitavel` já trata os dois tamanhos (47 e 48) — manter.

A resposta JSON ganha `tipo: 'BANCARIO' | 'ARRECADACAO'` para o front exibir, mas o front não precisa mudar (campo opcional).

### 5. Defesa contra "compressão"

Se a primeira tentativa devolver 47 dígitos começando com `8` (sintoma do problema atual: o modelo cortou um dígito para caber no formato bancário), forçar uma segunda chamada com prompt focado em arrecadação antes de validar. Isso elimina o caso do voucher 20261566990.

## Resultado

- DAI / DARF / boletos de arrecadação são extraídos e validados corretamente (48 dígitos, mod-10 ou mod-11 por campo).
- Boletos bancários continuam funcionando como hoje (lógica preservada).
- Voucher 20261566990 passa a retornar a linha digitável real ao usuário.

Memória nova após implementação: `mem://vouchers/boleto-extraction-arrecadacao-support` — registra que o extrator suporta os dois layouts FEBRABAN e como o tipo é detectado.
