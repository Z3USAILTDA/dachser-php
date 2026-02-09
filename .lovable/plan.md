

# Plano: Manter processos concluidos visiveis por 5 dias

## Contexto

Atualmente, a clausula HAVING do `get_sea_tracking` oculta processos com status de conclusao (Gate Out, Empty Returned, Delivered via last_event) apos **24 horas** sem atualizacao. Isso remove prematuramente processos como o `HLCUSS5251264386` (SEA EXPORT com "Gate out empty").

## Alteracao

**Arquivo**: `supabase/functions/olimpo-proxy/index.ts` (linha 1819)

Trocar o intervalo de 24 horas para 5 dias (120 horas):

```text
Antes:  AND MAX(ts.last_check) < DATE_SUB(NOW(), INTERVAL 24 HOUR)
Depois: AND MAX(ts.last_check) < DATE_SUB(NOW(), INTERVAL 5 DAY)
```

Isso se aplica ao bloco de filtro nas linhas 1812-1821 que cobre os status:
- `GOD`, `GATE_OUT_FULL`, `EMPTY_RETURNED`, `EMPTY_RECEIVED_AT_CY`
- last_event contendo "DELIVERED", "GATE OUT", "EMPTY RETURNED"

## Resultado Esperado

- Processos com eventos de conclusao permanecerao visiveis na tela por **5 dias** apos o ultimo check-in
- Apos 5 dias sem nova atualizacao, serao ocultados automaticamente
- O MBL `HLCUSS5251264386` voltara a aparecer imediatamente (ultimo check em 06/fev, dentro da janela de 5 dias a partir de hoje 09/fev)

## Observacao

O filtro de status `DELIVERED` / `DLV` puro (linhas 1808-1811) permanece inalterado -- esses sao removidos imediatamente, conforme a politica de cleanup existente.

