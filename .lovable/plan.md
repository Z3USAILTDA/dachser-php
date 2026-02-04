

# Plano: Corrigir Detecção da Coluna Master

## Problema Identificado

A função `findDbColumn` usa correspondência **exata** entre o nome normalizado do header e os aliases definidos. Se o nome da coluna na planilha não estiver exatamente na lista de aliases, ela não será detectada.

### Aliases atuais para `master`:
```
master, mawb, mawb_no, master_awb, master_awb_no, master_number
```

### Nomes que NÃO seriam detectados (exemplos):
- "Master No" → normaliza para `master_no` → não encontrado
- "MASTER AWB NO" → normaliza para `master_awb_no` → encontrado, mas...
- "Master ID" → normaliza para `master_id` → não encontrado
- "MAWB Number" → normaliza para `mawb_number` → não encontrado

---

## Solução: Melhorar a Detecção de Colunas

### 1. Expandir a lista de aliases

Adicionar mais variações comuns:

```typescript
master: [
  "master", "mawb", "mawb_no", "master_awb", "master_awb_no", "master_number",
  "master_no",           // NOVO
  "master_id",           // NOVO  
  "mawb_number",         // NOVO
  "master_awb_number",   // NOVO
  "masterawb",           // NOVO
  "no_master",           // NOVO
],
```

### 2. Implementar correspondência flexível (contains/startsWith)

Adicionar fallback para correspondência parcial:

```typescript
export function findDbColumn(normalizedHeader: string): string | null {
  // Prioridade 1: Correspondência exata com DB_COLUMNS
  if (DB_COLUMNS.includes(normalizedHeader)) {
    return normalizedHeader;
  }
  
  // Prioridade 2: Correspondência exata com aliases
  for (const [dbCol, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeColumnName(alias);
      if (normalizedHeader === normalizedAlias) {
        return dbCol;
      }
    }
  }
  
  // Prioridade 3: Header começa com o nome do campo (novo)
  for (const dbCol of DB_COLUMNS) {
    if (normalizedHeader.startsWith(dbCol)) {
      return dbCol;
    }
  }
  
  // Prioridade 4: Header contém o nome do campo (novo)
  for (const dbCol of DB_COLUMNS) {
    if (normalizedHeader.includes(dbCol)) {
      return dbCol;
    }
  }
  
  return null;
}
```

### 3. Adicionar log de debug para diagnóstico

Para entender exatamente qual header está sendo lido:

```typescript
// No parseExcelMasterFile, adicionar log temporário
console.log("Headers detectados:", excelHeaders);
console.log("Headers normalizados:", excelHeaders.map(normalizeColumnName));
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/parseExcelMaster.ts` | Expandir aliases, adicionar fallback de correspondência flexível |

---

## Alterações Detalhadas

### `src/lib/parseExcelMaster.ts`

**Linha 8-21** - Expandir COLUMN_ALIASES:

```typescript
const COLUMN_ALIASES: Record<string, string[]> = {
  nome_analista: ["nome_analista", "analista", "clerk", "operator", "responsavel", "responsável"],
  customer_no: ["customer_no", "customer", "customer_number", "customer_id", "cliente", "cod_cliente", "codigo_cliente"],
  po: ["po", "p_o", "purchase_order", "pedido", "pedido_compra"],
  hawb: ["hawb", "hawb_no", "hawb_number", "house", "house_awb", "house_awb_no", "house_no"],
  master: [
    "master", "mawb", "mawb_no", "master_awb", "master_awb_no", "master_number",
    "master_no", "master_id", "mawb_number", "master_awb_number", "masterawb", "no_master"
  ],
  // ... resto permanece igual
};
```

**Linhas 101-118** - Melhorar findDbColumn:

```typescript
export function findDbColumn(normalizedHeader: string): string | null {
  // Prioridade 1: Correspondência exata
  if (DB_COLUMNS.includes(normalizedHeader)) {
    return normalizedHeader;
  }
  
  // Prioridade 2: Correspondência exata com aliases
  for (const [dbCol, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeColumnName(alias);
      if (normalizedHeader === normalizedAlias) {
        return dbCol;
      }
    }
  }
  
  // Prioridade 3: Header começa com nome do campo
  for (const [dbCol, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeColumnName(alias);
      if (normalizedHeader.startsWith(normalizedAlias)) {
        return dbCol;
      }
    }
  }
  
  // Prioridade 4: Header contém nome do campo
  for (const [dbCol, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeColumnName(alias);
      if (normalizedHeader.includes(normalizedAlias) || normalizedAlias.includes(normalizedHeader)) {
        return dbCol;
      }
    }
  }
  
  return null;
}
```

---

## Próxima Etapa: Diagnóstico

Para resolver de forma definitiva, preciso saber:

**Qual é o nome exato da coluna "Master" na sua planilha Excel?**

Por exemplo:
- "Master"
- "Master No"
- "MASTER AWB"
- "MAWB"
- Outro?

Com essa informação, posso adicionar o alias exato e garantir que funcione.

