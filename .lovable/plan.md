## Objetivo

Restaurar o visual original da visão expandida do MBL (sub-tabela `Container | Armador | Status | Último Evento | ETA Tracking | ETA Cadastrado | Última Atualização`) e aplicar três ajustes mínimos pedidos:

1. Em vez de uma linha por container, mostrar **uma única linha** representando o último evento do MBL — na coluna **Container**, listar todos os containers do MBL juntos.
2. Adicionar um botão **`+`** no canto direito dessa linha que, ao ser clicado, abre **linhas extras logo abaixo** com os eventos anteriores, em ordem cronológica, usando exatamente as mesmas colunas/visual.
3. Adicionar uma nova coluna **`Data/Hora`** (primeira coluna da sub-tabela) com o `event_datetime` do evento mostrado em cada linha (último evento + cada evento histórico).

Nenhuma outra mudança de layout, cores, mapa VesselFinder, paginação, filtros, edge functions ou backend.

## Escopo

Arquivo único: `src/pages/ContainerTracking.tsx`, apenas dentro do bloco `{isExpanded && <tr>…</tr>}` (linhas ~2772–2851).

## Mudanças detalhadas

### 1. Restaurar sub-tabela original

Remover o conjunto introduzido na última iteração:
- Bloco "Container chips" (linhas ~2790–2808).
- Bloco "Events timeline" com colunas Data/Hora · Código · Descrição · Local · Navio · Container (linhas ~2810–2848).

Substituir por uma única `<table>` com o cabeçalho original acrescido de **Data/Hora** como primeira coluna:

```text
Data/Hora | Container | Armador | Status | Último Evento | ETA Tracking | ETA Cadastrado | Última Atualização
```

Manter o `VesselFinderMap` exatamente como está hoje (com a condicional `shouldShowVesselMap`).

### 2. Linha principal agregada (último evento)

Renderizar **uma única `<tr>` agregada** com:
- `Data/Hora`: `mblEvents[0]?.event_datetime` (mais recente) ou `mbl.last_check` como fallback.
- `Container`: lista de todos os `mblContainers.map(c => c.container)` separados por vírgula (ou `flex flex-wrap` com chips finos, mantendo `font-mono text-[#f5f5f5]`).
- `Armador`: `getShippingLineFromMbl(mbl.mbl_id, mbl.shipping_line)`.
- `Status`: badge `getReportStatus(mbl.last_event, mbl.container_status, mbl.tipo_processo).code` com a mesma estilização inline atual.
- `Último Evento`: `mbl.last_event || "Aguardando..."`.
- `ETA Tracking`: `mbl.eta_api` formatado pt-BR.
- `ETA Cadastrado`: `mbl.eta_master` formatado pt-BR.
- `Última Atualização`: `mbl.last_check` via `formatSaoPaulo(parseMariaDBLocalDate(...))`.

No canto direito da linha (ou em coluna `Container` ao lado dos números), adicionar botão `+` / `-`:

```tsx
<button onClick={() => setHistoryExpanded(p => p === mbl.mbl_id ? null : mbl.mbl_id)}>
  {isHistoryExpanded ? <Minus/> : <Plus/>}
</button>
```

Novo estado local: `const [historyExpanded, setHistoryExpanded] = useState<string | null>(null);`.

### 3. Linhas de histórico (eventos anteriores)

Quando `historyExpanded === mbl.mbl_id`, renderizar `mblEvents.slice(1)` (pula o mais recente, já mostrado acima) **em ordem cronológica decrescente** (já vem assim de `get_tracking_history`), cada evento em uma `<tr>` com as **mesmas colunas** da linha principal:

- `Data/Hora`: `ev.event_datetime` formatado SP.
- `Container`: `ev.container` (container específico do evento).
- `Armador`: mesmo armador do MBL.
- `Status`: `getReportStatus(ev.event_description, ev.event_code, mbl.tipo_processo).code` (derivado do evento).
- `Último Evento`: `ev.event_description` (+ `ev.location` em `text-xs text-[#666]` opcional, mantendo visual atual).
- `ETA Tracking` / `ETA Cadastrado` / `Última Atualização`: manter `—` (não há dado histórico por evento; mantém grid alinhado).

Estilo de linha igual ao da principal, com `opacity-80` leve para diferenciar (opcional, sem mudar fundo).

## O que NÃO muda

- Tabela principal de MBLs (colunas MBL/Consignee/Coordenador/Armador/Rota/Timeline/Status/Situação) — intocada.
- Mapa VesselFinder dentro do expandido — mantido como está.
- `fetchMblContainers` e `fetchMblEvents` — reutilizados sem alteração; nenhuma nova chamada de API.
- Edge functions (`olimpo-proxy`, `sea-carrier-fallback`) — sem alterações.
- Estados, hooks, filtros, paginação, e-mail modal, free time — sem alterações.

## Critério de aceite

- Ao expandir um MBL, vê-se o mapa + uma sub-tabela com **uma única linha** agregada e **todos os containers listados** na coluna Container.
- Há um botão `+` que abre linhas abaixo com os eventos anteriores no mesmo formato de colunas.
- A coluna `Data/Hora` aparece em todas as linhas da sub-tabela (principal + históricas).
- O visual (cores, espaçamentos, badges) é idêntico ao original anterior à última iteração, exceto pela nova coluna e pela agregação.
