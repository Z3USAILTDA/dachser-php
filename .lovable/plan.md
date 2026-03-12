

## Plano: Listar Containers Únicos por MBL (MSC, ONE, EVERGREEN, MAERSK)

### Problema
Os dados de containers estão no MariaDB (`dados_dachser.t_tracking_sea`), acessível apenas via Edge Functions. Não existe uma ação "list only" no `olimpo-proxy` — a única ação similar (`refresh_sea_tracking`) efetivamente processa os containers ao invés de apenas listá-los.

### Solução
Adicionar uma nova ação `list_containers_by_carrier` no `olimpo-proxy/index.ts` que:

1. Recebe parâmetro `carriers` (ex: `MSC,ONE,EVERGREEN,MAERSK`)
2. Consulta `t_tracking_sea` filtrando por prefixos do armador, containers válidos (`REGEXP ^[A-Za-z]{4}[0-9]{7}$`), e `active = 1`
3. Retorna dados agrupados por armador e MBL, com deduplicação de containers
4. Inclui resumo de contagens

### Implementação

**Arquivo**: `supabase/functions/olimpo-proxy/index.ts`

Nova ação `list_containers_by_carrier`:
- Usa o mesmo `CARRIER_PREFIX_MAP` já existente (linhas 2284-2289)
- Query SQL simples: `SELECT mbl_id, container, enrichment_status, container_status, navio, last_event FROM t_tracking_sea WHERE active=1 AND container válido AND prefixo IN (...)`
- Agrupa resultado no JS por armador → MBL → containers
- Resposta JSON com `summary` (contagens) e `data` (detalhes)

### Após Deploy
Executar a ação e apresentar os resultados no chat.

