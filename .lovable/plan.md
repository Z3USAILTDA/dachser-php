
# Plano: Alinhar Critérios de Status entre Tela e Emails

## Problema Identificado
Os critérios de classificação de saúde das tabelas são inconsistentes:

| Critério | Tela (DatabaseMonitor.tsx) | Email (db-status-report) |
|----------|---------------------------|--------------------------|
| Verde (Saudável) | ≤ 5 minutos | < 30 minutos |
| Amarelo (Atenção) | 5-60 minutos | 30-60 minutos |
| Vermelho (Crítico) | > 60 minutos | ≥ 60 minutos |

## Recomendação
Alinhar o edge function de email para usar os **mesmos critérios da tela** (mais rigoroso), garantindo consistência visual.

---

## Alterações Necessárias

### Arquivo: `supabase/functions/db-status-report/index.ts`

**Linha 78-82** - Modificar função `getStatusColor`:

```typescript
// ANTES (critérios do email - mais tolerante)
function getStatusColor(minutes: number): 'healthy' | 'warning' | 'critical' {
  if (minutes >= 60) return 'critical';
  if (minutes >= 30) return 'warning';
  return 'healthy';
}

// DEPOIS (alinhado com a tela - mais rigoroso)
function getStatusColor(minutes: number): 'healthy' | 'warning' | 'critical' {
  if (minutes > 60) return 'critical';
  if (minutes > 5) return 'warning';
  return 'healthy';
}
```

---

## Resultado Esperado

Após a mudança, ambos os sistemas usarão:
- **Verde**: ≤ 5 minutos
- **Amarelo**: 5-60 minutos  
- **Vermelho**: > 60 minutos

Os emails passarão a reportar os mesmos valores que a tela de monitoramento.

---

## Seção Técnica

| Etapa | Ação |
|-------|------|
| 1 | Editar `supabase/functions/db-status-report/index.ts` linha 78-82 |
| 2 | Deploy automático do edge function |
| 3 | Próximo email (a cada 30 min) usará critérios alinhados |
