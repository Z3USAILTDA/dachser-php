
# Plano: Adicionar Importação de "Clientes Base" na Tela de Upload Master

## Resumo

Adicionar na tela existente (`/admin/z3us/upload-master`) suporte para importar planilhas de "Relação Clientes Base" para a tabela `dados_dachser.t_clientes_base_online`, sem alterar o fluxo já existente de Master (Air/Sea).

---

## Arquitetura da Solução

```text
┌─────────────────────────────────────────────────────────────────┐
│                     UploadMaster.tsx                            │
├─────────────────────────────────────────────────────────────────┤
│  [Tabs: Master (Air/Sea) | Clientes Base]                       │
│  ────────────────────────────────────────                       │
│  • Modo "master": fluxo atual (parseExcelMaster.ts)             │
│  • Modo "clientes_base": novo parser (parseExcelClientesBase.ts)│
│                                                                 │
│  Upload Zone → Validar → Preview → Importar                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   mariadb-proxy Edge Function                   │
├─────────────────────────────────────────────────────────────────┤
│  action: "bulk_insert_master"   → t_air_master / t_sea_master   │
│  action: "bulk_insert_clientes" → t_clientes_base_online (NOVO) │
└─────────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/lib/parseExcelClientesBase.ts` | **CRIAR** | Parser específico para Clientes Base |
| `src/pages/admin/UploadMaster.tsx` | MODIFICAR | Adicionar Tabs para alternar modo |
| `supabase/functions/mariadb-proxy/index.ts` | MODIFICAR | Adicionar action `bulk_insert_clientes` |

---

## 1. Novo Parser: `parseExcelClientesBase.ts`

### 1.1 Interface de Dados

```typescript
export interface ClienteBaseRow {
  ativo?: number | null;           // tinyint(1)
  classificacao?: string;          // varchar(50)
  cod_rm?: number | null;          // int
  dchr_customer_number?: string;   // varchar(50)
  cnpj?: string;                   // varchar(20)
  nome_cliente?: string;           // varchar(200)
  cidade_uf?: string;              // varchar(50)
  pais?: string;                   // varchar(50)
  logradouro?: string;             // varchar(200)
  cep?: string;                    // varchar(15)
  info_complementar?: string;      // varchar(255)
}
```

### 1.2 Mapeamento de Aliases (Excel → Banco)

```typescript
const CLIENTES_BASE_ALIASES: Record<string, string[]> = {
  ativo: ["ativo", "status", "active"],
  classificacao: ["classificacao", "classificação", "categoria", "classification"],
  cod_rm: ["cod_rm", "cód_rm", "codigo_rm", "rm", "rm_code"],
  dchr_customer_number: ["dchr_customer_number", "dchr_customer_number", "customer_number", "customer_no", "customer no"],
  cnpj: ["cnpj", "cnpj_cliente", "documento", "document"],
  nome_cliente: ["nome_cliente", "nome_do_cliente", "cliente", "razao_social", "razão_social", "company_name"],
  cidade_uf: ["cidade_uf", "cidade_uf", "city_state", "cidade", "uf"],
  pais: ["pais", "país", "country"],
  logradouro: ["logradouro", "endereco", "endereço", "address", "rua"],
  cep: ["cep", "postal_code", "zip", "zipcode"],
  info_complementar: ["info_complementar", "informacao_complementar", "complemento", "obs", "observacao", "observação", "notes"],
};
```

### 1.3 Conversões e Validações

| Campo | Conversão |
|-------|-----------|
| `ativo` | Sim/Não, Yes/No, true/false, 1/0 → 1 ou 0 |
| `cod_rm` | Converter para inteiro; se vazio → NULL |
| `cnpj` | Texto, preservar zeros à esquerda, remover espaços |
| `cep` | Texto, preservar zeros à esquerda, remover espaços |

### 1.4 Validação de Linha

- Ignorar linhas totalmente vazias
- Ignorar linhas de resumo (Grand Summary, Total, etc.)
- **Validação obrigatória**: `nome_cliente` preenchido E (`cnpj` OU `dchr_customer_number`)
- Se não atender → marcar erro na linha, não bloquear importação total

---

## 2. Modificações no Frontend: `UploadMaster.tsx`

### 2.1 Novo Estado para Modo de Importação

```typescript
type ImportMode = "master" | "clientes_base";
const [importMode, setImportMode] = useState<ImportMode>("master");
```

### 2.2 Seletor de Modo (Tabs)

Adicionar no topo do conteúdo:

```tsx
<Tabs value={importMode} onValueChange={(v) => { setImportMode(v as ImportMode); handleReset(); }}>
  <TabsList>
    <TabsTrigger value="master">Master (Air/Sea)</TabsTrigger>
    <TabsTrigger value="clientes_base">Clientes Base</TabsTrigger>
  </TabsList>
</Tabs>
```

### 2.3 Lógica Condicional

| Ação | Modo "master" | Modo "clientes_base" |
|------|---------------|---------------------|
| Validação de nome do arquivo | Exige AIR/SEA + IMPORT/EXPORT | Sem restrição (qualquer nome) |
| Parser | `parseExcelMasterFile()` | `parseExcelClientesBaseFile()` |
| Preview (colunas da tabela) | Analista, Customer, PO, HAWB, Master, ETD | Nome Cliente, CNPJ, Customer No, Cidade/UF, Classificação |
| Colunas disponíveis no Select | `DB_COLUMNS` (Master) | `CLIENTES_BASE_COLUMNS` |
| Action do backend | `bulk_insert_master` | `bulk_insert_clientes` |

