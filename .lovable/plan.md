

## Trocar fonte do CCT: remover `t_master_dados` / `t_cct_shipments` / `t_cct_eventos_historico` → usar `t_dados_aereo`

### O que muda

No `supabase/functions/mariadb-proxy/index.ts`, action `get_cct_shipments` (linhas ~3404-3876):

**Remover:**
- STEP 2 (linhas 3551-3587): query a `t_master_dados` para cliente/analista
- STEP 2.5 (linhas 3630-3683): query a `t_cct_shipments` para pesos/volumes/ETD/ETA e `t_master_dados` para tratamento
- STEP 3 (linhas 3685-3734): query a `t_cct_eventos_historico` para override de status
- MERGE (linhas 3736-3762): enriquecimento com `cctDataMap` e `eventosHistoricoMap`

**Manter:**
- STEP 1 (linhas 3404-3549): query a `t_cct_hawb_api_atual` + parsing de JSONs → `hawbApiMap`
- SLA Calculation (linhas 3764-3876): cálculo de SLA, divergências, bloqueios
- Funções auxiliares: `determinarTipoVoo`, `calcularSlaLimite`, `calcularSlaStatus`, `mapRfbSituacaoToCCT`

**Adicionar (novo STEP 2):** query a `t_dados_aereo` para complemento

```sql
SELECT *
FROM (
  SELECT
    TRIM(a.hawb_number) AS hawb,
    a.awb_number,
    a.consignee_nome,
    a.gross_weight_kg,
    a.volume_cbm,
    a.pieces,
    a.clerk,
    a.clerk_email,
    a.etd,
    a.eta,
    a.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY TRIM(a.hawb_number)
      ORDER BY a.created_at DESC
    ) AS rn
  FROM t_dados_aereo a
  WHERE a.hawb_number IS NOT NULL
    AND TRIM(a.hawb_number) != ''
    AND TRIM(a.hawb_number) IN ({hawbList})
) x
WHERE x.rn = 1
```

### Novo fluxo de merge

```text
hawbApiMap (t_cct_hawb_api_atual)
  │
  ├── Para cada HAWB:
  │     ├── Dados RFB: mawb, aeroportos, ruc, status, bloqueios, frete, peso, volume (dos JSONs)
  │     └── Complemento t_dados_aereo (optional):
  │           ├── cliente = consignee_nome
  │           ├── clerk / clerk_email (analista)
  │           ├── eta / etd
  │           ├── gross_weight_kg / volume_cbm / pieces
  │           └── awb_number (MAWB fallback)
  │
  └── SLA calculation (mesma lógica atual, campos das novas fontes)
```

### Novo status_cct_oficial (sem t_cct_eventos_historico)

Prioridade:
1. `json_partes_estoque` → `situacaoAtual` (já parseado no STEP 1 como `rfb_status_cct`)
2. `json_identificacao` → `situacaoPortal`
3. `json_conhecimento_carga_detalhada` → `situacao`
4. Fallback: `AGUARDANDO_CONSULTA`

Isso já está parcialmente implementado no STEP 1 atual. Basta adicionar os fallbacks 2 e 3.

### Eventos para o frontend (sem t_cct_eventos_historico)

Montar array `eventos` a partir dos JSONs já parseados:
- `json_partes_estoque` → evento por cada parte com `situacaoAtual` + `dataHoraSituacao`
- `json_bloqueios_ativos` → evento tipo BLOQUEIO
- `json_bloqueios_baixados` → evento tipo DESBLOQUEIO
- `json_viagens_associadas` → evento de partida/chegada
- `json_documentos_saida` → evento de documento vinculado

### Campos do objeto final mapeados

| Campo frontend | Fonte nova |
|---|---|
| `cliente` | `t_dados_aereo.consignee_nome` |
| `nome_analista` | `t_dados_aereo.clerk` |
| `email_analista` | `t_dados_aereo.clerk_email` |
| `master` | `apiInfo.mawb` ou `t_dados_aereo.awb_number` |
| `eta` | `t_dados_aereo.eta` |
| `etd` | `t_dados_aereo.etd` |
| `peso_declarado` | `apiInfo.peso_declarado_rfb` ou `t_dados_aereo.gross_weight_kg` |
| `volume_declarado` | `apiInfo.volume_declarado_rfb` ou `t_dados_aereo.volume_cbm` |
| `peso_constatado` | removido (não existe em t_dados_aereo) |
| `volume_constatado` | removido (não existe em t_dados_aereo) |
| `tratamento` | `apiInfo.manuseios_especiais` |
| `status_cct_oficial` | `apiInfo.rfb_status_cct` (dos JSONs) |

### Resumo

| Ação | Detalhe |
|---|---|
| Remover query `t_master_dados` | STEP 2 antigo |
| Remover query `t_cct_shipments` | STEP 2.5 antigo |
| Remover query `t_cct_eventos_historico` | STEP 3 antigo |
| Adicionar query `t_dados_aereo` | Novo STEP 2 |
| Ajustar merge | Iterar `hawbApiMap`, enriquecer com `dadosAereoMap` |
| Ajustar status | Usar apenas JSONs da API (sem override do histórico) |
| Montar eventos dos JSONs | Substituir array vindo do histórico |
| SLA | Mesma lógica, campos de novas fontes |

**1 arquivo alterado:** `supabase/functions/mariadb-proxy/index.ts`
**Nenhuma alteração no frontend.**

