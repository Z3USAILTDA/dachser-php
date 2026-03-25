

## Plano: Adicionar modo "Semanal" com seleção de dias e horário no editor de schedule

### Problema
Atualmente o dialog de edição de schedule só oferece presets fixos e um campo de expressão cron manual. Para configurações semanais, o usuário precisa saber a sintaxe cron, o que não é intuitivo.

### Alteração em `src/pages/admin/CronManager.tsx`

1. **Adicionar modo de edição "Semanal"** no dialog de edição de schedule:
   - Criar um toggle/tabs com 3 modos: **Presets** | **Semanal** | **Cron Manual**
   - No modo "Semanal":
     - 7 checkboxes para os dias da semana (Seg, Ter, Qua, Qui, Sex, Sáb, Dom)
     - Seletor de hora (0-23) e minuto (0, 15, 30, 45)
     - A expressão cron é gerada automaticamente a partir da seleção (ex: dias Seg+Qua+Sex às 14:30 → `30 14 * * 1,3,5`)

2. **Novos states no dialog**:
   - `scheduleMode`: `"presets" | "weekly" | "manual"`
   - `selectedDays`: array de números (0-6)
   - `selectedHour`: número (0-23)
   - `selectedMinute`: número (0, 15, 30, 45)

3. **Auto-detect modo ao abrir**: Se o cron atual do job tiver dia da semana definido (campo 5 ≠ `*`), pré-selecionar modo "Semanal" e parsear os dias/hora já configurados.

4. **Preview em tempo real**: Mostrar a expressão cron resultante e sua tradução humanizada abaixo da seleção.

5. **Atualizar `cronToHuman`** para traduzir corretamente expressões com múltiplos dias (ex: `30 14 * * 1,3,5` → "Seg, Qua, Sex às 14:30 UTC").

### UI do modo Semanal (dentro do dialog existente)

```text
┌─────────────────────────────────────────┐
│  [Presets]  [Semanal]  [Cron Manual]    │
├─────────────────────────────────────────┤
│  Dias da Semana:                        │
│  ☐ Seg  ☐ Ter  ☐ Qua  ☐ Qui           │
│  ☐ Sex  ☐ Sáb  ☐ Dom                   │
│                                         │
│  Horário:  [14 ▾]  :  [30 ▾]  UTC      │
│                                         │
│  → 30 14 * * 1,3,5                      │
│  → Seg, Qua, Sex às 14:30 UTC          │
└─────────────────────────────────────────┘
```

### Arquivo editado
- `src/pages/admin/CronManager.tsx` (dialog de edição, ~lines 572-622)

### Nenhuma alteração no backend
A expressão cron gerada é padrão e já funciona com o endpoint `update_schedule` existente.

