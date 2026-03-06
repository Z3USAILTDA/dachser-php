

# Corrigir data/hora incorreta para AWB 549-43063871

## Diagnóstico

O AWB 549-43063871 retorna `last_event_date: "2001-05-14T12:00:00.000Z"` — claramente incorreto. A timeline modal mostra corretamente `05/03/2026 às 10:21` (BKD em GRU).

Dois problemas identificados em `extractLastEventDate` dentro de `fetch-status-aereo`:

### Problema 1: `parseFlexibleDate` não suporta datas com hífens
O campo `dataEvento` da API armazena datas como `"05-Mar-2026 10:21"`. A regex na linha 154 espera espaços (`\s+`) entre dia, mês e ano, mas o formato usa hífens. Dependendo do engine Deno, `new Date("05-Mar-2026 10:21")` pode gerar uma data inválida ou completamente errada (como 2001).

### Problema 2: Sem guarda de data mínima
Não há proteção contra datas absurdas (como anos antes de 2020), permitindo que parsing incorreto retorne datas de 2001.

## Correção — `supabase/functions/fetch-status-aereo/index.ts`

### 1. Atualizar `parseFlexibleDate` (linha 154)
Expandir a regex para aceitar separadores hífen e espaço:
```typescript
// Antes:
const match = dateStr.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})(?:\s+(\d{2}:\d{2}))?/);
// Depois:
const match = dateStr.match(/^(\d{1,2})[\s-]+([A-Za-z]{3})[\s-]+(\d{4})(?:\s+(\d{2}:\d{2}))?/);
```

### 2. Adicionar guarda de data mínima em `extractLastEventDate` (linha 376)
Após o filtro de datas futuras, adicionar filtro de datas antes de 2020:
```typescript
if (eventDate > now) continue;
if (eventDate.getFullYear() < 2020) continue; // data claramente inválida
```

Dois ajustes cirúrgicos no mesmo arquivo.

