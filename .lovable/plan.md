
# Alterar badge "Ultima atualizacao" para mostrar data da base

## O que muda

O badge "Ultima atualizacao" na tela da Regua de Cobranca (`/fin/regua`) atualmente mostra o horario em que a tela foi carregada (frontend `new Date()`). Isso confunde o usuario, pois parece que a base foi atualizada naquele momento.

A mudanca e simples: usar o valor `dbStats.lastUpdate` que ja vem do backend (query `MAX(data_insert)` da tabela `t_dados_financeiro_nfs`) em vez do timestamp local.

## Alteracoes

**Arquivo:** `src/pages/ReguaCobranca.tsx`

1. Remover o state `lastSync` e a linha que o popula com `new Date()` no `finally` do `fetchCounts`.
2. No badge (linha ~581), substituir `{lastSync || "..."}` por uma formatacao do `dbStats?.lastUpdate` usando as funcoes `formatDateTimeBR` / `formatDistanceToNow` ja utilizadas em outros paineis do projeto.
3. O badge mostrara algo como "ha 2 horas" ou "10/02/2026 14:30" -- a data real da ultima insercao na base de dados.

## Secao tecnica

- O `dbStats.lastUpdate` ja esta disponivel via `get_financeiro_nfs_stats` (query `MAX(data_insert)`).
- A formatacao seguira o mesmo padrao do `ReguaDbStatsPanel` (que ja usa `formatDistanceToNow` com locale `ptBR`).
- Nenhuma alteracao de backend necessaria.
