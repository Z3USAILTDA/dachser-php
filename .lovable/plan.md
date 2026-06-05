# Botão "Resolver troca de master" inline na coluna Ações

Na tabela de `/air/tracking-aereo`, adicionar um terceiro botão na coluna **Ações** que aparece apenas para linhas com discrepância de troca de master pendente. Ao clicar, abre o modal `discrepancyModal` já existente, pré-carregado com a discrepância correspondente (match por `hawb` da linha + `awb` contido em `awbs_candidatos`).

## Mudanças
- `src/pages/air/TrackingAereo.tsx`:
  - Após o botão `ExternalLink` (linha ~1415), renderizar condicionalmente um botão âmbar com ícone `Replace` quando `hasMasterDiscrepancy(awb)` for verdadeiro.
  - Localizar o registro em `discrepancies` cujo `hawb` (upper/trim) bate com o da linha e cujo `awbs_candidatos` contém o AWB da linha.
  - `onClick` → `setDiscrepancyModal({ open: true, disc, chosen: "" })`.
  - Tooltip: "Resolver troca de master".

Sem mudanças em backend, sem novas actions; reaproveita o fluxo `air_master_discrepancy_resolve` já existente.
