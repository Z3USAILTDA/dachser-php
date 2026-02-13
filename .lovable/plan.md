

# Diagnostico: Chamadas JsonCargo e Containers Pendentes

## Problema 1: `enrich_sea_containers` retorna 0 -- nada para processar

A funcao `enrich_sea_containers` so processa containers com status `PENDENTE`. Porem, os containers problematicos (HLCUSS5260224404, HLCUSS5260224766, EGLV143664214950) ja foram tentados anteriormente e marcados como `NAO_ENCONTRADO`. Uma vez com esse status, eles **nunca mais sao reprocessados**.

Ou seja: o JsonCargo nao esta "falhando" agora -- ele falhou uma vez no passado para esses MBLs, e o sistema nao tenta novamente.

## Problema 2: Prefixo `EGLV` ausente no mapa de enriquecimento

O MBL `EGLV143664214950` (FISCHER BRASIL) e da Evergreen. O mapa de prefixos no `refresh_sea_tracking` (linha 2566) reconhece `EGLV` como EVERGREEN, mas o mapa no `enrich_sea_containers` (linhas 3260-3278) **nao inclui `EGLV`**. Isso faz com que a chamada a API seja feita sem especificar o armador, o que pode causar falha na busca.

## Problema 3: Containers com ID valido mas sem dados de rastreio

O container BMOU6536163 (MBL HLCUHAM2512AVRE3, STIHL) tem um ID valido mas `container_status: null`, `last_event: null`. Ele foi verificado hoje as 12:44, mas a API nao retornou dados. Como o `last_check` e recente, o `refresh_sea_tracking` nao o reprocessa por respeitar o intervalo de `stale_hours=4`.

## Solucao Proposta

### 1. Adicionar prefixo `EGLV` ao mapa de enriquecimento
No `enrich_sea_containers`, adicionar `'EGLV': 'EVERGREEN'` ao dicionario `MBL_PREFIX_TO_SHIPPING_LINE`.

### 2. Criar mecanismo de retry para `NAO_ENCONTRADO`
Modificar a query do `enrich_sea_containers` para tambem incluir containers `NAO_ENCONTRADO` que foram marcados ha mais de 24 horas. Isso permite que MBLs que falharam sejam retentados periodicamente:

```sql
WHERE active = 1 AND (
  container = 'PENDENTE' OR container IS NULL OR container = ''
  OR (container = 'NAO_ENCONTRADO' AND updated_at < DATE_SUB(NOW(), INTERVAL 24 HOUR))
)
```

### 3. Adicionar botao "Retentar Enriquecimento" na UI
Para MBLs com status `NAO_ENCONTRADO`, permitir que o usuario force uma nova tentativa manual, resetando o container para `PENDENTE` e chamando `enrich_sea_containers` em seguida.

### 4. Correcao imediata dos MBLs atuais
Executar um reset dos containers `NAO_ENCONTRADO` que o usuario quer retentar:
- No `enrich_sea_containers`, adicionar parametro opcional `force_retry=true` que inclui `NAO_ENCONTRADO` na busca
- Ou via nova acao `retry_nao_encontrado` que reseta esses containers para `PENDENTE`

## Detalhes Tecnicos

**Arquivo: `supabase/functions/olimpo-proxy/index.ts`**

1. **Linha ~3261**: Adicionar `'EGLV': 'EVERGREEN'` ao `MBL_PREFIX_TO_SHIPPING_LINE`

2. **Linhas ~3364-3368**: Alterar query para incluir retry de `NAO_ENCONTRADO`:
```sql
SELECT DISTINCT mbl_id, consignee, email_analista, email_cliente, tipo_processo
FROM dados_dachser.t_tracking_sea
WHERE active = 1 AND (
  container = 'PENDENTE' OR container IS NULL OR container = ''
  OR (container = 'NAO_ENCONTRADO' AND updated_at < DATE_SUB(NOW(), INTERVAL 24 HOUR))
)
```

3. **Nova acao `reset_nao_encontrado`**: Permite forcar retry manual, resetando `NAO_ENCONTRADO` para `PENDENTE` em MBLs especificos ou em todos

4. **Pagina ContainerTracking.tsx**: Adicionar botao de retry visivel quando o container esta com status `NAO_ENCONTRADO`, chamando a nova acao

## Resumo do Impacto
- Containers `NAO_ENCONTRADO` passam a ser retentados automaticamente a cada 24h
- `EGLV` (Evergreen) sera reconhecido corretamente na busca de containers
- Usuario pode forcar retry manual quando necessario
- Sem breaking changes em funcionalidades existentes

