# Plano — Corrigir os 26 erros da importação em lote SPO

## Diagnóstico

A planilha de teste tem 17 colunas, mas **3 campos obrigatórios não existem nela**:
- **Origem Processo** (AIR/SEA/CHB/ROD)
- **Tipo Documento** (VOUCHER/SPO/ICMS/…)
- **Fiscal** (Sim/Não — `cobranca_em_nome_de`)

Como os SPOs da planilha (`105-290647 DIM-BY` etc.) provavelmente ainda não existem em `t_dados_financeiro_voucher`, o lookup não preenche esses campos e todas as 26 linhas viram `ERROR`.

Adicionalmente, `Fornecedor` da planilha vem como código (`8078`); precisa fallback de exibição.

## Princípio

**Nenhum default automático.** Campos ausentes na planilha e ausentes no DFV **devem ser preenchidos pelo usuário** antes da criação. O fluxo guia o usuário até zerar pendências.

## Mudanças

### 1. Frontend — Etapa intermediária "Completar campos faltantes"

Após o upload e antes da tabela de preview editável, se houver pelo menos uma linha com campos obrigatórios ausentes em **toda a planilha** (coluna inteira faltando), exibir um painel:

```
Os seguintes campos não estão na planilha. Defina o valor para aplicar a todas as linhas:

  Origem Processo *   [▼ AIR | SEA | CHB | ROD]
  Tipo Documento *    [▼ VOUCHER | SPO | ICMS | ARMAZENAGEM | ADF | OUTROS]
  Fiscal *            [▼ Sim — Fiscal | Não — Cliente]
  Urgente             [☐]

  [Continuar]
```

Só os campos que faltam **em todas as linhas** aparecem aqui. O usuário escolhe e prossegue. Os valores são aplicados a todas as 26 linhas com origem `MANUAL` e disparam revalidação.

### 2. Frontend — Barra de ação em massa na tabela de preview

Acima da tabela do step `preview`, adicionar uma barra compacta para sobrescrever em massa qualquer um dos 9 campos editáveis (não só os 3 acima). Útil para corrigir um campo da planilha que veio errado em todas as linhas.

```
Aplicar a todas:  [Campo ▼] [Valor ▼] [Aplicar]
```

### 3. Backend `mariadb-proxy/index.ts`

**Lookup DFV mais tolerante** em `fetchDfvBySpo`:
- Normalizar SPO (trim + colapsar espaços) tanto na chave da query quanto no map de resposta.
- Manter `WHERE nd IN (...)` mas comparar normalizados.

**Fornecedor numérico:** se planilha trouxer só dígitos e DFV não tiver nome, manter o código (não bloquear). Validação atual já passa nesse caso.

**Sem alterar defaults** — o usuário fornece via UI.

### 4. Frontend — Tabela de preview

Sem alterações estruturais. Apenas garantir que valores aplicados em massa apareçam com badge `MN` (já existe).

## Resultado para a planilha de teste

1. Usuário sobe `PLANILHA_INTEGRAÇÃO_PARA_FAZER_SPO.csv`.
2. Sistema detecta que `Origem Processo`, `Tipo Documento` e `Fiscal` estão ausentes em todas as 26 linhas.
3. Mostra painel: usuário escolhe (ex.) **SEA**, **VOUCHER**, **Sim**.
4. Vai para a tabela de preview com 26 linhas válidas; usuário pode ajustar exceções.
5. Cria 26 vouchers.

## Fora de escopo

- Auto-detectar Origem por padrão de processo
- Criar fornecedores novos a partir de código
- Alterar `t_vouchers` ou fluxo individual do RM

## Arquivos afetados

- `src/components/esteira/BatchImportVoucherDialog.tsx` — novo step intermediário "fill-missing" + barra em massa
- `src/components/esteira/BatchImportPreviewTable.tsx` — sem alteração estrutural
- `supabase/functions/mariadb-proxy/index.ts` — apenas tolerância no lookup DFV
