

## Plano: Atualizar processos aéreos e remover AWBs

### Resumo

Adicionar 15 novos overrides manuais e remover 6 AWBs da lista de monitoramento no arquivo `supabase/functions/fetch-status-aereo/index.ts`.

### 1. Novos MANUAL_OVERRIDES (15 AWBs)

| AWB | Rota | Último Status | Observação |
|-----|------|---------------|------------|
| 074-04838536 | HAM→GRU | RCF | 7 pcs received at AMS from KL8420 |
| 074-04803864 | LNZ→GRU | NFD | 2 pcs ready to pick up at GRU |
| 045-21167370 | FRA→GRU | BKD | 99 / 1810.00KGS |
| 045-15957771 | FRA→CWB | AWD | Document Delivered at CWB - 13 / 714.50KGS |
| 045-13300906 | HEL→CWB | DEP | Transporte Terrestre LA 5252-T |
| 045-13300840 | HEL→CWB | MAN | Transporte Terrestre M3 8516 BRU-CWB |
| 045-13110764 | FRA→POA | AWD | Document Delivered at POA |
| 045-12579394 | BCN→GRU | BKD | Terrestre LA 5280-T via MAD |
| 020-20982640 | GRU→MUC | BKD | 1 / 119 kg |
| 020-17606046 | BKK→GRU | ARR | Via FCO, arrived FCO |
| 020-06353815 | VCP→FRA | BKD | 2 pcs |
| 020-03171232 | FRA→VCP | RCS | 2 pcs, RCS 11 MAR |
| 020-01086245 | IST→GRU | DIS | OFLD - 1 piece offloaded LH8345/14 Mar |
| 016-98880062 | BKK→GRU | RCF | Via NRT→IAH→GRU, RCF at GRU |

Cada override incluirá `status`, `status_info`, `last_event_date`, `force_origem`, `force_destino` e `force_timeline` com todos os eventos fornecidos.

### 2. Remoções (HIDDEN_AWBS)

Adicionar 6 AWBs ao conjunto HIDDEN_AWBS:
- `074-67409506`
- `047-09933663`
- `045-13293545`
- `016-06977736`
- `006-45285155`
- `001-22828956`

### 3. Notas técnicas

- O AWB `020-01086245` tem evento DIS OFLD — será marcado com status `DIS` e status_info descrevendo o offload.
- O AWB `020-17606046` tem DEP de FCO em 14 MAR 10:30 (futuro relativo a outros eventos) — será incluído como o evento mais recente, resultando em status `DEP` na verdade (pois 14 MAR 10:30 > 13 MAR 18:41 ARR FCO). Revisando: o último evento cronologicamente é DEP de FCO em 14 MAR 10:30, então status = DEP.
- O AWB `020-03171232` tem BKD em 14 MAR 11:02 e RCS em 11 MAR 19:47. BKD é mais recente cronologicamente, mas RCS é hierarquicamente superior (10 > 1). Pela lógica do tiebreaker, BKD em 14 MAR vem primeiro (data mais recente). Status final = BKD com data 14 MAR. Porém, como RCS aconteceu em 11 MAR (antes do BKD), o BKD posterior pode ser um re-booking. Status = BKD.

### Arquivo editado

- `supabase/functions/fetch-status-aereo/index.ts` — seção MANUAL_OVERRIDES e HIDDEN_AWBS

