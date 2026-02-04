
# Plano: Upload Master (Air/Sea) – Planilha

## Atualização: Suporte a Todos os Formatos Excel

A biblioteca `xlsx` já instalada no projeto (`xlsx` versão ^0.18.5) suporta nativamente:
- `.xlsx` (Excel 2007+)
- `.xls` (Excel 97-2003)
- `.xlsm` (Excel com macros)
- `.xlsb` (Excel binário)
- `.csv` (valores separados por vírgula)
- `.ods` (OpenDocument Spreadsheet)

---

## Resumo
Criar nova tela para upload de planilhas Excel que permite:
- Upload de arquivo Excel em qualquer formato suportado
- Validação e normalização automática de colunas
- Extração do tipo_processo (AIR/SEA + IMPORT/EXPORT) do nome do arquivo
- Preview de dados
- Bulk insert em `dados_dachser.t_air_master` ou `dados_dachser.t_sea_master`

---

## Estrutura de Navegação

```text
ADMIN
└── Z3US (expandível)
    ├── Cadastro de Usuário
    ├── Métricas de Uso
    ├── Gerenciamento de Usuários
    ├── Gerenciamento de APIs
    ├── Monitoramento de Dados
    └── Upload Master (Air/Sea) ← NOVA
```

**Rota**: `/admin/z3us/upload-master`

---

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `src/pages/admin/UploadMaster.tsx` | **CRIAR** - Tela principal |
| `src/lib/parseExcelMaster.ts` | **CRIAR** - Parser especializado para planilhas master |
| `src/App.tsx` | **MODIFICAR** - Adicionar rota |
| `src/pages/Dashboard.tsx` | **MODIFICAR** - Adicionar item no menu Z3US |
| `supabase/functions/mariadb-proxy/index.ts` | **MODIFICAR** - Adicionar action bulk_insert_master |

---

## 1. Formatos de Arquivo Aceitos

### Extensões suportadas
```typescript
const ACCEPTED_EXTENSIONS = [
  ".xlsx",  // Excel 2007+ (padrão)
  ".xls",   // Excel 97-2003
  ".xlsm",  // Excel com macros
  ".xlsb",  // Excel binário
  ".csv",   // CSV
  ".ods",   // OpenDocument
];

const ACCEPT_STRING = ".xlsx,.xls,.xlsm,.xlsb,.csv,.ods";
```

### Validação de arquivo
```typescript
function isValidExcelFile(file: File): boolean {
  const extension = file.name.toLowerCase().split('.').pop();
  return ACCEPTED_EXTENSIONS.includes(`.${extension}`);
}
```

---

## 2. Parser de Excel (`src/lib/parseExcelMaster.ts`)

### 2.1 Leitura Universal de Arquivos

```typescript
import * as XLSX from "xlsx";

export async function parseExcelMasterFile(file: File): Promise<ParseMasterResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        // XLSX.read detecta automaticamente o formato do arquivo
        const workbook = XLSX.read(data, { type: "array" });
        
        // Continua com processamento...
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsArrayBuffer(file);
  });
}
```

### 2.2 Normalização de Cabeçalho

```typescript
function normalizeColumnName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")     // Substitui espaços e especiais por _
    .replace(/_+/g, "_")             // Colapsa múltiplos _
    .replace(/^_|_$/g, "");          // Remove _ inicial/final
}
```

### 2.3 Mapeamento de Aliases

```typescript
const COLUMN_ALIASES: Record<string, string[]> = {
  nome_analista: ["nome_analista", "analista", "clerk", "operator", "responsavel"],
  customer_no: ["customer_no", "customer", "customer_number", "customer_id", "cliente", "cod_cliente", "codigo_cliente"],
  po: ["po", "p_o", "purchase_order", "pedido", "pedido_compra"],
  hawb: ["hawb", "hawb_no", "hawb_number", "house", "house_awb", "house_awb_no"],
  master: ["master", "mawb", "mawb_no", "master_awb", "master_awb_no", "master_number"],
  etd: ["etd", "e_t_d", "estimated_time_departure", "data_etd", "departure", "data_saida", "data_saida_prevista"],
  pre_alert_sent: ["pre_alert_sent", "prealert_sent", "pre_alert", "prealert", "sent_prealert", "enviado_prealert"],
  oea_cl_doc: ["oea_cl_doc", "oea", "cl_doc", "cldoc", "doc_ok", "docs_ok", "documentos_ok", "docs"],
  cargo_departed: ["cargo_departed", "departed", "data_departed", "data_embarque", "embarque", "departure_date", "data_saida_real"],
  d_term: ["d_term", "dterm", "delivery_term", "incoterm", "incoterms", "termo", "termo_entrega"],
  pod_dn_available: ["pod_dn_available", "pod", "dn_available", "dn", "pod_dn", "document_available", "doc_available"],
  remarks: ["remarks", "remark", "observacao", "observacoes", "observacao_1", "observations", "notes", "note"],
};
```

