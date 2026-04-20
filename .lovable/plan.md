

## Pós-processamento mínimo: reordenar `desc0/desc1/desc2/desc3` por hierarquia IATA

### Ideia

A Q3 já devolve os 3-4 últimos eventos (`desc0..desc3` com seus `loc` e `date` correspondentes). Em vez de tentar resolver tudo no SQL com `JSON_TABLE`/`STR_TO_DATE` multi-formato (que falha quando o crawler grava data em formato exótico), aceitamos a ordem que o SQL devolveu e fazemos **um único passo JS**: entre os 3-4 slots retornados, escolher como "mais recente" aquele com maior peso IATA. Os demais ficam como estão.

### Regra exata do pós-processamento

Para cada linha retornada pela Q3:

1. Montar array `slots = [{desc, loc, date, code, weight}]` para os índices 0..3 que vierem preenchidos.
2. Resolver `code` de cada slot via: `status_code` nativo (se existir) → regex `\| *Code +([A-Z]{2,5})` (IBS) → regex `\(([A-Z]{2,5})\)` (Lufthansa) → lookup em `t_eventos_awb`/`t_description_eventos` (já carregado em memória pela Q1+Q2).
3. Atribuir `weight` pela hierarquia IATA já existente:  
   `POD=44 > DLV=43 > NFD=42 > RCF=41 > AWD=40 > ARR=39 > TRM=38 > TFD=37 > DEP=36 > MAN=35 > BKD=34 > FOH=33 > RCS=32 > …`
4. **Eleger** como `desc0/loc0/date0/code0` (e portanto `last_status_code`) o slot de **maior peso**. Critério de desempate: índice original menor (mantém a ordem do SQL).
5. Os outros slots permanecem nos índices 1, 2, 3 na ordem original do SQL — não mexer. A timeline completa exibida no modal continua vindo do `mariadb-proxy` separadamente.

Sem reordenar o array inteiro, sem reparsear data, sem `JSON_TABLE` adicional. Apenas uma eleição de "qual dos 3-4 é o topo".

### Onde aplicar

**`supabase/functions/fetch-tracking-aereo/index.ts`** — após o `executeQuery` da Q3, no mesmo loop onde já se monta cada linha de retorno, inserir a função `pickTopByIATA(row)` e sobrescrever:

- `last_status_code` ← code do slot eleito
- `last_event_description` ← desc do eleito
- `last_event_location` ← loc do eleito
- `last_event_date` ← date do eleito
- `desc0/loc0/date0` (se o front consome esses campos diretos) ← idem

### Reverter complexidade introduzida

- Voltar a Q3 e a `get_awb_tracking_events` (mariadb-proxy) ao SELECT simples por `JSON_EXTRACT($[0..3])` + `ORDER BY id DESC` — sem `JSON_TABLE`, sem `COALESCE(STR_TO_DATE…)` multi-formato, sem `ROW_NUMBER`.
- No `mariadb-proxy.get_awb_tracking_events`, aplicar o **mesmo** `pickTopByIATA` apenas para garantir que o primeiro item da timeline retornada ao modal bata com o card. Demais itens preservam ordem do SQL.

### Caso de validação

- `020-01256754` (RCF + NFD juntos): `pickTopByIATA` elege NFD (peso 42 > 41) → card mostra NFD, modal mostra NFD no topo. ✅
- `020-65056110` (RCS vs RCF): elege RCF (41 > 32). ✅
- `020-07276290`: continua RCF. ✅
- AWB com só DEP → continua DEP (único slot).
- AWB com timeline vazia → cai em `last_status_code` cru de `t_fato_aereo` (fallback atual preservado).

### Limites assumidos

- Se o slot "verdadeiramente mais recente" estiver na posição 4+ do JSON cru (fora dos 3-4 slots devolvidos pela Q3), ele não entra na eleição. Isso é aceitável: a Q3 já recorta os 3-4 mais relevantes.
- Não tenta resolver o caso de mesmo código com timestamps diferentes — irrelevante, pois pesos iguais usam ordem original do SQL como tiebreaker.

### Não muda

- Schema de retorno, CTE de discrepância (Q6), SLA, visibility, `MANUAL_OVERRIDES` (continua tendo prioridade absoluta), cron, demais módulos.

### Memória a atualizar

`mem://air/tracking/data-mirroring-intent-v2`: registrar que o "último evento" é eleito por hierarquia IATA entre os 3-4 slots devolvidos pelo SQL, sem reparsear data nem reordenar a timeline.

