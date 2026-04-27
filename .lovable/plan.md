## Entendimento do erro

O erro da imagem não é mais o erro de coluna inexistente (`m.consignee` / `m.tratamentos_especiais`). Agora o backend está conseguindo iniciar a consulta, mas o MariaDB está falhando por indisponibilidade/saturação.

Evidências encontradas:

```text
get_cct_shipments_cached -> Connection read timed out
get_cct_shipments_cached -> User 'root' has exceeded the 'max_user_connections' resource (current value: 30)
```

Ou seja: a tela `/air/cct` chama a função `mariadb-proxy`, ação `get_cct_shipments_cached`. Essa ação abre conexão com o MariaDB e executa uma consulta sobre `t_cct_dashboard_cache`, complementando com `t_master_dados`, `t_dados_aereo` e `t_fato_aereo`. Em alguns momentos, a consulta demora demais ou não consegue abrir conexão porque o usuário MariaDB chegou ao limite de 30 conexões simultâneas.

A mensagem visual aparece porque o hook do CCT recebe:

```json
{
  "success": false,
  "error": "Servidor temporariamente indisponível. Tente novamente em alguns segundos.",
  "details": "Connection read timed out",
  "retryable": true,
  "transient": true
}
```

## Causa provável

Há uma combinação de dois fatores:

1. **Saturação real do MariaDB**
   - O log mostra `max_user_connections`, então o banco está recusando novas conexões para o usuário atual.
   - Também há `Connection read timed out`, indicando consulta lenta, fila, lock, carga alta ou resposta demorada.

2. **A tela CCT aumenta a pressão quando há falha**
   - `useProcessosCCT` usa React Query com `refetchInterval: 60000`.
   - Quando a consulta falha, o React Query também pode refazer tentativas automáticas.
   - Como o backend devolve HTTP 200 mesmo para erro transitório, o frontend trata `success:false` como erro e pode entrar em novas tentativas.
   - Várias abas/usuários acessando o CCT ao mesmo tempo podem empilhar chamadas iguais de `get_cct_shipments_cached`.

## Plano de correção

### 1. Reduzir pressão no frontend CCT

Arquivo: `src/hooks/useCCTData.ts`

Ajustar `useProcessosCCT` para:

- Limitar tentativas automáticas para erro transitório.
- Aplicar backoff maior quando o erro for `Servidor temporariamente indisponível`.
- Evitar refetch agressivo enquanto o backend estiver retornando indisponibilidade.
- Manter dados anteriores na tela quando houver erro transitório, para não causar sensação de tela quebrada.

### 2. Tratar erro transitório de forma menos invasiva na UI

Arquivo: `src/pages/cct/CCTDashboard.tsx`

Hoje a tela exibe banner vermelho:

```text
Erro ao conectar: Servidor temporariamente indisponível...
```

Mas a memória do projeto diz para não mostrar banners visuais de erro/offline para falhas de conexão com banco. Então a correção será:

- Remover ou suavizar esse banner para erros transitórios de conexão.
- Se houver dados em cache, manter a tabela/cards visíveis.
- Para indisponibilidade temporária, não exibir alerta vermelho permanente no topo.

### 3. Proteger o backend contra retries que pioram saturação

Arquivo: `supabase/functions/mariadb-proxy/index.ts`

A função já detecta `max_user_connections` e `Connection read timed out`, mas ainda há pontos que podem piorar a carga. Ajustar de forma cirúrgica:

- Para `max_user_connections`, continuar fail-fast, sem retry.
- Para `get_cct_shipments_cached`, evitar múltiplas tentativas de consulta pesada quando o banco já está demorando.
- Manter retorno controlado `{ success:false, retryable:true, transient:true }`, mas sem abrir novas conexões desnecessárias.

### 4. Avaliar a consulta `get_cct_shipments_cached` sem alterar a regra de negócio

Arquivo: `supabase/functions/mariadb-proxy/index.ts`

Revisar apenas o trecho dessa query para reduzir custo, mantendo as regras já definidas:

- Fonte principal: `t_cct_dashboard_cache`.
- Complemento por HAWB em `t_master_dados`.
- Fallback em `t_dados_aereo` quando AWB/HAWB não existir no master.
- Rota via `t_fato_aereo`.
- Collation explícita `utf8mb4_unicode_ci` nos joins.

Possíveis ajustes cirúrgicos:

- Garantir que subqueries de `t_master_dados` e `t_dados_aereo` selecionem apenas colunas necessárias.
- Evitar ordenações/subqueries desnecessárias quando possível.
- Preservar o contrato atual esperado pelo frontend.

## Resultado esperado

Depois da correção:

- A tela CCT deixa de martelar o MariaDB quando ele está saturado.
- Erros transitórios não geram banner vermelho persistente nem sensação de quebra.
- Dados já carregados continuam visíveis enquanto uma atualização falha.
- O backend continua retornando falhas controladas, mas com menor risco de multiplicar conexões.
- A regra de preenchimento permanece:
  - `t_master_dados` quando houver dados do master;
  - `t_dados_aereo` como fallback;
  - rota via `t_fato_aereo`.