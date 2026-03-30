
Objetivo: fazer MSC e ONE passarem a aparecer como “consultados” no grid.

Diagnóstico
- MSC não está “sem consulta”: a chamada para `draft-track-msc` acontece e retorna sucesso.
- O problema do MSC ocorre depois, ao salvar em `draft-save-tracking`: a API MSC devolve `eta` como `10/04/2026` e a tabela MariaDB espera data em formato MySQL/ISO. Por isso o save falha e o processo continua sem registro em `t_consulta_armador`, ficando como “Nunca Consultado”.
- ONE segue falhando na origem do roteamento/detecção: no grid e no painel manual a lógica reconhece apenas prefixo `ONEY`, mas o projeto já considera vários prefixos válidos da ONE (`ONEU`, `NYKU`, `MOLU`, `KKFU`, `MOAU`, `KKLU`). Esses casos caem em Hapag indevidamente e nunca consultam a função `draft-track-one`.
- Há ainda um ajuste secundário importante: `viewDetails` sempre chama Hapag, então os detalhes de MSC/ONE podem ficar inconsistentes mesmo após o save.

Arquivos a ajustar
1. `supabase/functions/draft-save-tracking/index.ts`
2. `src/components/draft/DraftDataGrid.tsx`
3. `src/components/draft/HapagTrackerPanel.tsx`

Implementação proposta

1. Normalizar datas antes de salvar no MariaDB
- Em `draft-save-tracking`, adicionar uma função utilitária para converter:
  - `dd/MM/yyyy` -> `yyyy-MM-dd`
  - manter `yyyy-MM-dd` como está
  - retornar `null` para vazio ou inválido
- Aplicar essa normalização especificamente em `etd` e `eta` antes do `execute`.
- Manter `NULLIF(?, '')`, mas passar o valor já normalizado para evitar novo erro de data inválida.

Resultado esperado:
- MSC deixa de falhar no save.
- Assim que salvar, o registro passa a existir em `t_consulta_armador` e o grid deixa de mostrar “Nunca Consultado”.

2. Corrigir a detecção de armador para ONE
- Em `DraftDataGrid.tsx`, ampliar `detectCarrier` para reconhecer todos os prefixos da ONE já usados no mapeamento central do projeto:
  - `ONEY`, `ONEU`, `NYKU`, `MOLU`, `KKFU`, `MOAU`, `KKLU`
- Fazer o mesmo em `HapagTrackerPanel.tsx`, para manter consistência entre grid e busca manual.

Resultado esperado:
- Processos ONE deixam de ser enviados para Hapag por engano.
- A função `draft-track-one` passa a ser usada para todos os prefixos válidos da ONE.

3. Ajustar consulta de detalhes para multi-armador
- Em `DraftDataGrid.tsx`, mudar `viewDetails` para usar a mesma lógica de roteamento por armador em vez de chamar sempre `draft-track-hapag-multi`.

Resultado esperado:
- O detalhe do processo mostra dados do armador correto para MSC e ONE.

4. Tratar feedback de erro de save no grid
- Em `trackSingleMBL`, validar também o retorno de `draft-save-tracking`.
- Se o tracking veio com sucesso mas o save falhou, mostrar toast específico de “consulta realizada, mas falhou ao salvar”.
- Não mascarar isso como simples erro genérico.

Resultado esperado:
- Fica claro quando o problema é API do armador versus persistência no banco.

O que não muda
- Nenhuma mudança de layout.
- Nenhuma alteração estrutural nas tabelas.
- Nenhuma mudança no fluxo de filtros e paginação.
- Não é necessário criar novas funções backend.

Resumo da causa raiz
- MSC: consulta funciona, mas não persiste por causa do formato de data.
- ONE: parte dos processos nem chega à função correta porque a detecção atual cobre só `ONEY`.

Validação após implementar
- Reconsultar um MBL MSC que hoje retorna `eta` em formato `dd/MM/yyyy` e confirmar que salva.
- Reconsultar um processo ONE com prefixo diferente de `ONEY` (por exemplo `NYKU` ou `MOLU`) e confirmar que agora roteia para `draft-track-one`.
- Abrir o detalhe de um MSC e de um ONE para confirmar que o armador correto está sendo usado na consulta.
