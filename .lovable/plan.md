
Objetivo: corrigir de fato os filtros de Classificação, Etapa atual, Tempo na Etapa e Comprovante sem mexer em outras áreas.

O que a análise mostrou
- Os filtros visuais existem, mas ainda há inconsistências na base comparada.
- “Tempo na Etapa” hoje usa `updatedAt` via `calcularTempoNaEtapa(voucher)`. Isso mede “última alteração no voucher”, não “entrada na etapa”. Qualquer update (anexo, validação, comentário, automação) distorce Atenção/Crítico.
- Classificação, Etapa e Comprovante ainda comparam strings quase “cruas” do banco (`urgenciaTipo`, `etapaAtual`, `statusComprovante`). Se vier espaço, case diferente ou valor alternativo, o filtro falha silenciosamente.
- O filtro por papel também interfere: `roleFilteredVouchers` limita a lista antes do filtro da tabela. Então o usuário pode selecionar uma etapa e ainda assim não ver todos os itens esperados em alguns perfis.

Plano de correção
1. Normalizar os valores antes de filtrar em `src/pages/esteira/EsteiraIndex.tsx`
- Criar normalização defensiva para:
  - `etapaAtual`
  - `urgenciaTipo`
  - `statusComprovante`
- Comparar sempre valores já normalizados, com `trim()` e `toUpperCase()`.
- Aplicar isso especificamente nos filtros:
  - Classificação
  - Etapa atual
  - Comprovante

2. Corrigir a origem lógica do filtro “Tempo na Etapa”
- Ajustar a lógica atual para não tratar `updatedAt` como entrada real de etapa.
- Como o código atual não possui um campo dedicado de “entrada na etapa”, a correção deve usar uma abordagem segura:
  - parar de classificar errado etapas sem SLA;
  - evitar que concluído/cancelado/sem SLA caiam em atenção/crítico;
  - alinhar a função usada no filtro com a função usada na tabela.
- Se existir histórico/log suficiente no voucher, usar a última mudança de etapa como base; se não existir, manter fallback explícito e consistente.

3. Alinhar cálculo de SLA entre tabela e filtro
- Hoje a tabela usa `getSlaStatus(...)` e o filtro replica lógica parecida.
- Centralizar a regra para ambos usarem exatamente a mesma classificação:
  - `ok`
  - `warning`
  - `critical`
- Isso evita casos em que o badge mostra uma coisa e o filtro retorna outra.

4. Revisar a interferência de `roleFilteredVouchers`
- Manter a segurança/visibilidade por papel.
- Mas ajustar a regra para que, quando o usuário escolhe explicitamente uma etapa no filtro, a lista-base não esconda indevidamente resultados daquela etapa.
- Revisar especialmente os perfis:
  - OPERACAO
  - FISCAL
  - SUPERVISOR

Arquivos a ajustar
- `src/pages/esteira/EsteiraIndex.tsx`
  - normalização dos campos filtrados
  - correção da lógica de SLA/tempo na etapa
  - ajuste do filtro por etapa dentro do recorte por papel
- `src/components/esteira/VoucherTable.tsx`
  - reutilizar a mesma regra central de SLA/status exibido
- `src/types/voucher.ts`
  - se necessário, extrair/helper compartilhado para cálculo de status SLA consistente

Resultado esperado
- Classificação:
  - “Urgente Real”, “Urgente Auto” e “Normal” mostram apenas os vouchers corretos.
- Etapa atual:
  - Operacional, Fiscal, Supervisor, Financeiro, Robô, Concluído, Ajuste Op., Ajuste Fiscal e Cancelado filtram corretamente.
- Tempo na Etapa:
  - Atenção e Crítico param de usar falsos positivos causados por `updatedAt`.
- Comprovante:
  - Anexado e Validado passam a refletir exatamente o status real exibido na linha.

Detalhe técnico importante
- A causa mais séria remanescente é estrutural: “Tempo na Etapa” está baseado em `updatedAt`, que não representa entrada na etapa. Se quisermos precisão total, o ideal depois é persistir `data_entrada_etapa` ou derivar isso do histórico de mudança de etapa. Nesta correção, eu priorizaria primeiro eliminar os erros atuais sem expandir escopo.

Validação
- Testar cada filtro isoladamente:
  - Classificação: Normal / Urgente Real / Urgente Auto
  - Etapa: todas as etapas listadas
  - Tempo na Etapa: OK / Atenção / Crítico
  - Comprovante: Pendente / Anexado / Validado
- Testar também combinando dois filtros ao mesmo tempo para confirmar que não há interferência cruzada.
