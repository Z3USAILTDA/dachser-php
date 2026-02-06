
# Implementação: UPSERT no Upload Master (Air/Sea)

## Resumo

Modificar a action `bulk_insert_master` no backend para usar `INSERT ... ON DUPLICATE KEY UPDATE`, atualizando registros existentes ao invés de falhar quando já existem. A chave de unicidade será baseada nos campos identificadores: `master` + `hawb` para AIR e `master` + `hbl` para SEA.

---

## Análise da Situação Atual

O código atual em `supabase/functions/mariadb-proxy/index.ts` (linhas 11418-11567) faz apenas `INSERT`:

```typescript
await client.execute(`
  INSERT INTO ${tableName} (...)
  VALUES (?, ?, ?, ...)
`, [...]);
```

Se um registro já existir com a mesma chave, ocorre erro de duplicação.

---

## Solução Proposta

### 1. Adicionar Índice Único nas Tabelas (via setup)

Para garantir que o UPSERT funcione corretamente, é necessário criar índices únicos nas tabelas:

**Para `t_air_master`:**
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_master_hawb 
ON dados_dachser.t_air_master (master, hawb);
```

**Para `t_sea_master`:**
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_master_hbl 
ON dados_dachser.t_sea_master (master, hbl);
```

### 2. Modificar `bulk_insert_master` para UPSERT

Adicionar `ON DUPLICATE KEY UPDATE` que atualiza todos os campos não-chave quando um registro duplicado é encontrado.

---

## Alterações Técnicas

### Arquivo: `supabase/functions/mariadb-proxy/index.ts`

**Action `bulk_insert_master`** (linhas 11418-11567)

Modificar os INSERTs para incluir cláusula UPSERT:

