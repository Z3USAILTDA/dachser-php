

## Corrigir Fallback para incluir AWBs com status UNK

### Problema Identificado
O fallback para `t_aereo_api` nao esta disparando porque:
- Existem **46 AWBs com status "UNK"** e **5 com status NULL** na `t_aereo_ws`
- Todos esses 51 AWBs **possuem** `timeline_json` preenchido
- O criterio atual exige que o status seja invalido **E** a timeline esteja vazia
- Como a timeline esta preenchida, nenhum AWB entra no fallback

### Solucao

Modificar o criterio do PASSO 1.5 em `supabase/functions/fetch-status-aereo/index.ts`:

1. Adicionar `"UNK"` a lista de status invalidos
2. Relaxar a condicao: verificar o fallback **somente pelo status invalido**, sem exigir que a timeline tambem esteja vazia
3. Se o AWB existir na `t_aereo_api` com dados validos, substituir tanto o status quanto a timeline pelos dados da API (que serao mais confiáveis)

### Criterio Atualizado

**Antes:**
```text
Status invalido (NULL, vazio, N/A, NOT_FOUND, ERRO) 
  E timeline vazia
```

**Depois:**
```text
Status invalido (NULL, vazio, N/A, NOT_FOUND, ERRO, UNK)
  (sem exigir timeline vazia)
```

### Secao Tecnica

**Arquivo:** `supabase/functions/fetch-status-aereo/index.ts`

Alteracoes no PASSO 1.5:
- Adicionar `'UNK'` ao Set `invalidStatuses`
- Remover a condicao `&& !timeline` do filtro de AWBs sem dados
- Manter a logica de substituicao: se a `t_aereo_api` tiver dados validos, sobrescrever status, origin, destination e timeline_json do registro ws

Isso fara com que os 51 AWBs (46 UNK + 5 NULL) sejam verificados na `t_aereo_api`, e os que tiverem dados validos la serao enriquecidos com a informacao correta.
