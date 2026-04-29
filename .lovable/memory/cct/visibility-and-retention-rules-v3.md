---
name: CCT Visibility & Retention Rules
description: HAWB visibility rules — entregues ocultos após 5 dias do evento via tabela cct_hidden_hawbs
type: feature
---

## Regra de retenção pós-entrega (CCT)

Processos CCT cujo **último evento da timeline é "Entregue"** são persistidos na tabela própria do módulo `public.cct_hidden_hawbs` (NÃO reutilizar `air_hidden_awbs`).

Colunas relevantes:
- `hawb` (unique)
- `reason` (default `ENTREGUE`)
- `delivered_at` — **data real do evento de entrega da timeline**, não `updated_at`

## Onde a lógica vive

Frontend, em `src/hooks/useCCTData.ts → useProcessosCCT`:

1. Após carregar os processos do `mariadb-proxy/get_cct_shipments_cached`, detecta os HAWBs com último evento "Entregue" e faz `upsert({ onConflict: 'hawb', ignoreDuplicates: true })` em `cct_hidden_hawbs` com `delivered_at` = data do evento.
2. Lê todos os registros de `cct_hidden_hawbs` e calcula `expiredHidden` = HAWBs cujo `delivered_at` é mais antigo que **5 dias**.
3. Filtra `allProcessos` removendo apenas os HAWBs em `expiredHidden`.

## Comportamento esperado

- HAWB entregue **continua visível pelos primeiros 5 dias** após a data do evento.
- Após 5 dias, é ocultado da listagem padrão automaticamente.
- A tela de detalhe (`ProcessoTimeline`) continua acessível por URL direta.
- `ProcessosTable.tsx` NÃO aplica filtro de retenção — confia no hook.
- Tabela `cct_hidden_hawbs` é independente de `air_hidden_awbs`.
