# Por que ainda existem processos como AGD

## Diagnóstico (não é bug de mapeamento)

Inspecionei a tela `/sea/tracking` chamando `olimpo-proxy?action=get_sea_tracking` e analisei os 544 MBLs retornados:

| Métrica | Valor |
|---|---|
| Total de MBLs ativos | 544 |
| **Em AGD** (sem `last_event` e sem `container_status`) | **381** (70%) |
| Todos os 381 AGD têm `container = NULL` | sim |
| Todos os 381 AGD têm `shipping_line = NULL` | sim |
| Todos os 381 AGD têm `last_error = NULL` | sim |
| Idade da última varredura (`last_check`) | mediana 30 dias / max 35 dias |
| Tipo de processo dos 381 AGD | 380 SEA EXPORT + 1 SEA IMPORT |

A regra do `getReportStatus` em `src/pages/ContainerTracking.tsx:344` está correta:
```ts
if (!lastEvent) return REPORT_STATUSES.AGD;
```
Ou seja, AGD aparece **sempre que a linha de tracking não tem evento nenhum**. O problema não é classificação — é que o pipeline de enriquecimento nunca rodou nesses MBLs.

## Causa raiz

A action `sync_sea_tracking` (`supabase/functions/olimpo-proxy/index.ts:2624-2780`) faz:

```sql
SELECT TRIM(sm.master) AS mbl_id,
       'SEA EXPORT'    AS tipo_processo,
       'PENDENTE'      AS container,        -- ← container fixo "PENDENTE"
       sm.customer_no  AS consignee,
       ...
FROM dados_dachser.t_sea_master sm
```

`t_sea_master` não tem coluna de container, então toda inserção entra com `container = 'PENDENTE'`. Como nenhum scraper/API consegue rastrear sem número de container, esses MBLs ficam para sempre com `last_event = NULL` ⇒ **AGD permanente**.

Confirmações:
- 381/381 AGD têm `container = NULL` ("PENDENTE" foi limpo por algum job, mas o container real nunca foi descoberto).
- 381/381 AGD têm `shipping_line = NULL` — o enrich nunca preencheu o armador a partir do prefixo do MBL.
- Nenhum erro foi gravado (`last_error = NULL`), confirmando que o tracker provavelmente nem foi chamado (precisa de container) ou foi pulado silenciosamente.
- 542 dos 544 MBLs são SEA EXPORT (a fila de import praticamente inexiste hoje), e justamente o fluxo de export é o que sofre — porque `t_sea_master` é a fonte de export e ela não traz container.

## Como sair de AGD

Para um MBL deixar AGD ele precisa de:
1. **Container preenchido** em `t_tracking_sea` (descoberto via `t_sea_master_containers` ou tabela equivalente).
2. O scraper/API do armador correspondente rodar e devolver pelo menos 1 evento → grava `last_event` e/ou `container_status`.

Hoje nenhum dos dois acontece para 70% da base de export.

## Correção proposta (A + B combinados)

### A) Preenchimento automático de container

1. Verificar no MariaDB (`dados_dachser`) qual tabela liga MBL → container para export (candidatas: `t_sea_master_containers`, `t_dados_maritimo_containers` ou colunas dentro de `t_dados_maritimo`).
2. Estender `sync_sea_tracking` para fazer `LEFT JOIN` dessa tabela ao inserir, e adicionar um **passo extra** que atualiza `container` (e `shipping_line` derivado do prefixo do MBL) em registros já existentes com `container IS NULL OR container = 'PENDENTE'`.
3. Após preencher, o cron de retrack normal (`update frequency rules v2`) passa a tentar esses MBLs.

### B) Sub-status visual "Aguardando container"

Em `src/pages/ContainerTracking.tsx`, no `getReportStatus`:

```ts
if (!lastEvent) {
  // Distinguir "MBL sem container ainda" de "container existe mas sem evento"
  const hasContainer = !!(containerStatus || /* container do MBL */);
  return hasContainer ? REPORT_STATUSES.AGD : REPORT_STATUSES.AGD_NO_CT;
}
```

- Adicionar novo `REPORT_STATUSES.AGD_NO_CT` (label "Aguardando container", mesma `etapa` PRE_EMBARQUE, cor distinta — ex. âmbar).
- O contador do card "Aguardando" continua somando os dois; opcionalmente expor um split visual ("X aguardando container / Y aguardando evento do armador").
- Como a propriedade `container` não está hoje no payload de `getReportStatus`, vamos passar o MBL inteiro (mesmo padrão já usado para `isEntregue`) **apenas nas chamadas do dashboard**, sem mudar a assinatura para o resto.

## Escopo da implementação

- **Backend**: `supabase/functions/olimpo-proxy/index.ts` — alterar query do `sync_sea_tracking` + adicionar passo de update para preencher container/shipping_line.
- **Frontend**: `src/pages/ContainerTracking.tsx` — novo sub-status `AGD_NO_CT` e ajuste dos pontos que chamam `getReportStatus` no contexto do dashboard.
- **Sem mudanças** de schema, RLS, ou outras telas.

## Validação

1. Após o deploy do backend, rodar `sync_sea_tracking` uma vez e medir quantos dos 381 AGD ganham `container`.
2. Aguardar próximo ciclo do retrack e conferir queda do card "Aguardando".
3. No frontend, conferir que os MBLs ainda sem container aparecem como "Aguardando container" (cor distinta) e os que têm container mas seguem sem evento permanecem como "Aguardando" clássico.
