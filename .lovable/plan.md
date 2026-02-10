
## Ajustes na Timeline de Rastreio Aereo

### Problema 1: AWBs com erro e sem dados no fallback
Quando a timeline contem mensagem de erro (ex: "Nao foi possivel detectar a operadora...") e nao existe registro na `t_aereo_api`, o modal mostra a mensagem de erro crua como se fosse um evento normal. Deve exibir um estado claro de "Falha no rastreio".

### Problema 2: Ordem da timeline
Os eventos nao estao sendo ordenados em ordem decrescente (mais recente primeiro).

### Solucao

**Arquivo 1: `supabase/functions/mariadb-proxy/index.ts`** (acao `get_awb_tracking_events`)

1. Apos o fallback, se `timelineData` continuar vazia ou contiver apenas mensagens de erro, retornar um campo especial `tracking_failed: true` na resposta em vez de um array vazio
2. Ordenar os eventos por `data_hora_evento` em ordem decrescente antes de retornar

**Arquivo 2: `src/components/air/AwbTimelineModal.tsx`**

1. Detectar o campo `tracking_failed` na resposta e exibir um estado visual de "Falha no rastreio" com icone vermelho e mensagem amigavel
2. Adicionar ordenacao decrescente dos eventos por data no frontend como garantia adicional (caso o backend ja nao ordene)
3. Filtrar eventos que contenham frases de erro conhecidas para que nunca sejam exibidos como eventos validos

---

### Secao Tecnica

**`supabase/functions/mariadb-proxy/index.ts`** - acao `get_awb_tracking_events`:
- Apos a linha 5866, adicionar verificacao: se `timelineData` esta vazia ou todos os itens contem frases de erro, retornar `{ success: true, data: [], tracking_failed: true }`
- Antes de retornar os eventos (linha 5943), ordenar o array `events` por `data_hora_evento` DESC usando `sort()` com comparacao de datas
- Filtrar do array final qualquer evento cuja descricao contenha frases de erro conhecidas

**`src/components/air/AwbTimelineModal.tsx`**:
- Atualizar a interface de retorno do `useQuery` para incluir `tracking_failed`
- Adicionar estado visual "Falha no Rastreio" com icone `AlertTriangle` vermelho, texto "Rastreamento indisponivel para este AWB" e subtexto "Nao foi possivel obter dados de rastreio em nenhuma fonte disponivel"
- Adicionar `.sort()` por `data_hora_evento` DESC nos eventos recebidos como camada de seguranca