### 2.4 Título Dinâmico

```tsx
<PageLayout
  title={importMode === "master" ? "Upload Master (Air/Sea)" : "Upload Clientes Base"}
  subtitle={importMode === "master" 
    ? "Importação de planilhas para t_air_master ou t_sea_master" 
    : "Importação de planilhas para t_clientes_base_online"}
  backTo="/dashboard"
>
```

### 2.5 Preview de Clientes Base

Nova tabela de preview com colunas:

```tsx
<TableHead>Nome Cliente</TableHead>
<TableHead>CNPJ</TableHead>
<TableHead>Customer No</TableHead>
<TableHead>Cidade/UF</TableHead>
<TableHead>Classificação</TableHead>
<TableHead>Ativo</TableHead>
<TableHead>Status</TableHead>
```

---

## 3. Modificações no Backend: `mariadb-proxy`

### 3.1 Nova Action: `bulk_insert_clientes`

```typescript
case 'bulk_insert_clientes': {
  const { rows } = body as { 
    rows?: Array<{
      ativo?: number;
      classificacao?: string;
      cod_rm?: number;
      dchr_customer_number?: string;
      cnpj?: string;
      nome_cliente?: string;
      cidade_uf?: string;
      pais?: string;
      logradouro?: string;
      cep?: string;
      info_complementar?: string;
    }>;
  };
  
  const tableName = 'dados_dachser.t_clientes_base_online';
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      await client.execute(`
        INSERT INTO ${tableName} (
          ativo, classificacao, cod_rm, dchr_customer_number, cnpj,
          nome_cliente, cidade_uf, pais, logradouro, cep, info_complementar
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        row.ativo ?? 1,
        row.classificacao || null,
        row.cod_rm ?? null,
        row.dchr_customer_number || null,
        row.cnpj || null,
        row.nome_cliente || null,
        row.cidade_uf || null,
        row.pais || null,
        row.logradouro || null,
        row.cep || null,
        row.info_complementar || null,
      ]);
      inserted++;
    } catch (err) {
      errors.push({ index: i, message: err.message });
    }
  }
  
  result = { success: true, inserted, rejected: errors.length, errors };
  break;
}
```

---

## 4. Fluxo Completo (Clientes Base)

```text
1. Usuário seleciona aba "Clientes Base"
2. Faz upload do arquivo Excel
3. Clica "Validar e Pré-visualizar"
   → parseExcelClientesBaseFile() processa o arquivo
   → Mapeia colunas automaticamente via aliases
   → Valida: nome_cliente + (cnpj OU dchr_customer_number)
   → Retorna preview (50 linhas) + lista de erros
4. Usuário revisa preview e mapeamento
5. Clica "Importar X registro(s)"
   → Frontend chama mariadb-proxy com action: "bulk_insert_clientes"
   → Backend insere linha por linha em t_clientes_base_online
   → Retorna relatório: inseridos / rejeitados / erros
6. Toast com resumo exibido ao usuário
```

---

## 5. Estrutura dos Novos Arquivos

### `src/lib/parseExcelClientesBase.ts`

```typescript
// Exports:
export const CLIENTES_BASE_COLUMNS: string[];
export interface ClienteBaseRow { ... }
export interface ColumnMapping { ... }
export interface ParseValidationError { ... }
export interface ParseClientesBaseResult { ... }
export function parseExcelClientesBaseFile(file: File): Promise<ParseClientesBaseResult>;
export function normalizeColumnName(name: string): string; // reutilizar do Master
```

---

## 6. Detalhes de Implementação

### Upload Zone (Modo Clientes Base)

- Remover validação de nome do arquivo (não exigir AIR/SEA)
- Manter validação de extensão (.xlsx, .xls, etc.) e tamanho (20MB)
- Instruções atualizadas: "Formatos aceitos: Excel (.xlsx, .xls, .xlsm, .xlsb), CSV, ODS"

### Mensagens de Erro Específicas

| Erro | Mensagem |
|------|----------|
| Falta nome_cliente | "Linha X: Campo 'nome_cliente' é obrigatório" |
| Falta identificador | "Linha X: É necessário CNPJ ou Customer Number" |
| cod_rm inválido | "Linha X: Código RM deve ser numérico" |

---

## 7. Permissões

Mantidas exatamente como estão:
- Verificação `is_admin === 1` no `useEffect` inicial
- Sem alterações no controle de acesso

---

## Resumo de Mudanças por Arquivo

| Arquivo | Linhas estimadas | Complexidade |
|---------|------------------|--------------|
| `src/lib/parseExcelClientesBase.ts` | ~250 linhas | Média (novo arquivo) |
| `src/pages/admin/UploadMaster.tsx` | ~150 linhas adicionais | Média (condicionais por modo) |
| `supabase/functions/mariadb-proxy/index.ts` | ~60 linhas | Baixa (nova action) |

**Total estimado**: ~460 linhas de código
