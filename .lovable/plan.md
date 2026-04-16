
Diagnóstico

- O problema não é só “tamanho do limite”. Pelos logs e pela rede, a tela `/fin/esteira` está gerando um pico de chamadas simultâneas ao `mariadb-proxy`.
- Evidência:
  - `get_vouchers_combined` carrega a lista.
  - Em seguida, a UI dispara vários `get_voucher_filhos` quase ao mesmo tempo.
  - O mesmo `master_id` aparece repetido nos logs em milissegundos diferentes.
  - Hoje isso acontece em mais de um ponto:
    - `EsteiraIndex.tsx`: faz preload dos filhos de todos os masters para busca.
    - `VoucherTable.tsx`: busca filhos novamente por voucher visível, hoje em loop.
    - `VoucherDetailsView.tsx`, `VoucherFiscalActions.tsx` e `DesmembrarMasterDialog.tsx`: fazem novas buscas sob demanda.
- Além disso, a própria mensagem do erro ainda diz `current value: 30`, então também precisamos validar se a alteração no MariaDB foi aplicada no escopo correto.

Plano de correção

1. Eliminar o preload massivo da tela principal
- Remover em `src/pages/esteira/EsteiraIndex.tsx` o efeito que hoje busca filhos para todos os masters após cada carga da lista.
- Substituir a busca por SPO filho por uma abordagem lazy:
  - quando houver texto no campo de busca, chamar uma ação backend específica que retorne apenas os `master_id` compatíveis com o prefixo pesquisado;
  - assim a tela deixa de abrir dezenas de conexões só para montar cache de busca.

2. Trocar loop de chamadas por batch na tabela
- Em `src/components/esteira/VoucherTable.tsx`, parar de chamar `get_voucher_filhos` um a um.
- Reusar a ação já existente `get_voucher_filhos_batch` para os masters visíveis da página atual.
- Adicionar guarda de cache/in-flight para não repetir request do mesmo master em rerender/paginação.

3. Manter buscas de filhos realmente sob demanda
- `VoucherDetailsView.tsx`, `VoucherFiscalActions.tsx` e `DesmembrarMasterDialog.tsx` devem continuar carregando filhos apenas quando o usuário abrir a visualização correspondente.
- Adicionar proteção para não refazer a mesma busca se os filhos já estiverem carregados para aquele master na sessão atual.

4. Ajuste pontual no backend para suportar a nova busca sem explosão de conexões
- Em `supabase/functions/mariadb-proxy/index.ts`, adicionar uma ação leve para busca de masters por SPO filho, algo como:
  - entrada: prefixo digitado;
  - saída: lista de `voucher_master_id`.
- Manter `get_voucher_filhos_batch` como caminho principal para listagens.
- Não mexer na estrutura geral do arquivo; mudança cirúrgica.

5. Validar o MariaDB fora do código
- Confirmar se o valor foi aplicado de verdade para o usuário que a Edge Function usa:
  - `SHOW VARIABLES LIKE 'max_user_connections';`
  - `SELECT user, host, max_user_connections FROM mysql.user WHERE user = 'root';`
- Se o erro continuar mostrando `30`, revisar persistência/restart/escopo do ajuste no servidor.

6. Verificação final
- Revalidar:
  - carga inicial da esteira;
  - refresh manual;
  - busca por SPO;
  - abertura de detalhes de master;
  - tela fiscal de master;
  - modal de desmembrar.
- Resultado esperado:
  - 1 chamada para lista principal;
  - no máximo 1 chamada batch para filhos por bloco visível;
  - chamadas isoladas só quando o usuário abrir detalhes.
- Isso reduz drasticamente o pico concorrente, que é o motivo real de o erro continuar aparecendo mesmo após aumentar o limite.

Detalhes técnicos

Arquivos a ajustar:
- `src/pages/esteira/EsteiraIndex.tsx`
- `src/components/esteira/VoucherTable.tsx`
- `src/components/esteira/VoucherDetailsView.tsx`
- `src/components/esteira/VoucherFiscalActions.tsx`
- `src/components/esteira/DesmembrarMasterDialog.tsx`
- `supabase/functions/mariadb-proxy/index.ts`

Motivo central:
- O sistema hoje abre conexões demais em paralelo para resolver filhos de masters.
- Mesmo com limite maior, esse padrão continua frágil; o certo é reduzir a tempestade de requests na origem.
