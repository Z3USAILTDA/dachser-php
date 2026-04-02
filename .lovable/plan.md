

## Plano: Enriquecer timeline CCT com dados completos do histórico

### Problema

A `get_cct_events` busca 200 snapshots de `t_cct_hawb_api_historico`, mas só extrai `situacaoAtual` de `json_partes_estoque`. Como a maioria dos snapshots tem o mesmo status ("Recepcionada"), apenas 1 evento de transição é gerado. Outros campos ricos (viagens, bloqueios, divergências, documentos de saída) são ignorados.

### Solução

Expandir a extração de eventos dos snapshots históricos para detectar mudanças em múltiplos campos JSON, não apenas `situacaoAtual`.

### Alteração

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts` — action `get_cct_events`

**1. Expandir o SELECT do histórico** (linha ~6607):
Buscar campos adicionais além de `json_partes_estoque`:
```sql
SELECT id, hawb, consulted_at,
  json_partes_estoque,
  json_viagens_associadas,
  json_bloqueios_ativos,
  json_bloqueios_baixados,
  json_conhecimento_carga_detalhada,
  json_documentos_saida,
  json_divergencias
FROM t_cct_hawb_api_historico
WHERE hawb_normalizado = ?
ORDER BY consulted_at ASC
LIMIT 500
```

**2. Extrair eventos de múltiplas fontes por snapshot**, comparando com o snapshot anterior:

- **Situação (já existente)**: transições de `json_partes_estoque[0].situacaoAtual` → eventos como MANIFESTADO, RECEPCIONADO, etc.
- **Viagens**: mudanças em `json_viagens_associadas` → eventos de voo (DEP com data de partida, chegada prevista). Detectar quando uma viagem nova aparece ou quando `dataPartidaEfetiva` muda.
- **Bloqueios**: quando `json_bloqueios_ativos` muda (novo bloqueio aparece → evento BLOQUEIO; bloqueio some e aparece em `json_bloqueios_baixados` → evento DESBLOQUEIO).
- **Divergências**: quando `json_divergencias` muda de vazio para preenchido → evento DIVERGENCIA_PESO ou DIVERGENCIA_VOLUME.
- **Documentos de saída (DUIMP)**: quando `json_documentos_saida` muda de vazio para preenchido → evento DUIMP_VINCULADA com canal (verde/amarelo/vermelho).
- **Peso/Volume constatado**: quando `json_partes_estoque[0].pesoBrutoConstatado` ou `quantidadeVolumeConstatado` aparece pela primeira vez → evento PESO_CONSTATADO.

**3. Lógica de comparação**: para cada snapshot, extrair "fingerprint" de cada campo. Se diferir do anterior, gerar evento com `consulted_at` como data. Isso evita duplicatas quando múltiplos snapshots consecutivos têm os mesmos dados.

**4. Mapeamento de novos eventos para a timeline do frontend**:
- Adicionar labels no `EventTimeline` component para os novos códigos (DESBLOQUEIO, DIVERGENCIA_PESO, DUIMP_VINCULADA, etc.)
- Cada evento terá: `codigo_evento`, `descricao_evento` (texto legível), `data_hora_evento`, `aeroporto`, `fonte: 'RFB'`

### Exemplo de resultado esperado

Para um HAWB que passou por: Informada → Manifestada → Recepcionada, com 1 bloqueio ativo e 1 DUIMP vinculada:

```text
1. CHEGADA_INFORMADA    | 28/03 10:00 | "Informada"
2. VOO_PARTIDA          | 29/03 14:30 | "LA9505 - MAD→GRU"  
3. MANIFESTADO          | 30/03 08:00 | "Manifestada"
4. BLOQUEIO             | 30/03 12:00 | "Bloqueio ativo"
5. RECEPCIONADO         | 31/03 06:00 | "Recepcionada"
6. DESBLOQUEIO          | 31/03 10:00 | "Bloqueio baixado"
7. PESO_CONSTATADO      | 01/04 09:00 | "373.5 kg"
8. DUIMP_VINCULADA      | 01/04 14:00 | "Canal Verde"
```

### Arquivos alterados

| Arquivo | Ação |
|---|---|
| `supabase/functions/mariadb-proxy/index.ts` | Expandir `get_cct_events`: SELECT + extração multi-campo |
| `src/components/cct/EventTimeline.tsx` | Adicionar labels/ícones para novos códigos de evento |

### O que NÃO muda

- `get_cct_shipments` (dashboard principal)
- Componente ProcessoTimeline (apenas consome os eventos, já funciona com qualquer código)
- Tabelas do banco (nenhuma migração)
- Lógica de status oficial e SLA

