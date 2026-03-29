## Usar apenas `t_cct_hawb_api_historico` como fonte da timeline

### Arquivo alterado

**1 arquivo:** `supabase/functions/mariadb-proxy/index.ts` — apenas o `case 'get_cct_events'`

### O que foi feito

1. **Removida** a query a `t_cct_eventos_historico` — essa tabela não é mais consultada
2. **Fonte única**: `t_cct_hawb_api_historico` (ORDER BY consulted_at ASC) para detectar transições reais
3. **Comparação consecutiva**: snapshots são percorridos em ordem cronológica; evento é gerado apenas quando `situacaoAtual` muda em relação ao snapshot anterior
4. **Evento sintético do atual**: query a `t_cct_hawb_api_atual` gera evento adicional se o status mais recente ainda não está no histórico
5. **Novo mapeamento**: adicionado `em trânsito terrestre` → `EM_TRANSITO_TERRESTRE`
6. **nivel_confianca**: todos os eventos agora são `PRIMARIA` (fonte única)
7. **Contrato de saída**: inalterado — mesmos campos retornados ao frontend
