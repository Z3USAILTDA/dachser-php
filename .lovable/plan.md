

## Ajustes na Esteira do Financeiro

### 1. Filtro por Tipo de Execucao na aba Pagamentos

**Arquivo**: `src/components/esteira/PagamentosTab.tsx`

O filtro `filterTipoExecucao` ja existe (linha 118), mas nao ha um Select visivel na UI para filtrar por valores granulares. Sera adicionado um `Select` na barra de filtros com as opcoes:
- Todos
- Manual
- Remessa 10h
- Remessa 15h

### 2. Marcar Pronto em Lote

**Arquivo**: `src/components/esteira/PagamentosTab.tsx`

Adicionar botao "Marcar Pronto" na barra de acoes em lote (linhas 662-689), ao lado de "Definir Tipo Execucao". A funcao `handleBatchSetReady` vai:
- Iterar sobre todos os IDs selecionados
- Verificar se cada um tem `tipo_execucao_pagamento` definido
- Chamar `handleSetReady` para cada um
- Exibir toast com resultado (quantos marcados / quantos falharam)

### 3. Visibilidade do usuario OPERACAO

**Arquivo**: `src/pages/esteira/EsteiraIndex.tsx` (linhas 1180-1187)

Atualmente o filtro de OPERACAO mostra vouchers criados pelo usuario, sob responsabilidade dele, ou em A_PROCESSAR. O usuario pediu que OPERACAO veja vouchers nas etapas `OPERACAO` **e** `A_PROCESSAR`.

Alterar de:
```text
v.criadoPorUserId === currentUserId ||
v.responsavelOperacaoUserId === currentUserId ||
v.etapaAtual === "A_PROCESSAR"
```

Para:
```text
v.etapaAtual === "OPERACAO" ||
v.etapaAtual === "A_PROCESSAR"
```

Isso garante que qualquer usuario com funcao OPERACAO veja todos os vouchers nessas duas etapas.

### 4. Auto-filtro de etapa por funcao do usuario

**Arquivo**: `src/pages/esteira/EsteiraIndex.tsx`

Adicionar um `useEffect` que, apos `useUserRole()` carregar, define o filtro de "Etapa Atual" automaticamente:

| Funcao | Filtro default |
|---|---|
| OPERACAO | OPERACAO |
| FISCAL | FISCAL |
| SUPERVISOR | SUPERVISOR |
| FINANCEIRO | FINANCEIRO |
| ADMIN / GESTOR | all (sem filtro) |

O usuario pode alterar manualmente a qualquer momento.

### Resumo de arquivos

| Arquivo | Mudanca |
|---|---|
| `src/components/esteira/PagamentosTab.tsx` | Select para tipo execucao + botao batch "Marcar Pronto" |
| `src/pages/esteira/EsteiraIndex.tsx` | Filtro OPERACAO mostra etapas OPERACAO+A_PROCESSAR; auto-filtro por funcao |

