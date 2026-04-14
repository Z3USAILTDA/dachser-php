
## Plano: Alinhar visual do Faturamento exatamente ao Cobrança

### Diferenças identificadas

Comparando `OlimpoCobranca.tsx` com `OlimpoFaturamento.tsx`, encontrei estas inconsistências visuais:

1. **KpiCard no Faturamento** tem extras que o Cobrança nao tem: linha `sub` (subtítulo), ícones com cores variadas (green/amber). No Cobrança, o KpiCard e mais simples: sem `sub`, accent e apenas boolean (vermelho ou padrao)
2. **Tick fontSize** - Cobrança usa `11`, Faturamento usa `10`
3. **Label fontSize no LabelList** - Faturamento usa `9`, deveria ser consistente
4. **Legend fontSize** - Cobrança usa `11`, Faturamento usa `12`
5. **PageLayout** - Faturamento nao tem `backTo="/dashboard"`
6. **Spacing** - Cobrança usa `gap-6` entre seções de gráficos, Faturamento usa `gap-4`

### Alteracao - Arquivo unico

**`src/pages/olimpo/OlimpoFaturamento.tsx`**

1. **KpiCard**: Simplificar para o mesmo modelo do Cobrança:
   - Remover `sub` prop
   - Mudar `accent` de string para boolean (vermelho quando ativo)
   - Remover cores green/amber dos ícones - usar apenas primary (padrao) ou red (accent)
   - Valor com accent em vermelho como no Cobrança

2. **Ajustar tick/label/legend sizes**:
   - `tickStyle fontSize: 11` (era 10)
   - `labelStyle fontSize: 10` (era 9)
   - `legendStyle fontSize: 11` (era 12)

3. **PageLayout**: Adicionar `backTo="/dashboard"`

4. **Grid gaps**: Mudar de `gap-4` para `gap-6` nos grids de gráficos (como Cobrança)

5. **Chart margins**: Padronizar `margin={{ top: 10, right: 10, left: 10, bottom: 5 }}` (como Cobrança) em vez de `margin={{ top: 20, right: 10, left: 0, bottom: 0 }}`

### Sem alteracao
- Tipos de visualizacao (9 graficos) permanecem identicos
- Logica de fetch/processamento inalterada
- Tooltip styles ja estao corretos

### Resumo
| Arquivo | Acao |
|---------|------|
| `src/pages/olimpo/OlimpoFaturamento.tsx` | Alinhar KpiCard, font sizes, gaps e margins ao padrao Cobranca |
