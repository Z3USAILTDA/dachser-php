

# Plano: Evitar E-mails de Alerta Duplicados Quando Status Não Mudou

## Resumo
Melhorar a lógica de deduplicação de alertas para garantir que, se um alerta já foi enviado e o status da tabela continua crítico na próxima verificação, **não seja enviado outro e-mail**.

## Situação Atual

O sistema atual verifica se houve alerta nos últimos 120 minutos (`REALERT_INTERVAL_MINUTES`). Se houve, não envia novamente. Porém, com a nova frequência de 1 hora, isso significa que:

| Hora | Tabela Crítica | Último Alerta | Ação |
|------|---------------|---------------|------|
| 09:00 | Sim | Nunca | ✅ Envia alerta |
| 10:00 | Sim | 09:00 (1h atrás) | ❌ Não envia (< 2h) |
| 11:00 | Sim | 09:00 (2h atrás) | ✅ Envia novamente! |

**Problema**: Após 2 horas, o sistema envia outro alerta mesmo que o status não tenha mudado.

## Nova Lógica Proposta

Rastrear quando uma tabela **entrou** em estado crítico e só enviar alerta se:
1. A tabela acabou de entrar em estado crítico (não estava crítica antes), OU
2. A tabela saiu do estado crítico e voltou a entrar (recuperou e piorou novamente)

### Fluxo Novo

| Hora | Tabela Crítica | Status Anterior | Ação |
|------|---------------|-----------------|------|
| 09:00 | Sim | Normal | ✅ Envia alerta (nova entrada) |
| 10:00 | Sim | Crítico | ❌ Não envia (não mudou) |
| 11:00 | Sim | Crítico | ❌ Não envia (não mudou) |
| 12:00 | **Não** | Crítico → Normal | — (recuperou) |
| 13:00 | Sim | Normal → Crítico | ✅ Envia alerta (nova entrada) |

---

## Mudanças Necessárias

### 1. Criar Nova Coluna na Tabela de Alertas

Adicionar coluna `recovered_at` para rastrear quando a tabela saiu do estado crítico:

```sql
ALTER TABLE ai_agente.t_db_monitor_alerts 
ADD COLUMN recovered_at TIMESTAMP NULL DEFAULT NULL;
```

### 2. Modificar Lógica de Verificação

Na função `db-critical-alert`, alterar a lógica para:

1. Para cada tabela crítica, verificar se há um alerta recente SEM `recovered_at`
2. Se existe alerta sem recuperação → tabela ainda crítica → NÃO enviar
3. Se não existe alerta OU existe com `recovered_at` preenchido → enviar novo alerta

### 3. Adicionar Rotina de Marcação de Recuperação

Quando uma tabela que estava em alerta volta ao estado normal (< 60 min sem atualização):
- Marcar o registro de alerta com `recovered_at = NOW()`

---

## Alterações no Código

### Arquivo: `supabase/functions/db-critical-alert/index.ts`

**Nova lógica de verificação (substituir linhas 578-629)**:

```typescript
// Check if table is still in critical state from a previous alert
// or if it recovered and became critical again
for (const table of criticalTables) {
  try {
    // Find the most recent alert for this table that hasn't recovered
    const checkQuery = `
      SELECT id, sent_at, recovered_at 
      FROM ai_agente.t_db_monitor_alerts 
      WHERE alert_type = 'critical_alert' 
        AND table_name = ?
        AND recovered_at IS NULL
      ORDER BY sent_at DESC
      LIMIT 1
    `;
    
    const unresolvedAlerts = await client.query(checkQuery, [table.name]);
    
    if (unresolvedAlerts.length === 0) {
      // No unresolved alert - this is a NEW critical state
      newCriticalTables.push(table);
      console.log(`Table ${table.name} is NEW in critical status`);
    } else {
      // Already has an active (unrecovered) alert - don't send again
      console.log(`Table ${table.name} still in critical status (alert from ${unresolvedAlerts[0].sent_at})`);
    }
  } catch (err) { ... }
}

// Mark recovered tables (tables that were critical but now are healthy)
for (const tableConfig of TABLES_CONFIG) {
  const isCurrentlyCritical = criticalTables.some(t => t.name === tableConfig.name);
  
  if (!isCurrentlyCritical) {
    // Table is now healthy - mark any unresolved alerts as recovered
    try {
      await client.execute(`
        UPDATE ai_agente.t_db_monitor_alerts 
        SET recovered_at = NOW()
        WHERE alert_type = 'critical_alert' 
          AND table_name = ?
          AND recovered_at IS NULL
      `, [tableConfig.name]);
    } catch (err) { ... }
  }
}
```

---

## Resumo das Alterações

| Componente | Alteração |
|------------|-----------|
| `t_db_monitor_alerts` | Adicionar coluna `recovered_at` |
| `db-critical-alert/index.ts` | Nova lógica: verificar alertas não recuperados |
| `db-critical-alert/index.ts` | Nova rotina: marcar tabelas recuperadas |
| `REALERT_INTERVAL_MINUTES` | Remover esta constante (não mais necessária) |

---

## Benefícios

1. **Zero alertas duplicados**: Se o status não mudou, não envia e-mail
2. **Alertas ao re-entrar**: Se tabela recuperou e ficou crítica novamente, envia novo alerta
3. **Histórico completo**: Registra quando cada problema foi resolvido (`recovered_at`)

