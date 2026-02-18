
# Corrigir parsing de datas em português na timeline do modal

## Causa raiz identificada

Os timestamps na `timeline_json` de `t_aereo_ws` estão em formato de texto em português:

```
"Timestamp": "17 Fev 2026 13:13"
```

O código atual faz:
```typescript
return new Date(e.data_hora_evento) >= etdCutoff!;
```

`new Date("17 Fev 2026 13:13")` retorna `Invalid Date` (NaN) em JavaScript. Como `NaN >= qualquer_data` é `false`, **todos os eventos com timestamp em português são descartados pelo filtro ETD**.

Isso explica por que o AWB `047-32913462` retorna 0 eventos mesmo tendo uma timeline completa: o ETD é `2026-02-12`, todos os eventos são de `17 Fev 2026`, mas o parse falha → filtro exclui tudo.

## Dados confirmados via query direta

- `t_aereo_ws.timeline_json` contém eventos com `Timestamp: "17 Fev 2026 13:13"` (DLV, AWD, etc.)
- `t_master_dados.etd` = `2026-02-12`
- O filtro `new Date("17 Fev 2026 13:13") >= new Date("2026-02-12")` falha silenciosamente → evento descartado

## Solução: parser de datas multilíngue no filtro ETD

Adicionar uma função `parseFlexibleDate` no `get_awb_tracking_events` que converte meses abreviados em português e inglês para datas válidas antes de aplicar o filtro.

### Arquivo a editar: `supabase/functions/mariadb-proxy/index.ts`

**Localização**: logo antes do bloco de filtro ETD (linhas ~6019–6024)

### Adicionar helper de parsing de data antes do filtro:

```typescript
// Helper para parsear datas em português e inglês
const parseFlexibleDate = (dateStr: string | null): Date | null => {
  if (!dateStr) return null;
  
  // Mapa de meses em português abreviados → número
  const ptMonths: Record<string, string> = {
    'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04',
    'mai': '05', 'jun': '06', 'jul': '07', 'ago': '08',
    'set': '09', 'out': '10', 'nov': '11', 'dez': '12',
  };

  // Tentar parse direto primeiro (ISO, etc.)
  const direct = new Date(dateStr);
  if (!isNaN(direct.getTime())) return direct;
  
  // Formato: "17 Fev 2026 13:13" ou "17 Feb 2026 13:13"
  const match = dateStr.match(/^(\d{1,2})\s+([A-Za-zçÇ]{3})\s+(\d{4})(?:\s+(\d{2}:\d{2}))?/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const monthStr = match[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const year = match[3];
    const time = match[4] || '00:00';
    const month = ptMonths[monthStr] || null;
    if (month) {
      return new Date(`${year}-${month}-${day}T${time}:00`);
    }
  }

  return null;
};
```

### Atualizar o filtro ETD (linhas 6019–6024) para usar o helper:

```typescript
// Antes:
const filteredEvents = etdCutoff
  ? validEvents.filter((e: any) => {
      if (!e.data_hora_evento) return true;
      return new Date(e.data_hora_evento) >= etdCutoff!;
    })
  : validEvents;

// Depois:
const filteredEvents = etdCutoff
  ? validEvents.filter((e: any) => {
      if (!e.data_hora_evento) return true; // sem data, mantém por segurança
      const eventDate = parseFlexibleDate(e.data_hora_evento);
      if (!eventDate) return true; // data inválida, mantém por segurança
      return eventDate >= etdCutoff!;
    })
  : validEvents;
```

## Impacto

| Formato de data | Comportamento |
|---|---|
| `"17 Fev 2026 13:13"` (português) | Parseado corretamente → exibido se >= ETD |
| `"2026-02-17T13:13:00Z"` (ISO) | Continua funcionando normalmente |
| `"17 Feb 2026 13:13"` (inglês) | Continua funcionando (new Date suporta nativamente) |
| Data inválida / null | Evento mantido por segurança (sem descarte) |

## Arquivos a editar

- `supabase/functions/mariadb-proxy/index.ts` — adicionar `parseFlexibleDate` e atualizar o filtro na action `get_awb_tracking_events`
