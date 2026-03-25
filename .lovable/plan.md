
Objetivo: fazer com que todas as pré-faturas mostrem containers no modal, inclusive as mais antigas.

Diagnóstico confirmado
- O front já está chamando `demurrage_get_containers_by_mbl` corretamente.
- O problema agora está no backend/dados: a action retorna `[]` para vários MBLs testados (`MEDUEC647355`, `MEDUKQ387608`, `MEDUVK324543`, `MEDUK8744501`, `MEDUYP869983`) e retorna dado para pelo menos um (`MEDUWA505645`).
- `pre_invoice_items` também está vazio em várias pré-faturas, então ele não serve hoje como fallback confiável.
- Conclusão: o modal está correto, mas a busca atual depende demais da tabela operacional de demurrage. Para várias faturas históricas, esses registros já não estão mais disponíveis por MBL.

Plano
1. Reforçar a action `demurrage_get_containers_by_mbl` em `supabase/functions/mariadb-proxy/index.ts`
- Manter a busca atual na tabela `t_dachser_demurrage_containers`.
- Normalizar o MBL na consulta (`TRIM`/`UPPER`) para evitar falhas por formatação.
- Se vier vazio, aplicar fallbacks:
  - buscar por `pre_invoice_number` quando o front informar `invoice_number`;
  - se ainda vier vazio, reconstruir os containers a partir das tabelas de tracking (`t_tracking_sea`, `t_consulta_armador`, `t_tracking_sea_history`), sem depender do recorte atual “ativo”.

2. Reaproveitar a lógica já existente de sincronização
- Usar a mesma lógica do sync para montar os campos derivados:
  - `data_atracacao`
  - `ft_started_at`
  - `free_time_end_date`
  - `data_devolucao`
  - `last_event`
  - `excedente_dias`
- Assim o modal continua recebendo o mesmo formato `DemurrageContainer[]`, sem retrabalho no front.

3. Ajustar o hook em `src/hooks/useDemurrageData.ts`
- Fazer `useDemurrageContainersByMbl` enviar também `invoice_number`, não só `mbl`.
- Manter a mesma tipagem de retorno para não quebrar o dialog.

4. Manter o `PreInvoiceDetailsDialog` praticamente como está
- A tabela atual já exibe as colunas corretas.
- Só ajustar a chamada do hook e, se necessário, a mensagem de vazio para aparecer apenas depois de esgotar todos os fallbacks.

5. Endurecer a geração futura das pré-faturas
- Revisar `supabase/functions/demurrage-auto-invoice/index.ts` para garantir que novas pré-faturas sempre tenham snapshot suficiente dos itens/containers.
- Isso evita que casos futuros dependam exclusivamente da tabela operacional viva.

Detalhes técnicos
```text
Novo fluxo
Pré-fatura
  -> mariadb-proxy(demurrage_get_containers_by_mbl, mbl, invoice_number)
     -> 1) busca em demurrage por MBL normalizado
     -> 2) fallback por pre_invoice_number
     -> 3) fallback histórico via tracking + history
     -> retorna DemurrageContainer[]
  -> modal renderiza normalmente
```

Resultado esperado
- Pré-faturas recentes continuam funcionando.
- Pré-faturas antigas também passam a exibir:
  ATA, Último Evento, Medida, Tipo, Descarga, Free Time, Limite de Devolução, Devolução do Vazio, Dias em Posse e Dias Incidentes.
- O modal deixa de depender apenas do estado atual da tabela operacional.
