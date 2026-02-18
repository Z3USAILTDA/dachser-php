
# Corrigir filtro ETD: mostrar apenas eventos a partir do ETD

## Problema atual

O filtro atual calcula `ETD - 5 dias` como cutoff e exclui tudo antes disso. Para o AWB `047-32913381`, o ETD era `2026-02-13`, então o cutoff ficou em `2026-02-08`. Mas eventos como BKD, RCS, MAN, DEP acontecem antes do ETD — e estavam sendo eliminados.

A intenção original do filtro era evitar que eventos de **embarques muito antigos** do mesmo número de AWB aparecessem. A lógica correta é: mostrar apenas eventos a partir do **próprio ETD** em diante (DEP, ARR, RCF, DLV etc.), que são os eventos do embarque declarado.

## Novo comportamento

O cutoff passa a ser a **data do ETD** em si:

- Eventos com `data_hora_evento >= ETD` → exibidos
- Eventos com `data_hora_evento < ETD` → filtrados (eram de processos anteriores)

Isso faz sentido logístico: o ETD é a data de partida declarada. Nenhum evento relevante do embarque acontece antes disso — eventos como BKD e RCS que ocorrem antes do ETD são do pré-embarque de outro voo anterior ao processo.

## Alteração: `supabase/functions/mariadb-proxy/index.ts`

### Linha ~6009 — apenas a linha do `candidateCutoff`

```typescript
// Antes (ETD - 5 dias):
const candidateCutoff = new Date(etdDate.getTime() - 5 * 24 * 60 * 60 * 1000);

// Depois (usar o próprio ETD como cutoff):
const candidateCutoff = new Date(etdDate.getTime());
```

E atualizar o log (linha ~6013) para refletir a nova lógica:

```typescript
console.log(`ETD cutoff for AWB ${queryAwb}: etd=${etdDate.toISOString()}, cutoff=${etdCutoff?.toISOString() ?? 'nullified (future ETD)'} (using ETD as cutoff)`);
```

A lógica de proteção existente (`candidateCutoff < now ? candidateCutoff : null`) continua funcionando: se o ETD for no futuro, o cutoff é nulificado e todos os eventos são exibidos.

## Impacto

| Situação | Comportamento |
|---|---|
| Eventos com data >= ETD (DEP, ARR, RCF, DLV) | Exibidos normalmente |
| Eventos com data < ETD (BKD, RCS de embarque anterior) | Filtrados |
| ETD no futuro | Sem filtro — todos os eventos exibidos |
| AWB sem ETD em `t_master_dados` | Sem filtro — todos os eventos exibidos |

## Arquivo a editar

- `supabase/functions/mariadb-proxy/index.ts` — alteração de 1 linha + redeploy automático
