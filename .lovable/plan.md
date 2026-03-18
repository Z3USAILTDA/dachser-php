

## Diagnóstico

O campo `vencimento` na tabela `t_vouchers` é do tipo `DATETIME` e espera o formato `YYYY-MM-DD HH:MM:SS.000` (conforme a imagem: `2025-12-31 00:00:00.000`).

Atualmente, os helpers de data (`toMySQLDate`, `toMySQLDateSafe`, `formatDateForMariaDB`) retornam apenas `YYYY-MM-DD` ou `null`. O MariaDB aceita `YYYY-MM-DD` para colunas DATE, mas para colunas DATETIME pode rejeitar ou truncar. Além disso, quando o input é vazio/inválido, `toMySQLDate` retorna `null`, que vira `''` no driver — causando o erro.

## Plano

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts`

### 1. Unificar helpers de data em um único formato DATETIME

Alterar os 3 helpers (`toMySQLDate` linha 5633, `toMySQLDateSafe` linha 10195, `formatDateForMariaDB` linha 10691) para:

- Sempre retornar `YYYY-MM-DD 00:00:00.000` (datetime com hora zerada) para datas puras
- Nunca retornar `null` — usar fallback com data de hoje quando input é inválido/vazio
- Tratar todos os formatos de entrada (ISO, BR `DD/MM/YYYY`, JS Date strings com timezone truncado)

```typescript
const toMySQLDate = (dateValue: any): string => {
  const now = new Date();
  const fallback = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} 00:00:00.000`;
  
  if (!dateValue) return fallback;
  const s = String(dateValue).trim();
  if (!s || s === 'null' || s === 'undefined' || s === 'Invalid Date') return fallback;

  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00.000`;
  // ISO with T
  if (s.includes('T')) return `${s.split('T')[0]} 00:00:00.000`;
  // DD/MM/YYYY
  const brMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]} 00:00:00.000`;
  // Fix truncated timezone, parse
  const fixed = s.replace(/\bGM$/, 'GMT');
  const parsed = new Date(fixed);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth()+1).padStart(2,'0');
    const d = String(parsed.getDate()).padStart(2,'0');
    return `${y}-${m}-${d} 00:00:00.000`;
  }
  return fallback;
};
```

### 2. Aplicar o mesmo padrão nos 3 locais

- **`toMySQLDate`** (linha 5633) — usado no `create_voucher`
- **`toMySQLDateSafe`** (linha 10195) — usado no sync RM
- **`formatDateForMariaDB`** (linha 10691) — usado no create master voucher

Todos passam a retornar `string` (nunca `null`), formato `YYYY-MM-DD 00:00:00.000`.

