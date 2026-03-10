

## Problema: Todos os SLAs estão zerados

### Causa Raiz

Na função `calcularSlaLimite` (mariadb-proxy, linha 301), há um guard:

```typescript
if (statusManifestacao !== 'MANIFESTADO_CCT') return null;
```

O campo `status_manifestacao_cct` nunca tem o valor `'MANIFESTADO_CCT'`. Os valores reais são `'RECEBIDO_NOVA'` (default na linha 3924), `'MANIFESTADA'`, `'INFORMADA'`, etc. Como o guard nunca passa, `slaLimite` é sempre `null`, e consequentemente `horasRestantes` é sempre `null` (exibido como zero/vazio).

### Solução

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts`

1. **Remover o guard restritivo** na função `calcularSlaLimite` (linha 301). O SLA deve ser calculado para todos os processos que tenham dados de voo (dep_datetime ou eta), independente do status de manifestação. O cálculo já depende de `dataDecolagem` e `eta` existirem, o que é suficiente como guard natural.

2. **Função corrigida:**
```typescript
function calcularSlaLimite(
  tipoVoo: string,
  dataDecolagem: Date | null,
  eta: Date | null,
  statusManifestacao: string
): Date | null {
  // Não calcular SLA para processos já entregues
  const statusFinais = ['ENTREGUE', 'DLV', 'POD'];
  if (statusFinais.includes(statusManifestacao)) return null;
  
  if (tipoVoo === 'VOO_CURTO' && dataDecolagem) {
    return new Date(dataDecolagem.getTime() + 30 * 60 * 1000);
  }
  
  if (tipoVoo === 'VOO_LONGO' && eta) {
    return new Date(eta.getTime() - 4 * 60 * 60 * 1000);
  }
  
  return null;
}
```

3. **Também passar o `status_cct_oficial`** no lugar de `statusManifestacao` para o guard de status finais, já que é o campo que reflete a situação real do processo na linha 3932.

### Resultado
- Processos com `dep_datetime` (voo curto) terão SLA = decolagem + 30min
- Processos com `eta` (voo longo) terão SLA = ETA - 4h  
- Processos já entregues não terão SLA calculado
- Os badges de SLA (OK/ALERTA/CRITICO/VENCIDO) voltarão a funcionar no dashboard