### 2.4 Extração do tipo_processo

```typescript
function extractTipoProcesso(filename: string): { modal: string; direction: string } | null {
  const normalized = filename.toLowerCase();
  
  let modal: string | null = null;
  if (/\bair\b/.test(normalized)) modal = "AIR";
  else if (/\bsea\b/.test(normalized)) modal = "SEA";
  
  let direction: string | null = null;
  if (/\bimport\b/.test(normalized)) direction = "IMPORT";
  else if (/\bexport\b/.test(normalized)) direction = "EXPORT";
  
  if (!modal || !direction) return null;
  return { modal, direction };
}
```

### 2.5 Conversões de Dados

```typescript
// Converter data Excel para DATETIME MySQL
function parseDate(value: any): string | null {
  if (!value) return null;
  
  // Data numérica Excel (dias desde 1899-12-30)
  if (typeof value === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return formatDateTime(date);
  }
  
  // String dd/mm/yyyy ou yyyy-mm-dd
  // ...parsing logic
}

// Converter booleano para 0/1
function parseBoolean(value: any): number | null {
  if (value === null || value === undefined) return null;
  const str = String(value).toLowerCase().trim();
  if (["1", "true", "sim", "yes", "ok", "s"].includes(str)) return 1;
  if (["0", "false", "nao", "não", "no", "n", ""].includes(str)) return 0;
  return null;
}
```

---

## 3. Componente de Tela (`src/pages/admin/UploadMaster.tsx`)

### 3.1 Estados

```typescript
const [file, setFile] = useState<File | null>(null);
const [tipoProcesso, setTipoProcesso] = useState<string | null>(null);
const [parseError, setParseError] = useState<string | null>(null);
const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
const [previewRows, setPreviewRows] = useState<any[]>([]);
const [validationErrors, setValidationErrors] = useState<{row: number; message: string}[]>([]);
const [isValidating, setIsValidating] = useState(false);
const [isImporting, setIsImporting] = useState(false);
const [importResult, setImportResult] = useState<{inserted: number; rejected: number} | null>(null);
```

### 3.2 Zona de Upload

```typescript
<div className="border-2 border-dashed rounded-lg p-8 text-center">
  <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
  <p className="font-medium mb-2">Arraste ou clique para selecionar</p>
  <p className="text-sm text-muted-foreground">
    Formatos aceitos: Excel (.xlsx, .xls, .xlsm, .xlsb), CSV, ODS
  </p>
  <input
    type="file"
    accept=".xlsx,.xls,.xlsm,.xlsb,.csv,.ods"
    onChange={handleFileSelect}
  />
</div>
```

### 3.3 Fluxo de UI

