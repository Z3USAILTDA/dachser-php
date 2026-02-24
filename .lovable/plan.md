## Adicionar informacoes de data/hora de rastreio na tela de Monitoramento Maritimo

### Resumo

Duas alteracoes na pagina `/sea/tracking`:

1. **Na tabela expandida de containers**: ao lado das colunas "ETA Tracking" e "ETA Cadastrado", adicionar uma nova coluna **"Ultima Atualização"** mostrando a data e hora do ultimo check do tracking (`last_check` do container/MBL).
2. **Na tabela principal (cabecalho/area superior)**: exibir a **data e hora do ultimo processamento geral do tracking** -- calculada como o `MAX(last_check)` de todos os MBLs carregados, exibida proximo ao indicador de "Ultima sincronizacao" ja existente.

### Alteracoes


| Arquivo                           | Descricao                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/pages/ContainerTracking.tsx` | Adicionar coluna "Ultima Atualização" na sub-tabela de containers + indicador global de ultimo processamento |


### Detalhes tecnicos

**1. Coluna "Ultimo Rastreio" na tabela expandida de containers (sub-tabela)**

- Adicionar `<th>Ultimo Rastreio</th>` no cabecalho da sub-tabela (apos "ETA Cadastrado")
- Adicionar celula exibindo `mbl.last_check` formatado como `dd/MM/yyyy HH:mm` (ou "--" se vazio)
- O campo `last_check` ja e retornado pelo backend no nivel MBL (`MAX(ts.last_check)`)

**2. Indicador global de "Ultimo processamento do tracking" na area superior**

- Calcular `MAX(last_check)` de todos os MBLs carregados usando `useMemo`
- Exibir ao lado do indicador ja existente "Ultima sincronizacao" (linha ~2068)
- Formato: icone de Clock + "Ultimo rastreio: dd/MM/yyyy HH:mm"
- Estilo consistente: `text-xs text-[#666]`

### Dados disponiveis (nenhuma alteracao no backend)

O campo `last_check` ja esta disponivel:

- No nivel MBL: `mbl.last_check` (retornado pela query `get_sea_tracking`)
- No nivel Container: `cnt.last_check` (retornado pela query `get_sea_tracking_containers`)

Nenhuma alteracao em Edge Functions e necessaria.