

## Ajustes na tela `/air/tracking-aereo`: Rota, Situação e Data/Hora

Arquivo único a editar: **`src/pages/air/TrackingAereo.tsx`**

---

### 1. Rota — Normalizar para siglas de aeroporto

Criar uma função helper `extractAirportCode(location: string): string` antes do componente, com as seguintes regras em ordem:

1. Se contém sigla entre parênteses → extrair (regex `\(([A-Z]{3})\)`)
2. Se termina com 3 letras maiúsculas separadas por espaço ou hífen → usar essas
3. Se o texto casa com um mapa manual de cidades conhecidas → retornar a sigla

```typescript
const CITY_TO_IATA: Record<string, string> = {
  "FRANKFURT": "FRA", "GUARULHOS": "GRU", "SAO PAULO": "GRU",
  "PARIS": "CDG", "AMSTERDAM": "AMS", "LONDON": "LHR",
  "MIAMI": "MIA", "NEW YORK": "JFK", "VIRACOPOS": "VCP",
  "CAMPINAS": "VCP", "CURITIBA": "CWB", "PORTO ALEGRE": "POA",
  "RIO DE JANEIRO": "GIG", "BELO HORIZONTE": "CNF",
  "SALVADOR": "SSA", "RECIFE": "REC", "FORTALEZA": "FOR",
  "BRASILIA": "BSB", "MUNICH": "MUC", "LEIPZIG": "LEJ",
  "LISBON": "LIS", "MADRID": "MAD", "MILAN": "MXP",
  "ROME": "FCO", "BOGOTA": "BOG", "SANTIAGO": "SCL",
  "BUENOS AIRES": "EZE", "DUBAI": "DXB",
};
```

4. Se nada casar → devolver o valor original (trim)

Aplicar no `fetchData` em `origin`, `destination`, `last_event_location` e `penultimate_location` **antes** da lógica de conexão, garantindo comparações consistentes.

---

### 2. Situação — Alerta/Atraso apenas por DIS

Substituir toda lógica de `isDelayed` baseada em `etd` por:

```typescript
const isDelayed = statusCode === "DIS";
```

Pontos de alteração:
- **fetchData** (linha ~259): remover cálculo com `etd`, ou simplesmente ignorar (variável não usada no retorno)
- **renderização da linha** (linha ~583): `isDelayed = statusCode === "DIS"`
- **cardCounts** (linha ~354): contar alerta quando `code === "DIS"`
- **filteredAwbs cardFilter "alerta"** (linha ~380): filtrar por `code === "DIS"`
- **isAlertStatus na timeline bar** (linha ~609): manter `isDelayed || statusCode === "OFLD"` (OFLD continua crítico/vermelho, DIS agora é o único "atraso")

---

### 3. Data/Hora — Montar a partir de timeline_json

No `fetchData`, após obter `item.timeline_json`, montar `lastEventDate` do evento correspondente ao `last_event`:

```typescript
const timeline = item.timeline_json || [];
let lastEventDate: string | null = null;
if (timeline.length > 0) {
  // Pegar o primeiro evento (mais recente) que tenha date
  const evt = timeline.find((e: any) => e.date);
  if (evt) {
    const d = evt.date || "";
    const t = evt.time || "00:00";
    lastEventDate = `${d}T${t}:00`;
  }
}
```

Usar `lastEventDate` para:
- Campo `last_event_date` do objeto `AWBData`
- Cálculo de `hoursInStatus` (substituir `item.last_event_date` por `lastEventDate`)

Isso corrige a coluna Data/Hora (que já usa `formatDateTimeBR(awb.last_event_date)`) e melhora o SLA automaticamente.

---

### Resumo das mudanças

| O quê | Onde no arquivo | Mudança |
|-------|----------------|---------|
| Helper `extractAirportCode` | Antes do componente (~linha 130) | Novo helper |
| Mapa `CITY_TO_IATA` | Junto ao helper | Novo mapa |
| Normalização de rotas | `fetchData` (~linhas 234-237) | Aplicar helper |
| `isDelayed` no render | Linha ~583 | `statusCode === "DIS"` |
| `cardCounts` alerta | Linha ~354 | `code === "DIS"` |
| `filteredAwbs` alerta | Linha ~380 | `code === "DIS"` |
| `fetchData` isDelayed | Linha ~259 | Remover ou ajustar |
| `lastEventDate` | `fetchData` (~linha 247) | Montar de `timeline_json` |

Nenhum outro arquivo será alterado.

