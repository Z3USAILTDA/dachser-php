

# Integrar tbaixas na Regua de Cobranca e no Aging

## Objetivo
Filtrar registros finalizados/cancelados/negociados (StatusLan 1, 2, 3) da tbaixas em **todos os pontos** que alimentam a Regua de Cobranca e os e-mails de Aging. Registros sem entrada na tbaixas ou com StatusLan 0/4 permanecem.

## Pontos de alteracao

Sao **2 edge functions** com **6 queries** no total:

| Edge Function | Query/Action | Descricao |
|---|---|---|
| mariadb-proxy | get_regua_counts | Contadores da regua visual |
| mariadb-proxy | get_regua_stage | Drill-down por faixa |
| mariadb-proxy | get_regua_clientes_resumo | Busca/agrupamento de clientes |
| regua-send-aging | CNPJ discovery (2 queries) | Busca CNPJs com faturas vencidas |
| regua-send-aging | Invoice fetch | Busca faturas para gerar o Excel |
| regua-send-emails | Invoice fetch por stage | Busca faturas para envio automatico |

## Etapa 1 -- Criar indices no MariaDB

Executar via raw_query no mariadb-proxy para garantir performance:

```text
CREATE INDEX idx_tbaixas_idlanc_status 
  ON dados_dachser.tbaixas (IdLancamentoRM, StatusLan);

CREATE INDEX idx_nfs_id_rm 
  ON dados_dachser.t_dados_financeiro_nfs (id_rm);
```

## Etapa 2 -- Atualizar mariadb-proxy (3 queries)

Adicionar o filtro NOT EXISTS nas 3 actions da regua, apos a linha do soft-delete:

```text
AND NOT EXISTS (
  SELECT 1 FROM dados_dachser.tbaixas b
  WHERE b.IdLancamentoRM = t.id_rm
    AND b.StatusLan IN (1, 2, 3)
)
```

Tambem corrigir os gaps de classificacao:
- PRE: `DATEDIFF < 0` para `DATEDIFF <= 0`
- D1: `DATEDIFF = 1` para `DATEDIFF BETWEEN 1 AND 6`

## Etapa 3 -- Atualizar regua-send-aging (3 queries)

Adicionar o mesmo filtro NOT EXISTS em:

1. Query de CNPJ discovery (modo agrupado, linha ~442-447):
```text
SELECT DISTINCT cnpj 
FROM dados_dachser.t_dados_financeiro_nfs t
WHERE cnpj LIKE CONCAT(?, '%')
  AND DATEDIFF(CURDATE(), data_vencimento) >= 1
  AND NOT EXISTS (
    SELECT 1 FROM dados_dachser.tbaixas b
    WHERE b.IdLancamentoRM = t.id_rm AND b.StatusLan IN (1, 2, 3)
  )
```

2. Query de CNPJ discovery (modo single, linha ~454-459): mesmo filtro.

3. Query principal de invoices (linha ~469-493): adicionar apos `AND COALESCE(sd.active, 1) = 1`.

## Etapa 4 -- Atualizar regua-send-emails (1 query)

Adicionar o filtro NOT EXISTS na query principal (linha ~436-442), apos a linha do soft-delete e antes do filtro de disputa:

```text
AND NOT EXISTS (
  SELECT 1 FROM dados_dachser.tbaixas b
  WHERE b.IdLancamentoRM = t.id_rm AND b.StatusLan IN (1, 2, 3)
)
```

## Etapa 5 -- Deploy e teste

- Deploiar `mariadb-proxy`, `regua-send-aging` e `regua-send-emails`
- Testar `get_regua_counts` para validar reducao nos numeros
- Testar envio de aging para um cliente e verificar que NFs baixadas nao aparecem no Excel

## Secao tecnica

- NOT EXISTS com indice composto `(IdLancamentoRM, StatusLan)` e um covering index -- a subquery resolve sem acessar a tabela principal
- O indice em `id_rm` garante lookup rapido na tabela de NFs
- Logica: se nao existe registro na tbaixas, NOT EXISTS = true (mantido). Se existe com StatusLan 0 ou 4, a subquery nao encontra match com IN(1,2,3), logo NOT EXISTS = true (mantido). So remove quando StatusLan e 1, 2 ou 3.

