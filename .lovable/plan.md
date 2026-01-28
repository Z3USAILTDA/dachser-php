
# Plano: Sincronização Automática DEP → CCT

## Problema Identificado

Quando um processo atinge o status **DEP** no tracking, ele **não aparece automaticamente** no CCT porque:

1. **Filtros desalinhados**: O Dashboard CCT filtra por `t_master_dados.data_insert` (26/01), mas o LeadComex sync filtra por `t_status_aereo.dep_datetime` (>= 27/01)
2. **Sem trigger automático**: A edge function `add-awb-to-status` atualiza o status para DEP mas não dispara a criação do shipment no CCT

```text
FLUXO ATUAL (quebrado):
  Tracking detecta DEP
       ↓
  add-awb-to-status salva em t_status_aereo (último_status = 'DEP')
       ↓
  [NADA ACONTECE - CCT não é notificado]
       ↓
  LeadComex sync procura dep_datetime >= 27/01 → 0 HAWBs encontrados
       ↓
  CCT permanece vazio
```

---

## Solução Proposta

### Abordagem: Trigger Automático na Mudança para DEP

Quando um AWB muda para status DEP, o sistema deve automaticamente:
1. Verificar se o HAWB já existe no CCT (tabela `t_cct_shipments` no MariaDB)
2. Se não existir, criar o registro com os dados básicos
3. Inserir o primeiro evento na timeline (`AGUARDANDO_CONSULTA`)

### Mudança 1: Adicionar Trigger DEP → CCT no `add-awb-to-status`

**Arquivo:** `supabase/functions/add-awb-to-status/index.ts`

**Lógica a adicionar (após linha 229):**
```typescript
// AUTO-SYNC TO CCT: When status becomes DEP, create CCT shipment entry
if (isDepStatus && sanitizedHawb && sanitizedHawb !== 'N/A') {
  console.log('[CCT AUTO-SYNC] DEP detected, syncing to CCT...');
  
  try {
    // Check if already exists in t_cct_shipments
    const existingCct = await client.query(`
      SELECT id FROM ${database}.t_cct_shipments 
      WHERE TRIM(house) = TRIM(?)
      LIMIT 1
    `, [sanitizedHawb]);
    
    if (!existingCct || existingCct.length === 0) {
      // Create CCT shipment entry
      await client.execute(`
        INSERT INTO ${database}.t_cct_shipments 
        (house, master, cliente, aeroporto_origem, aeroporto_destino, 
         nome_analista, emails_cliente, status_cct, created_at)
        VALUES (TRIM(?), TRIM(?), TRIM(?), TRIM(?), TRIM(?), 
                TRIM(?), ?, 'AGUARDANDO_CONSULTA', NOW())
        ON DUPLICATE KEY UPDATE 
          master = TRIM(?),
          aeroporto_origem = IF(TRIM(?) != 'N/A', TRIM(?), aeroporto_origem),
          aeroporto_destino = IF(TRIM(?) != 'N/A', TRIM(?), aeroporto_destino)
      `, [
        sanitizedHawb, sanitizedMawb, finalConsigneeName, 
        finalOrigin, finalDestination,
        finalNomeAnalista, finalEmailCliente,
        sanitizedMawb,
        finalOrigin, finalOrigin,
        finalDestination, finalDestination
      ]);
      
      // Insert initial CCT event
      await client.execute(`
        INSERT IGNORE INTO ${database}.t_cct_eventos_historico 
        (awb, codigo_evento, descricao_evento, data_hora_evento, fonte, aeroporto, nivel_confianca)
        VALUES (TRIM(?), 'DEP', 'Processo iniciado - Aguardando consulta LeadComex', NOW(), 'TRACKING', TRIM(?), 'PRIMARIA')
      `, [sanitizedHawb, finalOrigin]);
      
      console.log('[CCT AUTO-SYNC] Created CCT entry for HAWB:', sanitizedHawb);
    } else {
      console.log('[CCT AUTO-SYNC] HAWB already exists in CCT:', sanitizedHawb);
    }
  } catch (cctErr) {
    console.error('[CCT AUTO-SYNC] Error (non-fatal):', cctErr);
    // Don't fail the main operation
  }
}
```

### Mudança 2: Alinhar Filtros do LeadComex Sync

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts`

**Localização:** Ação `get_cct_pending_hawbs` (linha ~10679)

**Antes:**
```sql
AND s.dep_datetime >= '2026-01-27 00:00:00'
```

**Depois:**
```sql
AND s.awb IN (
  SELECT DISTINCT mawb 
  FROM ${database}.t_master_dados 
  WHERE data_insert >= '2026-01-26 00:00:00'
  AND data_insert < '2026-01-27 00:00:00'
  AND tipo_processo = 'AIR IMPORT'
)
```

---

## Diagrama do Fluxo Corrigido

```text
FLUXO CORRIGIDO:
  Tracking detecta DEP
       ↓
  add-awb-to-status:
    1. Salva em t_status_aereo (último_status = 'DEP')
    2. [NOVO] Cria registro em t_cct_shipments (status = 'AGUARDANDO_CONSULTA')
    3. [NOVO] Insere evento DEP em t_cct_eventos_historico
       ↓
  CCT Dashboard exibe o processo imediatamente
       ↓
  LeadComex sync (cron 10min):
    - Encontra HAWBs via subquery alinhada com Dashboard
    - Enriquece com dados da API LeadComex
    - Atualiza timeline com novos eventos
```

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/add-awb-to-status/index.ts` | Adicionar trigger automático DEP → CCT após linha 229 |
| `supabase/functions/mariadb-proxy/index.ts` | Substituir filtro `dep_datetime >= 27/01` por subquery em `t_master_dados` (linha ~10679) |

---

## Verificação da Tabela t_cct_shipments

A tabela `t_cct_shipments` no MariaDB precisa existir com as colunas:
- `house` (HAWB - chave única)
- `master` (MAWB)
- `cliente`
- `aeroporto_origem`
- `aeroporto_destino`
- `nome_analista`
- `emails_cliente`
- `status_cct`
- `created_at`

Se a tabela não existir ou faltar colunas, será necessário criar/ajustar via migration no MariaDB.

---

## Resultado Esperado

Após a implementação:

1. **Imediato**: Quando um AWB atinge DEP, o processo aparece no CCT Dashboard com status "AGUARDANDO_CONSULTA"
2. **Dentro de 10 minutos**: O cron LeadComex enriquece o processo com dados da API
3. **Timeline populada**: Eventos são inseridos conforme status muda na LeadComex

---

## Plano de Teste

1. Disparar tracking de um AWB novo que resultará em DEP
2. Verificar nos logs de `add-awb-to-status` a mensagem "[CCT AUTO-SYNC]"
3. Acessar o CCT Dashboard e confirmar que o processo aparece
4. Aguardar 10 minutos e verificar se LeadComex enriquece o processo
5. Verificar timeline com eventos históricos
