
Objetivo: fazer a tabela inicial (`/air/cct`) já abrir com o status correto (incluindo fonte complementar), sem depender de entrar no detalhe.

Diagnóstico (com base no código + logs):
1) O `get_cct_shipments` já tenta enriquecer status com fonte complementar (RFB) no Step 2.5.
2) Porém o Step 2.5 está falhando e sendo ignorado como “non-fatal”:
   - Log: `Unknown column 'partes' in 'field list'`.
3) Quando isso falha, o backend devolve só status de tracking/base para boa parte dos processos; por isso a tabela inicial nasce “atrasada”.
4) A tela de detalhe parece “corrigir” porque usa outra rota (`get_cct_events`) que lê `partesEstoque` e reconstrói eventos/status.

Plano de correção:
1) Tornar o Step 2.5 resiliente ao schema real da tabela complementar
   - Arquivo: `supabase/functions/mariadb-proxy/index.ts` (case `get_cct_shipments`).
   - Remover dependência rígida de colunas opcionais (ex.: `partes`) no SELECT principal.
   - Implementar fallback seguro:
     - tentativa A: query completa;
     - se erro de coluna inexistente, retry com query reduzida (somente campos garantidos).
   - Resultado: o enrichment não “cai inteiro” por causa de 1 coluna opcional.

2) Garantir merge de status por hierarquia canônica já na resposta da listagem
   - Manter a regra de precedência (`CCT_STATUS_ORDER`) e aplicar sempre:
     `tracking/base -> leadcomex (se mais avançado) -> complementar (se mais avançado)`.
   - Nunca rebaixar para status de aguardando quando já existe status operacional mais avançado.

3) Normalizar chave MAWB no enrichment para evitar falsos “não encontrados”
   - Criar normalização única para lookup (`trim`, uppercase, tratar variações com/sem separadores).
   - Gravar e buscar no `cctRfbMap` com a mesma normalização (set/get consistentes).

4) Alinhar exibição da tabela para refletir o status consolidado do backend
   - Arquivo: `src/components/cct/ProcessosTable.tsx`.
   - Status (badge) deve priorizar `status_cct_oficial` já consolidado do backend.
   - Fonte complementar na UI vira reforço visual, não fonte paralela concorrente.
   - Evita divergência entre “Manifestação” e “Status”.

5) Observabilidade para evitar regressão silenciosa
   - No `mariadb-proxy`, registrar contadores no log:
     - quantos MAWBs tentaram enriquecer,
     - quantos enriqueceram com sucesso,
     - quantos caíram em fallback de schema.
   - Se enrichment falhar 100%, log explícito de alerta.

Validação (aceite):
1) Abrir `/air/cct` com hard refresh e confirmar que o status já vem correto sem abrir detalhe.
2) Comparar 3 casos:
   - com tracking + complementar,
   - só complementar,
   - sem complementar (deve manter tracking).
3) Conferir consistência entre:
   - coluna “Status” na tabela,
   - coluna “Manifestação”,
   - header/timeline do detalhe.
4) Ver logs da função para confirmar que não há mais erro `Unknown column 'partes'`.

Impacto esperado:
- A correção principal é backend (fonte da verdade da lista).
- A tabela inicial deixa de “nascer desatualizada”.
- O detalhe continua consistente, mas não será mais necessário para “corrigir” visualmente o status.
