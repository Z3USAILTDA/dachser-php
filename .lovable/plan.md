

## Atualização Manual em Massa — Batch 6 (42 MBLs)

Seguindo o padrão existente no `bulk_manual_update_sea` (olimpo-proxy), adicionarei um novo **Batch 6** com todos os 42 processos fornecidos.

### Categorias dos processos

**SEM INFORMAÇÃO (8 MBLs):**
- HLCUIT1260305275, HLCUIT1260309210, HLCUPN4260353977 (já existe), HLCUPN4260264788, HLCUSS5260218029, HLCUSS5260224404, HLCUSS5260224766, HLCUSS5260238551
- `updateMain` com `container_status: 'NAO_ENCONTRADO'`, `last_event: 'Sem informação no armador'`

**Com eventos completos (28 MBLs HLCU):**
- Todos os processos HLCU com container, origem/destino, eventos e ETA
- Delete history existente → Insert novos eventos → Update main com last_event, navio, container_status, ETA

**ONE (ONEY) — processos com formato simplificado (6 MBLs):**
- ONEYHAMF95967300 (2 containers: FDCU0480240, TCLU8492630), ONEYHAMF95967301, ONEYHAMFA1465500, ONEYHAMFA1479300, ONEYHAMFA1482400, ONEYHAMFA1484600, ONEYHAMFA1791700, ONEYHAMFA6038600
- Status "Empty Container Returned" → `container_status: 'DLV'`

**ONEYSAOG05421700 — com eventos de embarque:**
- Container SEGU4975077, eventos de release → gate in → loaded → vessel departed
- ETA 2026-03-27, destino ANTWERP

**ONEYMEXG00992700:**
- Container ONEU1106858, status "Empty Container Returned" → DLV

### Arquivo modificado
`supabase/functions/olimpo-proxy/index.ts`

- Inserir Batch 6 logo antes do fechamento do bloco `bulk_manual_update_sea` (antes da linha `await client.close()` na ~8408)
- Usar os mesmos helpers `insertEvent` e `updateMain` já definidos
- Nota: HLCUPN4260353977 já foi atualizado no Batch 5 — será ignorado/sobrescrito
- HLCUSS5251266740 aparece duplicado na lista do usuário — será inserido uma única vez

### Mapeamento de event_code
- Gate out empty → GOE
- Arrival in → ARR
- Loaded → CRG
- Vessel departed → DEP
- Vessel arrived → ARR
- Discharged → DCH
- Departure from → DEP
- Gate in empty → GIE
- Empty Container Returned → GIE (devolvido)
- Empty Container Release → GOE
- Gate In to Outbound Terminal → ARR
- Loaded on Vessel → CRG

### Status finais por tipo
- Processos com "Gate in empty" ou "Empty Container Returned" → `container_status: 'DLV'`
- Processos com "Vessel departed" como último evento → `container_status: 'DEP'`
- Processos com apenas "Gate out empty" → `container_status: 'GOE'`
- Processos com "Arrival in" como último → `container_status: 'ARR'`
- Processos sem informação → `container_status: 'NAO_ENCONTRADO'`