```typescript
// ==================== BULK INSERT MASTER (AIR/SEA) ====================
case 'bulk_insert_master': {
  const { rows, modal } = body as { 
    rows?: Array<{...}>;
    modal?: 'AIR' | 'SEA';
  };
  
  // ... validações existentes ...
  
  // Garantir que índice único existe
  try {
    if (modal === 'AIR') {
      await client.execute(`
        CREATE INDEX IF NOT EXISTS idx_unique_master_hawb 
        ON dados_dachser.t_air_master (master(100), hawb(100))
      `);
    } else {
      await client.execute(`
        CREATE INDEX IF NOT EXISTS idx_unique_master_hbl 
        ON dados_dachser.t_sea_master (master(100), hbl(100))
      `);
    }
  } catch (indexErr) {
    // Ignorar erro se índice já existe ou não puder ser criado
    console.warn(`[bulk_insert_master] Index creation warning:`, indexErr);
  }
  
  let inserted = 0;
  let updated = 0;
  const errors: Array<{index: number; message: string}> = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (modal === 'SEA') {
        // UPSERT para SEA
        const result = await client.execute(`
          INSERT INTO ${tableName} (
            nome_analista, customer_no, po, hbl, hawb, master,
            etd, pre_alert_sent, oea_cl_doc, customer_order,
            accrual, dep, eta_ata, email_title, te, at_field,
            wh_treatment, cct_transm, remarks, tipo_processo, data_insert,
            deadline_draft_vgm, drafts_sent, deadline_load, cargo_departed,
            d_term, pod_available, dn_available
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            nome_analista = COALESCE(VALUES(nome_analista), nome_analista),
            customer_no = COALESCE(VALUES(customer_no), customer_no),
            po = COALESCE(VALUES(po), po),
            hawb = COALESCE(VALUES(hawb), hawb),
            etd = COALESCE(VALUES(etd), etd),
            pre_alert_sent = COALESCE(VALUES(pre_alert_sent), pre_alert_sent),
            oea_cl_doc = COALESCE(VALUES(oea_cl_doc), oea_cl_doc),
            customer_order = COALESCE(VALUES(customer_order), customer_order),
            accrual = COALESCE(VALUES(accrual), accrual),
            dep = COALESCE(VALUES(dep), dep),
            eta_ata = COALESCE(VALUES(eta_ata), eta_ata),
            email_title = COALESCE(VALUES(email_title), email_title),
            te = COALESCE(VALUES(te), te),
            at_field = COALESCE(VALUES(at_field), at_field),
            wh_treatment = COALESCE(VALUES(wh_treatment), wh_treatment),
            cct_transm = COALESCE(VALUES(cct_transm), cct_transm),
            remarks = COALESCE(VALUES(remarks), remarks),
            tipo_processo = COALESCE(VALUES(tipo_processo), tipo_processo),
            data_insert = COALESCE(VALUES(data_insert), data_insert),
            deadline_draft_vgm = COALESCE(VALUES(deadline_draft_vgm), deadline_draft_vgm),
            drafts_sent = COALESCE(VALUES(drafts_sent), drafts_sent),
            deadline_load = COALESCE(VALUES(deadline_load), deadline_load),
            cargo_departed = COALESCE(VALUES(cargo_departed), cargo_departed),
            d_term = COALESCE(VALUES(d_term), d_term),
            pod_available = COALESCE(VALUES(pod_available), pod_available),
            dn_available = COALESCE(VALUES(dn_available), dn_available)
        `, [...values]);
        
        // affectedRows = 1 (insert) ou 2 (update)
        if (result.affectedRows === 1) {
          inserted++;
        } else if (result.affectedRows === 2) {
          updated++;
        }
        
      } else {
        // UPSERT para AIR (mesma lógica)
        const result = await client.execute(`
          INSERT INTO ${tableName} (
            nome_analista, customer_no, po, hawb, master,
            etd, pre_alert_sent, oea_cl_doc, cargo_departed,
            d_term, pod_dn_available, remarks, tipo_processo, data_insert,
            wh_treatment, cct_transm, eta_ata, email_title
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            nome_analista = COALESCE(VALUES(nome_analista), nome_analista),
            customer_no = COALESCE(VALUES(customer_no), customer_no),
            po = COALESCE(VALUES(po), po),
            etd = COALESCE(VALUES(etd), etd),
            pre_alert_sent = COALESCE(VALUES(pre_alert_sent), pre_alert_sent),
            oea_cl_doc = COALESCE(VALUES(oea_cl_doc), oea_cl_doc),
            cargo_departed = COALESCE(VALUES(cargo_departed), cargo_departed),
            d_term = COALESCE(VALUES(d_term), d_term),
            pod_dn_available = COALESCE(VALUES(pod_dn_available), pod_dn_available),
            remarks = COALESCE(VALUES(remarks), remarks),
            tipo_processo = COALESCE(VALUES(tipo_processo), tipo_processo),
            data_insert = COALESCE(VALUES(data_insert), data_insert),
            wh_treatment = COALESCE(VALUES(wh_treatment), wh_treatment),
            cct_transm = COALESCE(VALUES(cct_transm), cct_transm),
            eta_ata = COALESCE(VALUES(eta_ata), eta_ata),
            email_title = COALESCE(VALUES(email_title), email_title)
        `, [...values]);
        
        if (result.affectedRows === 1) {
          inserted++;
        } else if (result.affectedRows === 2) {
          updated++;
        }
      }
    } catch (err) {
      // ... tratamento de erro ...
    }
  }
  
  // Retorno atualizado com contagem de updates
  result = { 
    success: true, 
    inserted, 
    updated,
    rejected: errors.length, 
    errors 
  };
  break;
}
```

### Arquivo: `src/pages/admin/UploadMaster.tsx`

**Atualizar tratamento do resultado** para exibir quantos foram atualizados:

```tsx
// No state importResult, adicionar updated
const [importResult, setImportResult] = useState<{
  inserted: number;
  updated: number;  // NOVO
  rejected: number;
  errors: Array<{ index: number; message: string }>;
  rejectedRows?: Array<...>;
} | null>(null);

// Na exibição do resultado
{importResult && (
  <div className="...">
    <CheckCircle2 className="text-green-400" />
    <span>
      {importResult.inserted} inseridos, {importResult.updated || 0} atualizados
      {importResult.rejected > 0 && `, ${importResult.rejected} rejeitados`}
    </span>
  </div>
)}
```

---

## Lógica do UPSERT

```text
FLUXO DE UPSERT:

1. Registro novo (master + hawb/hbl não existe):
   → INSERT normal
   → affectedRows = 1
   → Conta como "inserted"

2. Registro já existe (master + hawb/hbl encontrado):
   → UPDATE dos campos com COALESCE
   → affectedRows = 2 (MariaDB retorna 2 em update)
   → Conta como "updated"
   → Valores NULL na planilha NÃO sobrescrevem dados existentes
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/mariadb-proxy/index.ts` | Converter INSERT para INSERT...ON DUPLICATE KEY UPDATE com criação de índice |
| `src/pages/admin/UploadMaster.tsx` | Exibir contagem de registros atualizados além de inseridos |

---

## Considerações Técnicas

1. **COALESCE para preservar dados**: Valores `NULL` na nova importação não sobrescrevem dados existentes
2. **Índice composto**: Usa `master` + `hawb` (AIR) ou `master` + `hbl` (SEA) como chave única
3. **affectedRows**: MariaDB retorna 1 para insert, 2 para update (comportamento padrão)
4. **Criação de índice**: Tenta criar índice antes do loop; ignora se já existir
5. **Compatibilidade**: Não quebra importações existentes; apenas adiciona comportamento de update
