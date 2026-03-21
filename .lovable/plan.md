

## Plano: Reestruturar tabela do monitoramento marítimo com coluna Rota unificada

### Objetivo

Substituir as 3 colunas separadas (Origem, Escala, Destino) por uma única coluna **Rota** com visual igual ao tracking aéreo, e remover a coluna **Ações** do cabeçalho principal. Colunas finais:

**MBL | Consignee | Coordenador | Armador/Coloader | Rota | Timeline | Status | Situação**

### Coluna Rota — Visual

Exibir como o tracking aéreo: `ORIGEM → ESCALA → DESTINO` em linha, com highlight baseado no status atual:

```text
LAEM CHABANG → YANTIAN → SANTOS
   (inativo)    (ativo)   (inativo)
```

- **Pré-embarque** (BKG, CLT, GIO): highlight na origem
- **Em trânsito** (CRG, DEP, TSP): highlight na escala (se existir), senão na origem
- **Chegada/Liberação/Entrega** (ARR, DCH, INS, GOD, DLV): highlight no destino
- Múltiplas escalas separadas por `; ` no `transshipment_port` → cada uma mostrada como ponto intermediário
- Sem escala → exibe apenas `ORIGEM → DESTINO`
- Cor ativa: `text-[#ffc800] font-semibold` / Cor inativa: `text-muted-foreground`

### Alteração

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/ContainerTracking.tsx` | (1) Substituir `<th>` de Origem + Escala + Destino por uma única `<th>Rota</th>`. (2) Substituir as 3 `<td>` correspondentes por uma única `<td>` com lógica de rota visual (origem → escalas → destino com highlighting). (3) Remover coluna Ações do `<thead>` e mover botões de ação para dentro da linha expandida ou manter como última coluna sem header visível |

### Detalhes técnicos

- Dados disponíveis no objeto `mbl`: `mbl.origem`, `mbl.destino`, `mbl.transshipment_port` (string com `; ` como separador para múltiplas escalas)
- Status atual via `reportStatus.etapa`: `PRE_EMBARQUE`, `EMBARQUE`, `TRANSITO`, `CHEGADA`, `LIBERACAO`, `ENTREGA`
- Reutilizar padrão exato do air tracking (Index.tsx linhas 2780-2794) adaptado para contexto marítimo
- Manter coluna Ações como última coluna (botões de expandir, mapa, etc.) — remover apenas do header se o user quiser, ou manter discreto

