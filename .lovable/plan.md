

## Plano: Override Manual Condicional (Não Bloquear Atualização Automática)

### Problema Atual
Os `MANUAL_OVERRIDES` sempre sobrescrevem os dados automáticos do MariaDB, mesmo quando o sistema automático já avançou para um status mais recente. Isso impede que atualizações automáticas (a cada 30 min) reflitam na interface quando o processo progride além do status manual.

### Solução
Alterar a lógica de aplicação dos overrides (linhas 2309-2374) para comparar o status automático com o status manual usando a hierarquia IATA (`IATA_HIERARCHY`). O override só será aplicado se:

1. O status automático resolido (`finalStatus`) **não existe** ou é inválido (tracking_failed)
2. O status automático tem **peso IATA menor ou igual** ao status do override manual
3. Se o status automático for **mais avançado** (peso IATA maior), o override é ignorado e os dados automáticos prevalecem

### Mudança Técnica
No loop de overrides (~linha 2309), antes de aplicar cada override:

```
for (const row of processedRows) {
  const awb = (row.awb || '').trim();
  const override = MANUAL_OVERRIDES[awb];
  if (!override) continue;

  // NOVO: Comparar status automático vs manual
  const autoStatus = (row['último_status'] || '').trim().toUpperCase();
  const manualStatus = (override.status || '').trim().toUpperCase();
  const autoWeight = IATA_HIERARCHY[autoStatus] || 0;
  const manualWeight = IATA_HIERARCHY[manualStatus] || 0;

  // Se o automático já avançou além do manual, pular override
  if (autoStatus && !row.tracking_failed && autoWeight > manualWeight) {
    console.log(`[OVERRIDE SKIP] ${awb}: auto="${autoStatus}"(${autoWeight}) > manual="${manualStatus}"(${manualWeight})`);
    continue;
  }

  // ... aplicar override normalmente
}
```

### Comportamento Resultante
- AWB com override manual `DEP` (peso 23) e automático `RCF` (peso 41) → usa o automático
- AWB com override manual `NFD` (peso 42) e automático `DEP` (peso 23) → usa o manual
- AWB sem dados automáticos → usa o manual (como antes)

### Arquivo Afetado
- `supabase/functions/fetch-status-aereo/index.ts` (linhas ~2309-2374)

