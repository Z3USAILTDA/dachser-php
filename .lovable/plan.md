

## Plano: Corrigir SLA para considerar hierarquia de eventos CCT

### Problema
Atualmente, o SLA só é marcado como "CUMPRIDO" quando o campo `data_manifestacao_cct` está preenchido. Porém, se o `status_cct_oficial` já atingiu **MANIFESTADA** (ou qualquer status posterior na hierarquia), o SLA de manifestação já foi cumprido — independentemente do campo de data.

### Hierarquia de eventos (conforme especificação)
1. INFORMADA
2. MANIFESTADA ← a partir daqui, SLA = CUMPRIDO
3. EM_AREA_TRANSFERENCIA
4. RECEPCIONADA
5. EM_TROCA_RECINTOS / EM_TRANSITO_TERRESTRE
6. ENTREGUE

### Alteração

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts` (linha ~4088-4089)

Trocar a lógica atual:
```typescript
let slaStatus: string = dataManifestacao ? 'CUMPRIDO' : calcularSlaStatus(slaLimite);
```

Por uma que também verifique se o `status_cct_oficial` já atingiu MANIFESTADA ou além:
```typescript
const STATUS_MANIFESTADO_OU_ALEM = [
  'MANIFESTADA', 'EM_AREA_TRANSFERENCIA', 'RECEPCIONADA',
  'EM_TROCA_RECINTOS', 'EM_TRANSITO_TERRESTRE', 'ENTREGUE'
];
const jaManifestado = dataManifestacao || STATUS_MANIFESTADO_OU_ALEM.includes(cctStatusForOutput);
let slaStatus: string = jaManifestado ? 'CUMPRIDO' : calcularSlaStatus(slaLimite);
```

Nota: `cctStatusForOutput` já contém o status canônico CCT calculado na linha 4152. Basta mover essa atribuição para antes do cálculo do SLA (ou usar `row.status_cct_oficial` diretamente).

### Impacto
- Processos que já passaram de MANIFESTADA (ex: RECEPCIONADA, EM_AREA_TRANSFERENCIA) aparecerão com badge "✓ Cumprido" em vez de mostrar contagem regressiva de SLA.
- Sem impacto em processos ainda em status INFORMADA — esses continuam com o cálculo normal de SLA.

