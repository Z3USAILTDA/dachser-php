

## Plano: Reduzir pressão de conexões MariaDB — fail-fast + retry frontend

### Realidade técnica

Edge Functions são **serverless** — cada invocação cria uma conexão, usa, e fecha. Não existe conexão "aberta há 10 minutos" que possa ser encerrada. O problema real é que **muitas invocações simultâneas** (crons + operador) abrem conexões ao mesmo tempo e estouram o limite de 30.

A solução efetiva é:

1. **Fail-fast no proxy** — quando o erro é `max_user_connections`, NÃO fazer retry de conexão (que só piora a saturação)
2. **Retry automático no frontend** — o operador não precisa clicar de novo; o sistema espera 2-3s e tenta sozinho

### Alterações

**1. `supabase/functions/mariadb-proxy/index.ts` — Fail-fast para saturação**
- No loop de retry de conexão (L437-457), detectar `max_user_connections` no erro e sair imediatamente sem retry
- Isso libera a invocação mais rápido, reduzindo pressão no pool

```
// Dentro do catch do loop de conexão:
if (lastError.message.includes('max_user_connections')) {
  break; // Não fazer retry, sair imediatamente
}
```

**2. `src/components/esteira/CreateVoucherDialog.tsx` — Retry automático no submit**
- No `handleSubmitVoucher`, ao receber resposta com `retryable: true`, esperar 2.5s e tentar novamente (máximo 2 retries)
- Mostrar toast "Conexão ocupada, tentando novamente..." durante retry
- Só mostrar erro final se todos os retries falharem

### Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `supabase/functions/mariadb-proxy/index.ts` | Break imediato no retry quando `max_user_connections` |
| `src/components/esteira/CreateVoucherDialog.tsx` | Retry automático (2x) com toast informativo |

### Resultado
- Proxy não agrava saturação fazendo retries desnecessários
- Operador não vê erro na maioria dos casos — sistema retenta sozinho em 2-3s
- Sem mudança na infraestrutura do MariaDB

