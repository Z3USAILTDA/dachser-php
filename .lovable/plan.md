# Popular a coluna SLA do CCT

## Problema
Na lista `/air/cct`, a coluna **SLA** mostra sempre badge verde "OK" sem horas restantes nem tipo de voo. O motivo é que em `src/hooks/useCCTData.ts` o objeto `sla_info` de cada processo está **hardcoded** (`status: 'OK'`, todos os demais campos `null`), mesmo já tendo `data_decolagem` no cache e o status canônico derivado dos eventos.

## Regras de SLA (já em memória)
Conforme `mem://cct/sla-calculation-rules-v3`:

- **VOO_CURTO** (origem América do Sul): limite = `data_decolagem + 30 min`.
- **VOO_LONGO** (intercontinental): limite = `eta − 4h` ou, se ETA ausente, `data_decolagem + 4h`.
- **CUMPRIDO** (badge esmeralda) quando `data_manifestacao_cct` existir **OU** o status oficial alcançar `MANIFESTADA` ou qualquer evento posterior na hierarquia (`EM_AREA_TRANSFERENCIA`, `RECEPCIONADA`, `EM_TROCA_RECINTOS`, `EM_TRANSITO_TERRESTRE`, `ENTREGUE`).
- **Excluir** (sem badge SLA / mostrar `CUMPRIDO`) para status finais (`ENTREGUE`).
- Faixas: `OK` (>4h restantes), `ALERTA` (≤4h e >0), `CRITICO` (≤1h e >0), `VENCIDO` (<0).

## Implementação (mínima e cirúrgica)

### 1. `src/utils/cctSLA.ts` (novo, pequeno helper)
Função pura `computeSLAInfo({ depDatetime, eta, originAirport, status, dataManifestacao })` retornando `SLAInfo` com:
- `tipoVoo` baseado em `originAirport` (lista de aeroportos sul-americanos: `EZE, SCL, BOG, LIM, UIO, CCS, MVD, ASU, GRU/etc internos não se aplicam → todo origem fora-Brasil/SA = VOO_LONGO`).
- `slaLimite` calculado conforme regras acima.
- `status` (`CUMPRIDO` se cumprido pelo status hierárquico OU `data_manifestacao_cct`; senão `OK/ALERTA/CRITICO/VENCIDO` por horas restantes vs. `slaLimite`).
- `horasRestantes` arredondado em horas.
- `slaConfigHoras` (30 min ou 4 h conforme tipo de voo).

Hierarquia de cumprimento:
```
INFORMADA < MANIFESTADA < EM_AREA_TRANSFERENCIA < RECEPCIONADA < EM_TROCA_RECINTOS < EM_TRANSITO_TERRESTRE < ENTREGUE
```
Cumprido = índice ≥ índice de `MANIFESTADA`.

### 2. `src/hooks/useCCTData.ts`
- Importar `computeSLAInfo`.
- Substituir o bloco hardcoded `sla_info` (linhas ~304-311) pela chamada real, passando `data_decolagem`, `aeroporto_origem`, `finalStatus` e `data_manifestacao_cct` (que hoje é `null` mas alimentará a regra fallback via status hierárquico).
- Atribuir `sla_status: sla_info.status` e `sla_limite: sla_info.slaLimite`.
- `tipo_voo: sla_info.tipoVoo` em `status_atual`.

### 3. Sem mudanças em UI
`SLAInfoBadge` já consome `slaInfo.status`, `horasRestantes`, `tipoVoo` e `slaLimite` — passará a exibir corretamente assim que o cálculo retornar valores.

## Arquivos alterados
- `src/utils/cctSLA.ts` (novo)
- `src/hooks/useCCTData.ts` (substitui ~10 linhas no `mapRowToProcessoCCT`)

## Não faz parte
- Não altera Edge Functions (`mariadb-proxy`).
- Não altera schema MariaDB.
- Não altera lógica de timeline (já corrigida).
- Não altera badge/UI da tabela.
