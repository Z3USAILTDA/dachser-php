
# Plano: Adicionar Colunas SEA à t_sea_master

## Análise da Planilha Sea Import

Identifiquei as seguintes diferenças entre AIR e SEA:

| Coluna Excel | Descrição | Existe em AIR? |
|--------------|-----------|----------------|
| **HBL No.** | House Bill of Lading (equivalente ao HAWB no aéreo) | Não (usa HAWB) |
| **Customer Order** | Número do pedido do cliente | Não |
| **Accrual** | Indicador de provisão (booleano) | Não |
| **DEP** | Indicador de partida (booleano) | Não (usa cargo_departed) |
| **E.T.A. / A.T.A.** | Data de chegada estimada/real | Não |
| **Email Title Pre-Alert** | Título do email de pré-alerta | Não |
| **T.E.** | Transit Time Estimated (desconhecido) | Não |
| **A.T.** | Arrival Time (desconhecido) | Não |

## Solução Proposta

### 1. Alterar estrutura da interface MasterRow

Adicionar campos específicos para SEA mantendo compatibilidade com AIR:

```typescript
export interface MasterRow {
  // Campos comuns (AIR e SEA)
  nome_analista?: string;
  customer_no?: string;
  po?: string;
  master?: string;
  etd?: string;
  pre_alert_sent?: string;
  oea_cl_doc?: number | null;
  remarks?: string;
  tipo_processo?: string;
  data_insert?: string;
  
  // Campos AIR
  hawb?: string;
  cargo_departed?: string;
  d_term?: string;
  pod_dn_available?: string;
  
  // Campos SEA (novos)
  hbl?: string;              // HBL No. (equivalente ao HAWB)
  customer_order?: string;   // Customer Order
  accrual?: number | null;   // Accrual (booleano)
  dep?: number | null;       // DEP (booleano)
  eta_ata?: string;          // E.T.A. / A.T.A. (data)
  email_title?: string;      // Email Title Pre-Alert
  te?: string;               // T.E.
  at?: string;               // A.T.
}
```

### 2. Adicionar aliases para colunas SEA

```typescript
const COLUMN_ALIASES: Record<string, string[]> = {
  // ... aliases existentes ...
  
  // Novos campos SEA
  hbl: ["hbl", "hbl_no", "hbl_number", "house_bl", "house_bill", "house_bill_of_lading"],
  customer_order: ["customer_order", "order", "order_no", "order_number", "pedido_cliente"],
  accrual: ["accrual", "provisao", "prov"],
  dep: ["dep", "departed", "partiu"],
  eta_ata: ["eta_ata", "e_t_a_a_t_a", "eta", "e_t_a", "ata", "a_t_a", "arrival", "chegada"],
  email_title: ["email_title", "email_title_pre_alert", "titulo_email", "email"],
  te: ["te", "t_e", "transit_time", "tempo_transito"],
  at: ["at", "a_t", "arrival_time"],
};
```

### 3. Atualizar DB_COLUMNS

```typescript
export const DB_COLUMNS = [
  // Campos comuns
  "nome_analista", "customer_no", "po", "master", "etd", 
  "pre_alert_sent", "oea_cl_doc", "remarks",
  
  // Campos AIR
  "hawb", "cargo_departed", "d_term", "pod_dn_available",
  
  // Campos SEA
  "hbl", "customer_order", "accrual", "dep", "eta_ata", "email_title", "te", "at",
];
```

### 4. Atualizar lógica de parsing

Adicionar processamento dos novos campos no switch case:

```typescript
case "hbl":
  row.hbl = value != null ? String(value).trim() : undefined;
  break;
case "customer_order":
  row.customer_order = value != null ? String(value).trim() : undefined;
  break;
case "accrual":
  row.accrual = parseBoolean(value);
  break;
case "dep":
  row.dep = parseBoolean(value);
  break;
case "eta_ata":
  row.eta_ata = parseDate(value) || undefined;
  break;
case "email_title":
  row.email_title = value != null ? String(value).trim() : undefined;
  break;
case "te":
  row.te = value != null ? String(value).trim() : undefined;
  break;
case "at":
  row.at = value != null ? String(value).trim() : undefined;
  break;
```

### 5. Atualizar validação

Para SEA, aceitar HBL além de HAWB/Master:

```typescript
const hasHawb = columnMappings.some((m) => m.dbColumn === "hawb");
const hasHbl = columnMappings.some((m) => m.dbColumn === "hbl");
const hasMaster = columnMappings.some((m) => m.dbColumn === "master");

if (!hasHawb && !hasHbl && !hasMaster) {
  // Erro: precisa de HAWB, HBL ou Master
}
```

### 6. Atualizar Edge Function (mariadb-proxy)

Modificar o `bulk_insert_master` para incluir colunas SEA condicionalmente:

```typescript
case 'bulk_insert_master': {
  // ... validações ...
  
  if (modal === 'SEA') {
    // INSERT com colunas SEA
    await client.execute(`
      INSERT INTO dados_dachser.t_sea_master (
        nome_analista, customer_no, po, hbl, master,
        etd, pre_alert_sent, oea_cl_doc, customer_order,
        accrual, dep, eta_ata, email_title, te, at,
        remarks, tipo_processo, data_insert
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [/* valores */]);
  } else {
    // INSERT com colunas AIR (atual)
    await client.execute(`
      INSERT INTO dados_dachser.t_air_master (
        nome_analista, customer_no, po, hawb, master,
        etd, pre_alert_sent, oea_cl_doc, cargo_departed,
        d_term, pod_dn_available, remarks, tipo_processo, data_insert
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [/* valores */]);
  }
}
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/parseExcelMaster.ts` | Adicionar aliases, campos e lógica de parsing para SEA |
| `supabase/functions/mariadb-proxy/index.ts` | Diferenciar INSERT entre AIR e SEA |

---

## Pré-requisito: Estrutura do Banco

Antes de implementar, preciso confirmar se a tabela `t_sea_master` já possui essas colunas no MariaDB:

- `hbl` (VARCHAR)
- `customer_order` (VARCHAR)
- `accrual` (TINYINT)
- `dep` (TINYINT)
- `eta_ata` (DATETIME)
- `email_title` (TEXT)
- `te` (VARCHAR)
- `at` (VARCHAR)

**Se não existirem**, você precisará adicionar via SQL no banco MariaDB:

```sql
ALTER TABLE dados_dachser.t_sea_master
  ADD COLUMN hbl VARCHAR(100) NULL,
  ADD COLUMN customer_order VARCHAR(100) NULL,
  ADD COLUMN accrual TINYINT NULL,
  ADD COLUMN dep TINYINT NULL,
  ADD COLUMN eta_ata DATETIME NULL,
  ADD COLUMN email_title TEXT NULL,
  ADD COLUMN te VARCHAR(50) NULL,
  ADD COLUMN at VARCHAR(50) NULL;
```

---

## Resumo das Alterações

1. **Frontend (parseExcelMaster.ts)**:
   - Adicionar 8 novos campos na interface `MasterRow`
   - Adicionar aliases para detectar colunas SEA
   - Expandir `DB_COLUMNS` com campos SEA
   - Atualizar switch case para processar novos campos
   - Ajustar validação para aceitar HBL

2. **Backend (mariadb-proxy)**:
   - Separar lógica de INSERT para AIR vs SEA
   - Adicionar colunas SEA no INSERT quando `modal === 'SEA'`
