

# Otimizar Rastreamento SEA: 1 Consulta API por MBL + Propagação por Irmandade

## Situacao Atual

O sistema ja seleciona um container representante por MBL para consulta, mas:
1. Containers de leasing ainda fazem consultas individuais (BOL-first strategy)
2. A propagacao por irmandade so roda no final, em um passo separado, e apenas para MBLs com "status misto"
3. Containers que falham individualmente nao se beneficiam imediatamente do sucesso de um irmao

## Mudanca Proposta

Alterar o fluxo do `refresh_sea_tracking` para:
1. Consultar a API apenas para o container representante de cada MBL
2. Imediatamente apos sucesso, propagar os dados para TODOS os irmaos daquele MBL (em vez de esperar o final)
3. Marcar todos os irmaos como `last_check = NOW()` para que nao sejam reconsultados no proximo ciclo
4. Remover a logica separada de BOL-first para leasing containers (ja que o representante cobre tudo)

## Detalhes Tecnicos

### Arquivo: `supabase/functions/olimpo-proxy/index.ts`

**1. Query de selecao (ja existente, manter)**
- A query atual ja seleciona 1 container por MBL com prioridade para nao-leasing -- manter como esta

**2. Apos sucesso da API (dentro do loop de processamento)**
- Adicionar propagacao imediata para irmaos:

```text
Para cada container processado com sucesso:
  -> UPDATE t_tracking_sea 
     SET container_status, navio, vessel_imo, eta, last_event, 
         origem, destino, shipping_line, loading_port,
         sibling_synced = 1, sibling_synced_at = NOW(),
         last_check = NOW(), last_error = NULL
     WHERE mbl_id = ? AND id != ? AND active = 1
```

- Isso garante que os irmaos:
  - Recebam os mesmos dados de tracking
  - Tenham `last_check` atualizado (nao serao reconsultados)
  - Sejam marcados como `sibling_synced = 1`

**3. Remover logica BOL-first para leasing (simplificacao)**
- A secao "BOL-FIRST STRATEGY FOR LEASING CONTAINERS" (linhas ~2630-2850) sera simplificada
- Em vez de tratar leasing separadamente, o container representante (ja preferindo nao-leasing) cobre o caso
- Se o representante for leasing (todos do MBL sao leasing), usar shipping_line do banco como ja faz

**4. Sibling sync final (manter como fallback)**
- Manter a logica de sibling sync no final como rede de seguranca para casos edge
- Mas agora sera muito mais rapido pois a maioria dos irmaos ja estara atualizada

**5. Contadores de economia**
- Adicionar log mostrando quantos containers foram atualizados via irmandade vs API direta
- Formato: `[refresh_sea_tracking] Batch: X API calls, Y siblings propagated, Z total updated`

### Fluxo Resumido

```text
1. SELECT 1 container por MBL (preferir nao-leasing)
2. Para cada container:
   a. Chamar API JSONCargo
   b. Se sucesso:
      - Atualizar o container consultado
      - UPDATE SET ... WHERE mbl_id = X AND id != Y  (propagar irmaos)
      - Contar irmaos propagados
   c. Se falha:
      - Registrar erro apenas no container consultado
3. Log final com economia de API calls
```

### Impacto Esperado

- Se um MBL tem 5 containers: 1 API call em vez de 5
- Containers de leasing nao precisam de logica especial (herdam do irmao nao-leasing)
- Reducao estimada de 60-80% nas chamadas API por ciclo de refresh