```text
┌─────────────────────────────────────────────────────────────────┐
│                          UPLOAD ZONE                            │
│   Arraste ou clique para selecionar                             │
│   Formatos: Excel (.xlsx, .xls, .xlsm, .xlsb), CSV, ODS        │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Arquivo: Air Export 03fev.xls                                  │
│  Formato: Excel 97-2003 (.xls)                                  │
│  Badge: AIR EXPORT                                              │
│  [Validar e Pre-visualizar]                                     │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  MAPA DE CAMPOS DETECTADO                                       │
│  ┌───────────────┬───────────────┬─────────────────────────┐    │
│  │ Coluna Excel  │ Mapeado p/    │ Dropdown (editar)       │    │
│  ├───────────────┼───────────────┼─────────────────────────┤    │
│  │ Pre Alert     │ pre_alert_sent│ [Select]                │    │
│  │ OEA CL DOC    │ oea_cl_doc    │ [Select]                │    │
│  └───────────────┴───────────────┴─────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  PREVIEW (primeiras 50 linhas)                                  │
│  ┌────┬─────────────┬───────────┬────────┬─────────┬─────────┐  │
│  │ #  │ nome_analista│ customer │ hawb   │ master  │ etd     │  │
│  ├────┼─────────────┼───────────┼────────┼─────────┼─────────┤  │
│  │ 1  │ Joao Silva  │ CUST123   │ H12345 │ M98765  │ 2025-02 │  │
│  │ 2  │ Maria       │ CUST456   │        │ M11111  │ 2025-02 │  │
│  └────┴─────────────┴───────────┴────────┴─────────┴─────────┘  │
│                                                                 │
│  [Importar]                                                     │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  IMPORTACAO CONCLUIDA                                           │
│  Inseridas: 48 | Rejeitadas: 2                                  │
│  Motivos: Linha 12: hawb obrigatorio, Linha 27: data invalida   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 Componentes Reutilizados

- `PageLayout` - Layout padrao com header
- `PageCard` - Cards estilizados do projeto
- `Table, TableHeader, TableBody, TableRow, TableCell` - Tabela de preview
- `Badge` - Badge do tipo_processo e formato do arquivo
- `Button` - Botoes de acao
- `Select` - Dropdown para ajuste de mapeamento
- `toast` / `sonner` - Notificacoes de sucesso/erro
- `Progress` - Barra de progresso durante importacao

---

## 4. Backend: Edge Function (`mariadb-proxy`)

### 4.1 Novo Action: `bulk_insert_master`

```typescript
case 'bulk_insert_master': {
  const { rows, modal } = body as { 
    rows: Array<{
      nome_analista?: string;
      customer_no?: string;
      po?: string;
      hawb?: string;
      master?: string;
      etd?: string;
      pre_alert_sent?: string;
      oea_cl_doc?: number;
      cargo_departed?: string;
      d_term?: string;
      pod_dn_available?: string;
      remarks?: string;
      tipo_processo?: string;
    }>;
    modal: 'AIR' | 'SEA';
  };
  
  const tableName = modal === 'AIR' 
    ? 'dados_dachser.t_air_master' 
    : 'dados_dachser.t_sea_master';
  
  let inserted = 0;
  const errors: Array<{index: number; message: string}> = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      await client.execute(`
        INSERT INTO ${tableName} (
          nome_analista, customer_no, po, hawb, master,
          etd, pre_alert_sent, oea_cl_doc, cargo_departed,
          d_term, pod_dn_available, remarks, tipo_processo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        row.nome_analista || null,
        row.customer_no || null,
        row.po || null,
        row.hawb || null,
        row.master || null,
        row.etd || null,
        row.pre_alert_sent || null,
        row.oea_cl_doc ?? null,
        row.cargo_departed || null,
        row.d_term || null,
        row.pod_dn_available || null,
        row.remarks || null,
        row.tipo_processo || null,
      ]);
      inserted++;
    } catch (err: any) {
      errors.push({ index: i, message: err.message });
    }
  }
  
  result = { success: true, inserted, rejected: errors.length, errors };
  break;
}
```

---

## 5. Validacoes

### 5.1 Validacao de Arquivo

| Regra | Acao |
|-------|------|
| Extensao nao suportada | Bloquear com toast de erro |
| Arquivo > 20MB | Bloquear com toast de erro |
| Nao identifica modal (AIR/SEA) no nome | Bloquear com erro claro |
| Nao identifica direcao (IMPORT/EXPORT) no nome | Bloquear com erro claro |

### 5.2 Validacao de Colunas

| Campo | Obrigatorio? | Validacao |
|-------|--------------|-----------|
| hawb ou master | Sim (um dos dois) | Pelo menos um deve estar preenchido |
| etd | Nao | Se presente, deve ser data valida |
| pre_alert_sent | Nao | Se presente, deve ser data valida |
| cargo_departed | Nao | Se presente, deve ser data valida |
| oea_cl_doc | Nao | Deve ser conversivel para 0/1 |

---

## 6. Modificacoes no Dashboard (Menu)

Adicionar novo item no submenu Z3US:

```typescript
subChildren: [
  { label: "Cadastro de Usuario", href: "/admin/register" },
  { label: "Metricas de Uso", href: "/admin/metrics" },
  { label: "Gerenciamento de Usuarios", href: "/admin/users" },
  { label: "Gerenciamento de APIs", href: "/admin/apis" },
  { label: "Monitoramento de Dados", href: "/admin/database" },
  { label: "Upload Master", href: "/admin/z3us/upload-master" }, // NOVO
],
```

---

## 7. Modificacoes no App.tsx (Rotas)

```typescript
import UploadMaster from "./pages/admin/UploadMaster";

<Route path="/admin/z3us/upload-master" element={<UploadMaster />} />
```

---

## 8. Permissoes

Verificacao de admin no componente (padrao ja existente no projeto).

---

## Resumo de Formatos Suportados

| Formato | Extensao | Biblioteca |
|---------|----------|------------|
| Excel 2007+ | .xlsx | xlsx (nativo) |
| Excel 97-2003 | .xls | xlsx (nativo) |
| Excel com Macros | .xlsm | xlsx (nativo) |
| Excel Binario | .xlsb | xlsx (nativo) |
| CSV | .csv | xlsx (nativo) |
| OpenDocument | .ods | xlsx (nativo) |

A biblioteca `xlsx` ja instalada detecta automaticamente o formato do arquivo pelo conteudo, nao apenas pela extensao.
