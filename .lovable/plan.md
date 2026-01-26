
# Plano: Corrigir Erro "Data Truncated" no CHB

## Problema Identificado

O Edge Function `analyze-chb-documents` está falhando com:
```
Data truncated for column 'id' at row 1
```

A causa é a tentativa de inserir um UUID de 36 caracteres (ex: `550e8400-e29b-41d4-a716-446655440000`) na coluna `id` da tabela `ai_agente.t_dachser_chb_runs`, que provavelmente é do tipo `INT AUTO_INCREMENT`.

---

## Solução

Remover o uso de UUID customizado e usar o ID auto-incrementado gerado pelo banco de dados.

### Arquivo: `supabase/functions/analyze-chb-documents/index.ts`

**Alterações:**

1. **Linha 1806-1820** - Criação do request:
```typescript
// ANTES:
const requestId = crypto.randomUUID();
await callMariaDBProxy('create_chb_run', {
  id: requestId,
  itemId: itemId || 0,
  etapa: stepId.toString(),
  status: 'pending',
  resultText: JSON.stringify({ ... })
});

// DEPOIS:
const createRunResult = await callMariaDBProxy('create_chb_run', {
  itemId: itemId || 0,
  etapa: stepId.toString(),
  status: 'pending',
  resultText: JSON.stringify({ ... })
});
const requestId = String(createRunResult.runId); // ID gerado pelo banco
```

2. **Todas as referências** a `requestId` continuam funcionando pois agora usam o ID do banco.

---

## Impacto

| Componente | Mudança |
|------------|---------|
| Criação de análise CHB | Usa ID auto-incrementado |
| Polling de status | Continua funcionando (usa mesmo ID) |
| Background processing | Continua funcionando |
| Dados existentes | Sem impacto |

---

## Benefícios

- Compatibilidade com schema existente do MariaDB
- Sem necessidade de alterar estrutura do banco
- IDs menores e mais simples de debugar

---

## Passos de Implementação

1. Editar `supabase/functions/analyze-chb-documents/index.ts`
2. Remover `crypto.randomUUID()` 
3. Usar `runId` retornado por `create_chb_run`
4. Deploy automático da Edge Function

---

## Detalhes Técnicos

A ação `create_chb_run` no `mariadb-proxy` já suporta ambos os modos:

```typescript
// Com customId (atual - não funciona com INT):
if (customId) {
  await client.execute(`INSERT ... VALUES (?, ...)`, [customId, ...]);
  result = { success: true, runId: customId };
}

// Sem customId (usar este):
else {
  const insertResult = await client.execute(`INSERT ...`, [...]);
  result = { success: true, runId: insertResult.lastInsertId };
}
```

Ao não passar o `id` na chamada, o banco gera automaticamente via AUTO_INCREMENT.
