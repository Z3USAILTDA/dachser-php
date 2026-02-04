
# Plano: Corrigir Inconsistência da Coluna 'at' → 'at_field'

## Problema Identificado

As 19 linhas foram rejeitadas com o erro:
```
Unknown column 'at' in 'field list'
```

A coluna existe no banco como `at_field`, mas o código está tentando inserir em `at`.

## Alterações Necessárias

### 1. Frontend: `src/lib/parseExcelMaster.ts`

Atualizar todas as referências de `at` para `at_field`:

**Interface MasterRow:**
```typescript
// De:
at?: string;

// Para:
at_field?: string;
```

**COLUMN_ALIASES:**
```typescript
// De:
at: ["at", "a_t", "arrival_time"],

// Para:
at_field: ["at", "a_t", "at_field", "arrival_time"],
```

**DB_COLUMNS:**
```typescript
// De:
"at",

// Para:
"at_field",
```

**Switch case no parsing:**
```typescript
// De:
case "at":
  row.at = value != null ? String(value).trim() : undefined;
  break;

// Para:
case "at_field":
  row.at_field = value != null ? String(value).trim() : undefined;
  break;
```

### 2. Backend: `supabase/functions/mariadb-proxy/index.ts`

Atualizar a query INSERT para SEA:

```typescript
// De:
INSERT INTO ${tableName} (
  nome_analista, customer_no, po, hbl, master,
  etd, pre_alert_sent, oea_cl_doc, customer_order,
  accrual, dep, eta_ata, email_title, te, at,  // ❌
  wh_treatment, cct_transm, remarks, tipo_processo, data_insert
)

// Para:
INSERT INTO ${tableName} (
  nome_analista, customer_no, po, hbl, master,
  etd, pre_alert_sent, oea_cl_doc, customer_order,
  accrual, dep, eta_ata, email_title, te, at_field,  // ✅
  wh_treatment, cct_transm, remarks, tipo_processo, data_insert
)
```

E também o valor passado:
```typescript
// De:
row.at || null,

// Para:
row.at_field || null,
```

---

## Arquivos a Modificar

| Arquivo | Alterações |
|---------|-----------|
| `src/lib/parseExcelMaster.ts` | Renomear `at` → `at_field` em interface, aliases, DB_COLUMNS e switch case |
| `supabase/functions/mariadb-proxy/index.ts` | Renomear `at` → `at_field` na query INSERT e no valor do array |

---

## Resultado Esperado

Após as correções, a planilha Sea Import deverá importar todas as 19 linhas com sucesso, pois a coluna `at_field` já existe no banco de dados.
