

## Diagnóstico

O frontend envia o `vencimento` corretamente como `"2026-04-06"` (formato `YYYY-MM-DD`). O helper `formatDateForMariaDB` (linha 10693) já foi corrigido para converter isso em `"2026-04-06 00:00:00.000"`.

Porém, existe **um ponto que ainda não foi corrigido**: o INSERT de registros mirror (linha 10627-10646) usa o `mirrorVenc` que retorna apenas `YYYY-MM-DD` **sem** o componente de hora `00:00:00.000`. Isso pode causar rejeição pelo MariaDB na coluna DATETIME.

Além disso, os erros nos logs de rede (`'Mon Apr 06 2026 00:00:00 GM'`) são do código **anterior** à última correção. A edge function precisa ter sido re-deployed para que a correção tenha efeito.

## Plano

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts`

### 1. Corrigir mirrorVenc para incluir componente de hora

Na IIFE `mirrorVenc` (linhas 10608-10625), alterar o fallback e todos os retornos para incluir ` 00:00:00.000`:

```typescript
const mirrorVenc = (() => {
  const fallback = new Date().toISOString().split('T')[0] + ' 00:00:00.000';
  if (!row.data_vencimento) return fallback;
  const s = String(row.data_vencimento).trim();
  if (!s || s === 'null' || s === 'undefined' || s === 'Invalid Date') return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00.000`;
  if (s.includes('T')) return `${s.split('T')[0]} 00:00:00.000`;
  const brMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]} 00:00:00.000`;
  const parsed = new Date(s.replace(/\bGM$/, 'GMT'));
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')} 00:00:00.000`;
  }
  return fallback;
})();
```

### 2. Adicionar log de debug para o vencimento recebido

Adicionar um `console.log` após a linha 10553 para registrar o valor exato do `vencimento` recebido do frontend:

```typescript
console.log('Vencimento recebido:', vencimento, '| Tipo:', typeof vencimento);
```

E outro após a linha 10714:

```typescript
console.log('Vencimento formatado para INSERT:', vencFormatted);
```

Isso permitirá diagnosticar se o problema persiste após o deploy.

### 3. Garantir re-deploy

A edge function precisa ser re-deployed para que as correções anteriores (helpers `toMySQLDate`, `formatDateForMariaDB`) entrem em vigor. Os erros vistos nos logs de rede são todos do código antigo.

