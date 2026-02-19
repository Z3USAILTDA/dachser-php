
# Fix: Erro de Conexao na Analise SEA (HBL x MBL)

## Diagnostico

A analise **completou com sucesso** no servidor (run 994, 354 segundos via Gemini Pro), porem o frontend mostrou "Erro de conexao com a internet" porque:

1. **Timeout curto demais**: O polling esta configurado com 300s (5 min), mas a analise levou 354s (quase 6 min)
2. **Tolerancia a erros baixa**: O limite de `maxConsecutiveErrors = 5` e muito restritivo -- erros transientes de conexao MariaDB (`Connection reset by peer`) no `sea-poll-analysis` consomem rapidamente as 5 tentativas
3. **Mensagem de erro generica**: O timeout e erros de polling mostram "Erro de conexao com a internet", quando na verdade o problema e no backend

## Correcoes

### 1. Aumentar tolerancia no polling (`src/services/maritimoApi.ts`)
- Subir `maxConsecutiveErrors` de **5 para 10** -- erros transientes de MariaDB sao comuns e nao devem abortar a analise
- Aumentar o timeout padrao de **10 min para 12 min** para cobrir analises mais longas

### 2. Aumentar timeout na pagina HBL x MBL (`src/pages/SubmeterHblMbl.tsx`)
- Alterar o timeout de `300000` (5 min) para `600000` (10 min) na chamada `pollAnalysisUntilComplete`

### 3. Melhorar mensagens de erro (`src/services/maritimoApi.ts`)
- Diferenciar entre timeout real ("Tempo limite excedido") e erros de conexao consecutivos
- Exibir mensagem mais informativa em vez do generico "Erro de conexao com a internet"

## Detalhes Tecnicos

```text
Arquivo                            Mudanca
-------------------------------------  -----------------------------------------
src/services/maritimoApi.ts        maxConsecutiveErrors: 5 -> 10
                                   timeoutMs default: 10min -> 12min
                                   Mensagens de erro diferenciadas
src/pages/SubmeterHblMbl.tsx       pollAnalysisUntilComplete timeout: 300s -> 600s
```

Nenhuma mudanca em edge functions -- o `sea-poll-analysis` ja foi corrigido com retry logic na mensagem anterior.
