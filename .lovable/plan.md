
# Plano: Zerar a Tela de Rastreio de AWB (/air/tracking)

## Objetivo
Forçar a tela de rastreio de AWB (`/air/tracking`) a não exibir nenhum processo até segunda ordem, através de um threshold de data futuro.

---

## Solução Técnica

A abordagem mais simples e reversível é alterar o threshold de data na Edge Function `fetch-status-aereo` para uma data no futuro distante (ex: `2099-01-01`), fazendo com que nenhum registro atual seja retornado.

### Arquivo a ser modificado:
**`supabase/functions/fetch-status-aereo/index.ts`**

### Alteração:
Linha 68 - mudar de:
```typescript
const dateThreshold = '2026-01-26 00:00:00';
```

Para:
```typescript
// Screen intentionally cleared until further notice - set future date to exclude all records
const dateThreshold = '2099-01-01 00:00:00';
```

---

## Impacto

| Área | Efeito |
|------|--------|
| `/air/tracking` | Exibirá 0 registros - tela "zerada" |
| `/air/status-aereo` (StatusAereoList) | Usa a mesma Edge Function, também ficará zerada |
| CCT Dashboard | Não afetado (usa `mariadb-proxy`) |
| Banco de dados | Nenhuma alteração - dados permanecem intactos |

---

## Reversibilidade

Para reativar a tela, basta alterar o threshold de volta para a data desejada:
```typescript
const dateThreshold = '2026-01-26 00:00:00'; // ou outra data
```

---

## Detalhes Técnicos

A query SQL executada passará a ser:
```sql
SELECT * FROM dados_dachser.t_status_aereo 
WHERE `última atualização` >= '2099-01-01 00:00:00'
ORDER BY id DESC
```

Como nenhum registro possui `última atualização` em 2099, o resultado será sempre um array vazio.

---

## Passos de Implementação

1. Editar `supabase/functions/fetch-status-aereo/index.ts`
2. Alterar `dateThreshold` de `'2026-01-26 00:00:00'` para `'2099-01-01 00:00:00'`
3. Adicionar comentário explicativo para referência futura
4. Deploy automático da Edge Function

---

## Resultado Esperado

Após a implementação, a tela `/air/tracking` exibirá a mensagem "Nenhum AWB encontrado" e todos os contadores/estatísticas mostrarão zero.
