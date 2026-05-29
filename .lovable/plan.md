## Contexto
- Pré-embarque (aéreo) em `src/pages/air/TrackingAereo.tsx` linhas 1262-1270 já mostra um bloco "CARREGANDO DADOS... / Buscando em companhias aéreas..." enquanto `isLoadingData` é true.
- Pós-embarque (CCT) em `src/pages/cct/CCTDashboard.tsx` linha 361-365 só mostra um skeleton pulse (`<div className="h-96 ... animate-pulse" />`) enquanto `isLoading` é true — sem texto explicativo.

## Mudança
Arquivo: `src/pages/cct/CCTDashboard.tsx`

Substituir o skeleton da aba dashboard (linhas 361-365) por um bloco com:
- `Loader2` (já importado no projeto) animado em `#ffc800`
- Título `CARREGANDO DADOS...` em uppercase
- Subtítulo `Buscando atualizações`
- Mantém o mesmo container arredondado/borda do skeleton atual (`h-96 rounded-2xl bg-[rgba(5,6,18,0.9)] border ...`) para preservar o layout.

Verificar import de `Loader2` no topo do arquivo; adicionar se não estiver.

Edição cirúrgica, sem mexer em ProcessosTable, outras abas (analytics/excecoes) ou lógica.
