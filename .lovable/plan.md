

## Alteração pontual: SQL do `fetch-tracking-aereo`

### Arquivo único alterado

**`supabase/functions/fetch-tracking-aereo/index.ts`** — somente o bloco SQL (linhas 47-113).

### Resultado do teste da query atual

A função retorna dados corretamente hoje. Confirmado:
- Timeline do `t_aereo_scraper` usa chaves maiúsculas: `Description`, `Location`, `Timestamp`, `Carrier`
- Timeline do `t_fato_aereo` usa chaves minúsculas: `description`, `location`, `date`, `carrier`
- O JS de normalização (linhas 120-182) acessa `lastEvt?.date` (linha 136) — compatível com `t_fato_aereo`
- O JS usa `row.consignee_nome`, `row.clerk`, `row.clerk_email`, `row.etd`, `row.last_flight`, `row.origin`, `row.destination`, `row.location_last`, `row.location_penultimate`

### O que muda

Substituir a query SQL (linhas 48-113) pela query fornecida, com os seguintes campos adicionais na subquery interna para manter compatibilidade com o JS de normalização que **não será alterado**:

1. **Campos de `t_dados_aereo`**: `tda.consignee_nome`, `tda.clerk`, `tda.clerk_email`, `tda.etd`
2. **Locations da timeline**: extrair `$[0].location` como `location_last` e `$[1].location` como `location_penultimate`
3. **Campos inexistentes em `t_fato_aereo`**: `'' as last_flight`, `'' as origin`, `'' as destination`
4. Propagar todos esses campos no select externo

### Comentário do bloco

Atualizar de `t_aereo_scraper` para `t_fato_aereo`.

### O que NÃO muda

- Nenhum outro arquivo
- Código JS de normalização (linhas 119-182) permanece idêntico
- Nenhum componente, hook, tela ou serviço tocado
- Nenhuma variável, tipo ou interface renomeada

