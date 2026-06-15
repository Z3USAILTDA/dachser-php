## Problema

No header do monitoramento marítimo, o indicador **"Último rastreio"** mostra `02/06/2026 15:01`, divergindo do valor por processo. Isso ocorre porque ele agrega o campo `last_check` retornado pelo backend, que na verdade é o **alias de `last_event_timestamp`** (data do último evento do armador) — e não a hora em que o job realmente consultou a API.

A coluna por processo na tabela de containers já mostra o valor correto (`last_check_real`, vindo de `t_sea_tracking_current.last_check`).

## Mudança

Arquivo: `src/pages/ContainerTracking.tsx` (linhas ~2454-2468)

Trocar a agregação para usar `mbl.last_check_real` em vez de `mbl.last_check` no cálculo do "Último rastreio" do header.

```text
maxLastCheck = MAX(parse(m.last_check_real))   // antes: m.last_check
```

Nada mais muda:
- Backend (`olimpo-proxy` action `get_sea_tracking`) continua expondo os dois campos.
- A coluna "Última Atualização" por linha continua usando `last_check` (último evento), preservando o comportamento atual.
- A coluna "Última Verificação" por linha continua usando `last_check_real`.

## Resultado esperado

O "Último rastreio" no topo passa a refletir a **última vez que o job sincronizou com a API do armador** (mesmo valor mostrado na coluna "Última Verificação" por processo), alinhado com o que o usuário espera.
