

## Substituir lógica do `get_cct_shipments` pelo SELECT final com CTEs

### Arquivo alterado

**1 arquivo:** `supabase/functions/mariadb-proxy/index.ts`

Nenhuma alteração no frontend.

---

### Alteração 1 — Substituir STEP 1 + STEP 2 + MERGE por query única (linhas 3404-3646)

Remover:
- STEP 1: query separada a `t_cct_hawb_api_atual` + loop de parse de JSONs em JS (linhas 3404-3549)
- STEP 2: query separada a `t_dados_aereo` + loop de montagem do `dadosAereoMap` (linhas 3551-3595)
- MERGE: loop JS que combina os dois maps e monta `enrichedShipments` (linhas 3597-3646)

Substituir por uma única query usando o SELECT fornecido com CTEs `base_cct` e `aereo_latest`, que já entrega todos os campos calculados (cliente, master_final, status_tela, sla_status, peso_declarado/constatado, volume_declarado/constatado, data_decolagem, etc.).

O loop JS pós-query fica simplificado: apenas itera os rows retornados e monta o objeto `enrichedShipments` mapeando os aliases do SELECT para os campos esperados pelo frontend:

```text
SELECT alias          →  campo no payload
─────────────────────────────────────────
cliente               →  cliente
hawb                  →  house
master_final          →  master
status_tela           →  status_cct_oficial (mapeado via mapRfbSituacaoToCCT)
sla_status            →  sla_status (se 'Cumprido' → 'CUMPRIDO')
analista              →  nome_analista
analista_email        →  email_analista
peso_declarado        →  peso_declarado
peso_constatado       →  peso_constatado
volume_declarado      →  volume_declarado
volume_constatado     →  volume_constatado
data_decolagem        →  dep_datetime
data_decolagem_ultimo_trecho → data_decolagem_ultimo_trecho
voo_principal         →  numero_voo
ruc                   →  ruc
aeroporto_origem      →  aeroporto_origem
aeroporto_destino     →  aeroporto_destino
cnpj_consignatario    →  cnpj_consignatario
indicador_madeira     →  indicador_madeira
recinto_aduaneiro_destino → recinto_aduaneiro
duimp_numero          →  (novo, disponível)
qtd_bloqueios_ativos  →  has_bloqueio (> 0)
qtd_tratamentos_especiais → tratamento (usar json_manuseios_especiais)
etd                   →  etd
eta                   →  eta
consulted_at          →  ultimo_evento_data
```

---

### Alteração 2 — Mapear `status_tela` para `status_cct_oficial` canônico (no loop JS pós-query)

O SELECT retorna `status_tela` com valores como `'Entregue'`, `'Recepcionada'`, `'Manifestada'`, `'Em Trânsito Terrestre'`, `'AGUARDANDO_CONSULTA'`. O loop JS precisa converter para o formato canônico que o frontend espera:

```typescript
const mapStatusTelaToCanonical = (st: string | null): string => {
  if (!st) return 'AGUARDANDO_CONSULTA';
  const u = st.toUpperCase().trim();
  if (u === 'ENTREGUE') return 'ENTREGUE';
  if (u === 'RECEPCIONADA') return 'RECEPCIONADA';
  if (u === 'MANIFESTADA') return 'MANIFESTADA';
  if (u.includes('TRÂNSITO') || u.includes('TRANSITO')) return 'EM_TRANSITO_TERRESTRE';
  return 'AGUARDANDO_CONSULTA';
};
```

---

### Alteração 3 — Manter parse de `json_manuseios_especiais` para `tratamento`

O SELECT retorna `qtd_tratamentos_especiais` (count) e `json_manuseios_especiais` (raw JSON). O loop JS precisa parsear o JSON para extrair os códigos separados por vírgula, como já faz hoje:

```typescript
const manuseios = safeParseJson(row.json_manuseios_especiais) || [];
const tratamento = Array.isArray(manuseios) 
  ? manuseios.map((m: any) => typeof m === 'string' ? m : m?.codigo || m?.code || '').filter(Boolean).join(',') 
  : null;
```

---

### Alteração 4 — Manter parse de `json_frete` para `info_frete`

O SELECT retorna `json_frete` raw. O loop JS precisa parsear para o formato `{ moeda, formaPgto, total }` como já faz hoje.

---

### Alteração 5 — Reescrever `get_cct_shipment` (linhas 3767-3819)

Substituir a query atual (que usa `t_status_aereo` + `t_master_dados` + `t_cct_shipments`) por uma versão que usa o mesmo SELECT com CTEs, filtrando por `h.hawb` ou `h.hawb_normalizado` matching o `shipmentId`. Retorna o mesmo formato de payload.

---

### O que permanece inalterado

- `aeroportoPaisMap` (lookup de países, linhas 3356-3369) — mantido
- `CCT_STATUS_ORDER` — mantido (usado no SLA)
- `mapRfbSituacaoToCCT` — mantido (pode ser usado como fallback)
- `safeParseJson` — mantido (usado para `json_manuseios_especiais` e `json_frete`)
- Bloco de SLA Calculation (linhas 3648-3760) — inalterado, recebe `enrichedShipments` no mesmo formato
- Nenhum arquivo frontend
- Nenhum layout, filtro, badge, cor, ou componente

### Resumo

| Mudança | Efeito |
|---|---|
| Query única com CTEs substitui 2 queries + merge JS | Menos código, SQL faz o trabalho pesado |
| `peso_constatado` / `volume_constatado` vêm do SQL | Não mais `null` fixo |
| `volume_declarado` fallback usa `pieces` | Corrigido |
| `status_tela` mapeado para canônico | Frontend continua consumindo mesmo formato |
| `get_cct_shipment` usa mesmas fontes | Detalhe consistente com dashboard |

