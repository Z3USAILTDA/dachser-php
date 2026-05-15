# Por que o detalhe do voucher 20261883397 mostra menos informação que a listagem

## Diagnóstico

A **listagem** (`get_vouchers_combined` / `get_vouchers_ativos`) faz LEFT JOIN com `t_dados_financeiro_voucher` (DFV) usando `SUBSTRING_INDEX(numero_spo,' ',1) = SUBSTRING_INDEX(nd,' ',1)` e expõe `dfv_valor_nf`, `dfv_razao_social`, `dfv_nome_beneficiario`, `dfv_numero_processo`, `dfv_id_rm`, `dfv.data_emissao`. O frontend (`EsteiraIndex.tsx` linhas 767–769, 978–980) aplica fallback:

- `valor = v.valor ?? dfv_valor_nf`
- `fornecedor = v.fornecedor ?? dfv_razao_social ?? dfv_nome_beneficiario`
- `data_emissao_documento = COALESCE(v.data_emissao_documento, dfv.data_emissao)` (já feito no SQL)

Já o **detalhe** (`get_voucher_by_id` em `supabase/functions/mariadb-proxy/index.ts` linha 7551 + mapeamento em `src/pages/esteira/EsteiraVoucherDetails.tsx` linhas 85–155) lê **somente** `t_vouchers.*`. Não há JOIN com DFV nem fallback.

Para o voucher `20261883397`: `t_vouchers.valor` está NULL (origem RM, valor mora em DFV.valor_nf = 4.318,31). Por isso a listagem mostra `BRL 4.318,31` e o detalhe mostra `—`. O mesmo aconteceria com fornecedor caso `t_vouchers.fornecedor` fosse nulo. (Filial realmente não existe em nenhuma fonte — esse `—` é correto.)

## Correção proposta (cirúrgica, sem refatorar nada)

### 1. `supabase/functions/mariadb-proxy/index.ts` — case `get_voucher_by_id`

Trocar o `SELECT * FROM t_vouchers WHERE id = ?` por uma query com o **mesmo** LEFT JOIN agregado que `get_vouchers_combined` usa, expondo:

- `dfv_valor_nf`
- `dfv_razao_social`
- `dfv_nome_beneficiario`
- `dfv_numero_processo`
- `dfv_id_rm`
- `dfv_moeda` (extra, para casos em que `t_vouchers.moeda` seja nulo)
- `COALESCE(v.data_emissao_documento, dfv.data_emissao) AS data_emissao_documento`

Nada mais é alterado nesse case (anexos, logs, dadosBancarios, retry — tudo permanece).

### 2. `src/pages/esteira/EsteiraVoucherDetails.tsx` — função `loadVoucher`

Aplicar exatamente o mesmo fallback que a listagem usa (linhas 88, 90, 91):

```ts
fornecedor: data.fornecedor || data.dfv_razao_social || data.dfv_nome_beneficiario || '',
valor: data.valor != null && data.valor !== ''
  ? parseFloat(data.valor)
  : (data.dfv_valor_nf != null && data.dfv_valor_nf !== '' ? parseFloat(data.dfv_valor_nf) : undefined),
moeda: data.moeda || data.dfv_moeda || 'BRL',
processoId: data.processo_id || data.dfv_numero_processo || null,
```

`data_emissao_documento` já vem coalescido do SQL, então não precisa mexer no mapeamento dele.

## O que NÃO muda

- Nenhuma outra action do proxy.
- Nenhum outro arquivo do frontend.
- Sem refator de tipos, sem renomear, sem mexer em listagem ou comprovantes.
- Filial continua `—` quando realmente não existe (não há fonte alternativa).

## Resultado esperado

Para `20261883397` e qualquer voucher de origem RM cujos campos vivam apenas em `t_dados_financeiro_voucher`, o detalhe passa a mostrar Valor/Fornecedor/Moeda/Processo iguais à listagem, em uma única fonte de verdade compartilhada.
