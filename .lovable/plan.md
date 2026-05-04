## Diagnóstico do caso do print

Arquivo: `2026377674530042026.13.pdf` → resultado: **"Voucher não encontrado"**.

Decompondo o nome conforme o padrão "Comprovante Voucher Remessa":
- `2026377674530042026.13` = `<ND>` + `<DDMMYYYY>` + `.<seq>`
- Data embutida = `30042026` (30/04/2026)
- ND real = **`20263776745`** (11 dígitos)

Olhando `supabase/functions/parse-comprovante-pdf/index.ts`:
- **Pattern 3** (linha 88) usa regex `/^(20\d{8})\d{8}\.\d{2}/` — captura **exatos 10 dígitos** após `20`.
- Resultado: extrai `2026377674` (perde o `5`) e busca esse ND no banco → não acha.
- O fallback Pattern 7 (`(20\d{8,})`) também não roda, porque o Pattern 3 já fez `return`.

Há um segundo problema relacionado: quando a extração via filename falha, o código faz `return` em `parse-comprovante-pdf` sem tentar a IA do PDF (linhas 198-204). E na busca por ND (`find_voucher_by_nd`), só procura em `id_rm` e `processo_id` — nunca em `linha_digitavel` nem `codigo_barras`, que muitos comprovantes contêm.

## Plano de prevenção

Mudanças cirúrgicas em **2 arquivos**, sem refatoração estrutural.

### 1. `supabase/functions/parse-comprovante-pdf/index.ts`

**a) Corrigir Pattern 3 (Voucher Remessa) para aceitar ND de tamanho variável**

Hoje:
```ts
const voucherRemessaPattern = /^(20\d{8})\d{8}\.\d{2}/;
```
Trocar por captura **gulosa do prefixo**, deixando exatos 8 dígitos de data + `.NN` no final:

```ts
// ND pode ter 10–13 dígitos; a data DDMMYYYY (8) + .NN no final são fixos
const voucherRemessaPattern = /^(20\d{8,11})(\d{8})\.\d{2}$/;
```
Isso captura tanto `2025156579` (10) quanto `20263776745` (11) — validando que os 8 dígitos finais antes do `.NN` formam uma data plausível (`(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])20\d{2}`) — adicionar essa validação extra para evitar falsos positivos.

**b) Não fazer `return` antecipado quando confiança for baixa**

Hoje em filename, qualquer match com confidence >= 0.7 já retorna sem tentar IA. Mudar para: **se confidence < 0.85 E o PDF estiver disponível, complementar com IA** e usar o resultado com mais sinais (ND/SPO + valor + fornecedor) para escolher o melhor.

**c) Adicionar campo `candidatos`**

Em vez de retornar `numeroSPO` único, retornar também `candidatosSPO: string[]` e `candidatosND: string[]` — todas as substrings numéricas plausíveis (5–13 dígitos) extraídas do filename **e** do conteúdo. O frontend tenta cada candidato em ordem antes de marcar como "não encontrado".

**d) Extrair `linhaDigitavel` do filename quando ele tiver 44–48 dígitos puros**

Se o filename for só dígitos com 44+ caracteres, tratar como linha digitável de boleto e popular esse campo (já temos `extract-boleto-barcode` para validar/normalizar).

### 2. `supabase/functions/mariadb-proxy/index.ts` — `find_voucher_by_nd`

Adicionar duas estratégias de busca novas (após as 5 atuais, antes do retorno):

**a) Match por `linha_digitavel` / `codigo_barras`**
```sql
SELECT ... FROM t_vouchers
WHERE REPLACE(REPLACE(linha_digitavel,' ',''),'.','') LIKE CONCAT('%', ?, '%')
   OR REPLACE(REPLACE(codigo_barras,' ',''),'.','') LIKE CONCAT('%', ?, '%')
LIMIT 5
```
Resolve casos onde o PDF tem só o boleto e o filename é a linha digitável.

**b) Match contra `t_dados_financeiro_voucher.nd`**
Hoje, com a limpeza recente, `nd` é a fonte de verdade. Adicionar JOIN:
```sql
SELECT v.* FROM t_vouchers v
INNER JOIN t_dados_financeiro_voucher dfv
  ON TRIM(dfv.nd) COLLATE utf8mb4_unicode_ci = TRIM(v.numero_spo) COLLATE utf8mb4_unicode_ci
WHERE TRIM(dfv.nd) = ? OR ? LIKE CONCAT(TRIM(dfv.nd),'%')
LIMIT 5
```

### 3. `src/pages/esteira/ComprovanteRobot.tsx`

Quando `parse-comprovante-pdf` retornar `candidatosSPO`/`candidatosND`, iterar todos antes de marcar `not_identified`. Logar no console o motivo da falha (qual candidato foi tentado) para diagnóstico futuro.

Adicionar tooltip no badge "Voucher não encontrado" mostrando: SPO/ND extraídos + candidatos tentados, para o usuário entender o porquê e poder corrigir manualmente com um clique.

## Resumo dos arquivos editados

- `supabase/functions/parse-comprovante-pdf/index.ts` — regex variável + candidatos múltiplos + uso de IA mesmo com filename parcial.
- `supabase/functions/mariadb-proxy/index.ts` — `find_voucher_by_nd` ganha busca por `linha_digitavel`, `codigo_barras` e JOIN com `t_dados_financeiro_voucher`.
- `src/pages/esteira/ComprovanteRobot.tsx` — itera candidatos + tooltip diagnóstico no badge.

## Validação após implementar

Testar com o próprio arquivo `2026377674530042026.13.pdf`. Esperado: extrair ND = `20263776745`, achar voucher correspondente. Caso continue não achando, o tooltip mostrará exatamente qual número foi buscado, permitindo correção rápida.

## Memória

Atualizar `mem://vouchers/comprovante-robot-matching-rules` documentando: ND tem tamanho variável (10–13), buscar também em linha_digitavel/codigo_barras e t_dados_financeiro_voucher.nd, sempre retornar candidatos múltiplos.
