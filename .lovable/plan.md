

## Plano: Corrigir hierarquia FOH no timeline modal e na tabela principal

### Diagnóstico

A screenshot mostra o AWB 724-85006073 com **RCS** marcado como "Mais recente" acima de **FOH**, ambos com timestamp 19/03/2026 13:15. O problema está em **dois locais**:

1. **Timeline Modal (`AwbTimelineModal.tsx`, linha 112)**: O mapa `IATA_WEIGHT` não inclui `FOH`. Sem entrada, FOH recebe peso 0, perdendo para RCS (peso 10) no desempate.

2. **Edge function (`fetch-status-aereo`)**: O código fonte tem `FOH: 16` correto, mas pode não estar deployado. A função precisa ser reimplantada.

### Ações

1. **Adicionar FOH ao IATA_WEIGHT no AwbTimelineModal.tsx** (linha 112):
   - Alterar `SCR: 15,` para `SCR: 15, FOH: 16,`

2. **Reimplantar a edge function `fetch-status-aereo`** para garantir que a versão com FOH: 16 esteja em produção.

### Resultado esperado
- Timeline: FOH aparece como "Mais recente" acima de RCS quando ambos têm o mesmo timestamp.
- Tabela principal: Status resolve para FOH em vez de RCS/BKD.

