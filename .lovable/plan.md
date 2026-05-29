## Diagnóstico
O estado `isLoadingData` começa em `false` (linha 505), então no primeiro render — antes do `useEffect` disparar `fetchMblData` — a condição cai no "Nenhum MBL encontrado". Mesmo após o fetch iniciar, se algum caminho (ex.: cache/usuário não-admin) não disparar `setIsLoadingData(true)`, o texto antigo continua aparecendo.

## Mudança
Arquivo: `src/pages/ContainerTracking.tsx`

1. Linha 505 — inicializar `useState(true)` para `isLoadingData`, garantindo que o spinner "Buscando MBLs..." apareça desde o primeiro render.
2. Linha 970 — quando o usuário não é admin, manter `setIsLoadingData(false)` (já existe) para que o empty state apareça normalmente nesse caso.

Edição surgical: só duas alterações pontuais, nenhuma refatoração.
