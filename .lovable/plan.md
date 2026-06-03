## Diagnóstico

Conferi a fonte e o destino dos dados dos containers exibidos (ex.: FCIU5817713, MSDU4392569, MSCU4363443, MEDU2362172, MSCU4484790):

- Em `t_sea_tracking_current` o `shipping_line` **está preenchido** ("MSC", "Mediterranean Shipping Company").
- Em `t_dachser_demurrage_containers` o `armador` está **NULL** e `last_sync_at = 2026-03-20` — ou seja, esses registros **não foram atualizados** pelo sync recente (rodado agora em junho/2026). O sync atual processou só 49 das 274 linhas exibidas.

A causa dos "-" na tela é uma combinação de dois fatores:

### 1. Filtro do `demurrage_sync_from_tracking` exclui a maioria dos containers
O WHERE exige `tipo_processo IN ('SEA IMPORT','SEA EXPORT')` **e** um `container_status`/`last_event` dentro de uma lista curta (`DISCHARGED`, `ARRIVED`, `GATE-OUT`, `RETURNED`, etc.).

Mas no `t_sea_tracking_current` muitos containers ativos vêm com:
- `tipo_processo = NULL` (ex.: MSCU4484790, MSDU4392569, TRHU2296101) — caem fora do filtro.
- `container_status` fora da lista esperada: "GOD", "Empty received at CY", "Loaded on Vessel", "Full Transshipment Discharged", "Empty returned by Truck" — também caem fora.

Resultado: o registro velho (com `armador=NULL`, sem datas históricas, sem HBL) permanece no Demurrage e a tela mostra "-".

### 2. Os "-" restantes têm causas próprias
- **HBL = "-"**: o sync nunca preenche `hbl` em `t_dachser_demurrage_containers` (`t_sea_tracking_current` não tem HBL — HBL vem de outra tabela MBL/HBL).
- **Demurrage (USD) e Total BRL = "-"**: dependem de tarifa em `t_dachser_demurrage_rates` para `(armador, tipo_container, perfil)`. Sem `armador`, não há match → valor nulo.
- **Dias Rest. = 0d**: `data_atracacao` antiga (fev/2026) + free time 14 dias já venceu → resto = 0 (cálculo correto, é só consequência do dado velho).

## Mudanças propostas

### A. Backend — `demurrage_sync_from_tracking` (em `supabase/functions/mariadb-proxy/index.ts`)

1. **Inferir tipo_processo quando vier NULL** em `t_sea_tracking_current`:
   - Se `origem` for porto BR e `destino` estrangeiro → `SEA EXPORT`.
   - Se `destino` for BR → `SEA IMPORT`.
   - Sem heurística possível → manter SEA IMPORT como default (já é o caso da maioria).
   Aplicar antes do filtro WHERE e dentro do mapeamento de gravação.

2. **Ampliar a janela de status** para casar com o que `t_sea_tracking_current` realmente tem:
   - IMPORT: adicionar `'GOD'`, `'FULL TRANSSHIPMENT DISCHARGED'`, `'EMPTY RECEIVED AT CY'`, `'EMPTY RETURNED'`, `'EMPTY RETURNED BY TRUCK'`, `'LOADED ON VESSEL'` (containers em trânsito que já têm demurrage potencial).
   - EXPORT: adicionar `'LOADED ON VESSEL'`, `'EMPTY RECEIVED AT CY'`.
   - Manter as exclusões de `PREFIX NOT FOUND` / `NAO_ENCONTRADO`.

3. **Sempre gravar `armador`** a partir de `t_sea_tracking_current.shipping_line` (normalizando "Mediterranean Shipping Company" → "MSC", "Hapag-Lloyd" → "HAPAG-LLOYD" etc. — mesma normalização que `normalizeCarrier` em `_shared/demurrageCalc.ts`).

4. **Preencher HBL** quando disponível: subquery em `dados_dachser.t_consulta_hbl` (ou tabela equivalente já usada por `/sea/tracking`) por `mbl_id` + `container`. Se não houver match, mantém vazio.

5. Após o deploy, rodar `demurrage_sync_from_tracking` uma vez para realinhar os 274 containers.

### B. Frontend
Sem mudanças — `DemurrageMonitor` já consome `armador`, `hbl`, `free_time`, `dias_restantes`. Os "-" somem automaticamente quando os campos passarem a vir preenchidos.

## Fora de escopo
- Não mexer em `t_dachser_demurrage_rates` (tarifas). Se mesmo com armador preenchido o valor seguir "-", é porque não há tarifa cadastrada para aquele `(armador, tipo_container, cliente)` — caso de cadastro, não de bug.
- Não alterar `_shared/demurrageCalc.ts` nem as regras de ATA/devolução.

## Critérios de aceite
1. Após sync, **todos** os containers ativos da Cronos/tracking aparecem no Demurrage Monitor (não apenas 49).
2. Coluna **Armador** preenchida (MSC, HAPAG-LLOYD, etc.) sempre que `t_sea_tracking_current.shipping_line` existir.
3. Coluna **HBL** preenchida quando houver vínculo MBL→HBL.
4. Demurrage USD/Total BRL passam a aparecer para containers com tarifa cadastrada (continua "-" quando não há tarifa — comportamento esperado).
