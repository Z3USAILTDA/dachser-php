## Objetivo
Quando o IMO do navio não for resolvido no monitoramento marítimo, em vez do aviso "Navio não identificado / IMO não disponível", renderizar um mapa **Mapbox** com a posição do navio (último evento) e um card de informações inspirado no popup do VesselFinder — **sem a foto do navio**.

## Mudanças

### 1. Edge function `olimpo-proxy` (action `get_sea_tracking`)
Expor a posição do navio já presente em `t_sea_tracking_current`:
- Acrescentar ao SELECT principal:
  - `MAX(ts.latitude) as latitude`
  - `MAX(ts.longitude) as longitude`
  - `MAX(ts.last_event_location) as last_event_location` (se a coluna existir; caso contrário, usar o porto do último evento via `t_sea_tracking_history` em CTE auxiliar)

### 2. `src/pages/ContainerTracking.tsx`
- Adicionar à interface `MblTrackingData` os campos `latitude: string | null`, `longitude: string | null`, `last_event_location: string | null`.
- Passar esses campos para o componente `<VesselFinderMap />`.

### 3. `src/components/tracking/VesselFinderMap.tsx` (componente principal)
Estender props:
```ts
latitude?: string | number | null;
longitude?: string | number | null;
lastEvent?: string | null;
lastEventLocation?: string | null;
eta?: string | null;
destino?: string | null;
```

Fluxo atualizado:
- **Com IMO/MMSI** → mantém o iframe do VesselFinder (sem alteração).
- **Resolvendo IMO** → mantém spinner "Localizando navio…".
- **Sem IMO mas com `latitude`/`longitude`** → renderiza Mapbox (nova subview, ver item 4).
- **Sem IMO e sem coordenadas** → mantém um fallback discreto (apenas o nome do navio em texto neutro, sem o aviso amarelo atual).

### 4. Nova subview `LastEventMap` (dentro do mesmo arquivo)
- Carrega `mapbox-gl` (já está no `package.json`).
- Busca o token via `GET /functions/v1/get-mapbox-token` (mesmo padrão usado em `src/pages/Olimpo.tsx`).
- Cria `mapboxgl.Map` centralizado em `[lon, lat]`, zoom ~5, estilo `mapbox://styles/mapbox/light-v11` (ou `dark` para combinar com o tema DACHSER).
- Adiciona um `Marker` na posição com ícone de navio em dourado (`#ffc800`).
- Anexa um `Popup` aberto por padrão **com o mesmo layout do anexo** (sem foto):

  ```
  ┌────────────────────────────────┐
  │ Navio: <nome>                  │
  │ Last port: <lastEventLocation> │
  │ ETA: <eta formatada>           │
  │ Destino: <destino>             │
  │ [ Hide track ] [ Details ]     │
  └────────────────────────────────┘
  ```

  - Botão **Details** abre o VesselFinder externo pelo nome do navio (mesma URL usada hoje em fallback).
  - Botão **Hide track** apenas fecha o popup.
- Overlay inferior esquerdo mantém o badge atual (ícone + nome do navio).
- Limpeza correta no `useEffect` (remove marker/map no unmount).

### 5. Remoção do aviso atual
Remover por completo o bloco "Navio não identificado / IMO não disponível para rastreio em tempo real" (linhas ~92–123 do componente atual). O novo fluxo do item 3 o substitui.

## Detalhes técnicos

- **Coordenadas**: `t_sea_tracking_current.latitude`/`longitude` são `VARCHAR`; converter via `parseFloat` no frontend e validar (`isFinite`, range −90/+90 e −180/+180) antes de instanciar o mapa.
- **Token Mapbox**: cache em memória (`let cachedToken: string | null`) para evitar refetch a cada expand de MBL.
- **Tema**: usar estilo escuro do Mapbox para combinar com o dark theme atual; bordas/paddings idênticos ao container do iframe (`rounded-xl border border-[rgba(255,255,255,.1)]`).
- **Sem foto do navio**: o popup é totalmente custom (HTML string passada ao `mapboxgl.Popup`), não há referência a `vesselfinder.com/aismap` no caso sem IMO.
- **Surgical**: nenhuma mudança em outros componentes/páginas. `Olimpo.tsx` permanece intocado.