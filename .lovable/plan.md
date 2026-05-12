## Objetivo

No campo **Vencimento** (criação e edição de vouchers/SPO), bloquear seleção de:
- Sábados e domingos
- Feriados nacionais brasileiros (fixos + móveis: Carnaval, Sexta-feira Santa, Páscoa, Corpus Christi)

Demais campos de data (emissão etc.) permanecem inalterados.

## Mudanças

### 1. Novo utilitário `src/utils/businessDays.ts`
- `getBrazilianHolidays(year)`: retorna `Set<string>` com datas `YYYY-MM-DD` de feriados nacionais. Fixos: 01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 20/11, 25/12. Móveis calculados via algoritmo de Páscoa (Meeus/Jones/Butcher): Sexta-feira Santa (Páscoa-2), Carnaval (Páscoa-47), Corpus Christi (Páscoa+60).
- `isBusinessDay(date)`: retorna `false` para sábado/domingo ou se está no set de feriados do ano.
- Cache de feriados por ano em `Map<number, Set<string>>`.

### 2. `src/components/esteira/DateInputField.tsx`
- Adicionar prop opcional `businessDaysOnly?: boolean`.
- Quando `true`:
  - No `handleInputChange` (após validar `parsed`): se `!isBusinessDay(parsed)`, reverter o input e não chamar `field.onChange` (mesmo padrão usado hoje para `disablePastDates`).
  - No `<Calendar disabled>`: combinar com a regra existente — desabilitar dias que sejam passados (se `disablePastDates`) **ou** que não sejam dia útil.
- Sem mudança visual além do dia ficar desabilitado no calendário.

### 3. Aplicar a prop apenas nos campos `vencimento`
- `src/components/esteira/CreateVoucherDialog.tsx` (linha ~1210): `<DateInputField name="vencimento" businessDaysOnly />`
- `src/components/esteira/VoucherMasterForm.tsx` (linha ~502): idem.
- O outro `DateInputField` em `CreateVoucherDialog.tsx` (linha 1217, emissão) **não** recebe a prop.

## Detalhes técnicos

```ts
// businessDays.ts (esboço)
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}
```

## Não-escopo
- Não altera datas já gravadas no banco.
- Não altera outros pickers (emissão, filtros, demurrage, SEA, CCT, air etc.).
- Não adiciona configuração de feriados regionais/municipais.
