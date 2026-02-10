

## Corrigir Nomenclaturas de Status no Rastreio Aereo

### Problema

Apos a migracao para `t_aereo_ws`, os codigos de status exibidos na tela estao diferentes do esperado. Isso acontece porque:

1. O campo `last_event` do frontend recebe `status_info || ultimo_status`
2. O `status_info` de `t_aereo_ws` tem formato diferente do antigo: `"(NFD) Cargo and documents ready..."` em vez de `"NFD - Notificado"`
3. A funcao `getStatusCode()` nao consegue extrair as siglas corretamente desse novo formato
4. Exemplos do problema:
   - `"Booked. Flight IB267..."` -> exibe `"BOO"` em vez de `"BKD"`
   - `"(NFD) Cargo and documents..."` -> pode exibir `"(NF"` em vez de `"NFD"`
   - `"UNK"` -> codigo novo que nao existia antes

### Solucao

Ajustar o mapeamento no `fetchStatusAereoData` para separar corretamente o **codigo de status** da **descricao do evento**, usando os campos certos da API:

- `status` <- `ultimo_status` (codigo limpo: NFD, DLV, ARR, DEP, UNK...)
- `last_event` <- `ultimo_status` (para a funcao `getStatusCode` funcionar corretamente)
- Adicionar campo de descricao separado para exibir `status_info` no tooltip

### Detalhes Tecnicos

#### 1. `src/pages/Index.tsx` - Ajustar mapeamento de campos (linhas 520-541)

Alterar o mapeamento dentro de `fetchStatusAereoData`:

```text
ANTES:
  last_event: item.status_info || item.ultimo_status || "-"
  status: item.ultimo_status || "-"

DEPOIS:
  last_event: item.ultimo_status || "-"
  status: item.ultimo_status || "-"
  status_description: item.status_info || null
```

#### 2. `src/pages/Index.tsx` - Interface AWBData

Adicionar campo `status_description` opcional na interface para guardar a descricao completa do `status_info`.

#### 3. `src/pages/Index.tsx` - Adicionar `"UNK"` aos codigos conhecidos

Incluir `"UNK"` na lista `knownStatusCodes` (linha 206) e no `progressMap` com posicao 0 (inicio da timeline, pois e desconhecido).

#### 4. `src/pages/Index.tsx` - Tooltip de status

Nos locais onde o tooltip exibe informacoes do status (ao passar o mouse), usar `status_description` para mostrar a descricao completa do ParcelsApp em vez de tentar derivar do codigo.

### Arquivos Modificados

1. **src/pages/Index.tsx** - Ajustar mapeamento de campos, interface AWBData, knownStatusCodes, e tooltips de status
