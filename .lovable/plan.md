
# Plano: Ajustes na Régua de Cobrança e Tela de Disputa

## Resumo das Alterações Solicitadas

1. **Importação de planilha de disputas**: Aceitar qualquer tipo de planilha, contanto que contenha ND, Responsável e OBS
2. **Bug de tela preta**: Investigar e resolver problema ao atualizar as telas
3. **Email de destino editável**: Permitir editar destinatários do aging e usar no envio
4. **Herança de observações**: Quando linhas de ND/NF do mesmo processo, herdar OBS de uma para outra
5. **Ações em lote na disputa**: Selecionar múltiplos processos para excluir ou resolver
6. **Agrupamento para aging**: Permitir seleção de agrupamento para envio único
7. **Formatação da planilha aging**: Corrigir quebra de colunas, VALOR como soma, total em atraso do dia
8. **CNPJ na tabela de clientes**: Mostrar CNPJ na busca por cliente
9. **Barra de rolagem horizontal**: Adicionar na tela de disputa

---

## 1. Importação Flexível de Planilha de Disputas

### Problema Atual
O parser atual (`parseSpreadsheet` em `FinanceiroDisputa.tsx`) busca colunas específicas, mas a validação e feedback são limitados.

### Solução

**Arquivo:** `src/pages/FinanceiroDisputa.tsx`

- Atualizar a função `findColumnIndex` para buscar também variações como "obs" para observações
- Adicionar validação de colunas obrigatórias (ND, Responsável, OBS) antes de processar
- Mostrar erro claro se colunas obrigatórias não forem encontradas
- Aceitar mais variações de nomes de coluna

```typescript
// Adicionar variações para busca de colunas
const ndIdx = findColumnIndex(headerRow, 'nd', 'documento', 'nf', 'numero', 'doc');
const respIdx = findColumnIndex(headerRow, 'responsável', 'responsavel', 'resp');
const obsIdx = findColumnIndex(headerRow, 'obs', 'observações', 'observacoes', 'observacao', 'descrição', 'descricao', 'pendência', 'pendencia');

// Validar colunas obrigatórias
if (ndIdx === -1) {
  toast({ title: "Erro", description: "Coluna ND/Documento não encontrada", variant: "destructive" });
  return [];
}
```

---

## 2. Bug de Tela Preta ao Atualizar

### Análise
O bug de "tela preta" ao atualizar a página pode ocorrer por:
1. Erro JavaScript não capturado durante o carregamento
2. Estado inicial indefinido causando crash no React
3. Problema de rota ou componente não montado corretamente

### Solução

**Arquivos:** `src/pages/ReguaCobranca.tsx` e `src/pages/FinanceiroDisputa.tsx`

- Adicionar `ErrorBoundary` para capturar erros de renderização
- Verificar se `loading` tem estado inicial correto
- Adicionar try-catch no `useEffect` inicial
- Validar dados antes de renderizar

```typescript
// Adicionar proteção no início do componente
const [hasError, setHasError] = useState(false);

useEffect(() => {
  try {
    fetchDisputas();
  } catch (err) {
    console.error("Erro ao inicializar:", err);
    setHasError(true);
  }
}, []);

if (hasError) {
  return <div>Erro ao carregar. Tente novamente.</div>;
}
```

---

## 3. Email de Destino Editável

### Problema Atual
O email é hardcoded no backend (`regua-send-aging/index.ts:506-510`), ignorando qualquer edição feita no frontend.

### Solução

**Arquivo:** `src/pages/ReguaCobranca.tsx`
- Adicionar campo editável para emails no modal de aging
- Passar emails editados para o backend

```typescript
// Novo estado para emails editáveis
const [agingEmails, setAgingEmails] = useState("devs@z3us.ai; bia.souza@dachser.com; jessica.costa@dachser.com");

// No modal, adicionar input para editar emails
<Input
  value={agingEmails}
  onChange={(e) => setAgingEmails(e.target.value)}
  placeholder="email1@domain.com; email2@domain.com"
/>
```

**Arquivo:** `supabase/functions/regua-send-aging/index.ts`
- Usar o parâmetro `email_to` recebido em vez de lista hardcoded
- Fazer split e validação dos emails

```typescript
// Usar emails recebidos ou fallback para hardcoded
const emailList = email_to
  .split(/[;,]/)
  .map(e => e.trim())
  .filter(e => e.includes('@'));

const recipientEmails = emailList.length > 0 ? emailList : [
  "devs@z3us.ai",
  "bia.souza@dachser.com",
  "jessica.costa@dachser.com"
];
```

---

## 4. Herança de Observações entre ND/NF do Mesmo Processo

### Problema
Ao importar planilha com ND e NF do mesmo processo, apenas uma pode ter OBS, e a outra deve herdar.

### Solução

**Arquivo:** `src/pages/FinanceiroDisputa.tsx`

Após parsear a planilha, agrupar por processo e propagar observações:

```typescript
// Agrupar itens por número de processo (baseado em padrão do ND)
const groupedByProcesso = new Map<string, typeof items>();

// Para cada grupo, se um item não tiver obs, copiar do que tiver
for (const [processo, grupItems] of groupedByProcesso.entries()) {
  const obsDoGrupo = grupItems.find(i => i.descricao)?.descricao || '';
  const respDoGrupo = grupItems.find(i => i.responsavel)?.responsavel || '';
  
  grupItems.forEach(item => {
    if (!item.descricao && obsDoGrupo) item.descricao = obsDoGrupo;
    if (!item.responsavel && respDoGrupo) item.responsavel = respDoGrupo;
  });
}
```

---

## 5. Ações em Lote na Tela de Disputa

### Solução

**Arquivo:** `src/pages/FinanceiroDisputa.tsx`

Adicionar checkboxes de seleção e botões de ação em lote:

```typescript
// Novos estados
const [selectedDocKeys, setSelectedDocKeys] = useState<Set<string>>(new Set());
const [selectAll, setSelectAll] = useState(false);

// Toggle de seleção individual
const toggleSelect = (docKey: string) => {
  const newSet = new Set(selectedDocKeys);
  if (newSet.has(docKey)) newSet.delete(docKey);
  else newSet.add(docKey);
  setSelectedDocKeys(newSet);
};

// Ações em lote
const handleBulkDelete = async () => { /* ... */ };
const handleBulkResolve = async () => { /* ... */ };
```

**Layout da tabela atualizado:**
- Coluna de checkbox no header (select all)
- Checkbox em cada linha
- Barra de ações quando há seleção

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts`

Adicionar novas actions:
- `bulk_delete_disputas`: Recebe array de `doc_keys`
- `bulk_resolve_disputas`: Recebe array de `doc_keys`

---

## 6. Agrupamento para Envio de Aging

### Solução

**Arquivo:** `src/pages/ReguaCobranca.tsx`

Adicionar checkboxes na tabela de resultados de clientes para seleção múltipla:

```typescript
// Estados para seleção múltipla de clientes
const [selectedClientes, setSelectedClientes] = useState<Set<string>>(new Set());

// Botão de envio agrupado
<Button onClick={handleSendAgingAgrupado} disabled={selectedClientes.size === 0}>
  Enviar Aging Agrupado ({selectedClientes.size})
</Button>
```

**Arquivo:** `supabase/functions/regua-send-aging/index.ts`

Aceitar múltiplos CNPJs e gerar planilha consolidada:

```typescript
interface AgingRequest {
  cnpjs: string[]; // Aceitar array de CNPJs
  cliente: string;
  email_to: string;
  custom_text?: string;
}
```

---

## 7. Formatação da Planilha de Aging

### Problemas Identificados
1. Colunas com texto truncado (sem wrap)
2. VALOR como string (contagem, não soma)
3. Falta total em atraso do dia na planilha

### Solução

**Arquivo:** `supabase/functions/regua-send-aging/index.ts`

**7.1 Habilitar wrap de texto nas células:**
```typescript
dataCell: {
  font: { name: "Arial", sz: 10, color: { rgb: "000000" } },
  alignment: { horizontal: "left", vertical: "center", wrapText: true }, // Adicionar wrapText
  // ...
}
```

**7.2 Inserir VALOR como número para permitir soma:**
```typescript
// Ao invés de string formatada, inserir número com formato
ws[cellRef] = { 
  v: Number(inv.valor_nf) || 0, 
  t: 'n',  // tipo numérico
  s: STYLES.dataCellNumber,
  z: '#,##0.00' // formato brasileiro
};
```

**7.3 Adicionar linha de subtotal por dia de vencimento:**
```typescript
// Agrupar faturas por data de vencimento e adicionar subtotais
const byDate = groupBy(invoices, 'data_vencimento');
// Adicionar linha de total ao final de cada grupo de data
```

---

## 8. CNPJ na Tabela de Busca de Clientes

### Solução

**Arquivo:** `src/pages/ReguaCobranca.tsx`

Adicionar coluna CNPJ na tabela de resultados:

```tsx
// No thead
<th className="px-4 py-3 text-left text-[0.75rem] uppercase tracking-wider font-bold">
  CNPJ
</th>

// No tbody
<td className="px-4 py-3 font-mono text-[0.8rem]">
  {formatCnpj(c.cnpj)}
</td>
```

---

## 9. Barra de Rolagem Horizontal na Tela de Disputa

### Problema Atual
A tabela tem `min-width: 1500px` mas o container pode não mostrar scrollbar adequadamente.

### Solução

**Arquivo:** `src/pages/FinanceiroDisputa.tsx`

Ajustar o container da tabela:

```tsx
<TableCard>
  <div className="rounded-2xl overflow-x-auto"> {/* Garantir overflow-x-auto */}
    <table className="w-full min-w-[1500px] border-collapse">
      {/* ... */}
    </table>
  </div>
</TableCard>
```

Alternativamente, usar componente `ScrollArea` do Radix:

```tsx
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

<ScrollArea className="w-full">
  <table className="w-full min-w-[1500px]">
    {/* ... */}
  </table>
  <ScrollBar orientation="horizontal" />
</ScrollArea>
```

---

## Arquivos a Modificar

| Arquivo | Alterações |
|---------|------------|
| `src/pages/FinanceiroDisputa.tsx` | Importação flexível, herança OBS, ações em lote, scroll horizontal |
| `src/pages/ReguaCobranca.tsx` | Email editável, CNPJ na tabela, agrupamento clientes |
| `supabase/functions/regua-send-aging/index.ts` | Usar emails do request, formatação Excel, múltiplos CNPJs |
| `supabase/functions/mariadb-proxy/index.ts` | Actions bulk_delete/resolve_disputas |

---

## Ordem de Implementação

1. **Bug tela preta** - Prioridade alta (usabilidade)
2. **Scroll horizontal** - Rápido de implementar
3. **CNPJ na tabela** - Rápido de implementar
4. **Email editável** - Frontend + Backend
5. **Importação flexível + herança OBS** - Lógica no frontend
6. **Ações em lote** - Frontend + Backend
7. **Formatação planilha** - Backend
8. **Agrupamento aging** - Frontend + Backend

---

## Detalhes Técnicos

### Nova Interface para Importação

```typescript
interface ImportItem {
  nd: string;
  responsavel: string;
  observacoes: string;
  // Campos opcionais
  departamento?: string;
  escalation?: string;
}
```

### Validação de Emails

```typescript
const validateEmails = (input: string): string[] => {
  return input
    .split(/[;,\n]/)
    .map(e => e.trim().toLowerCase())
    .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
};
```

### Formato Numérico para Excel

```typescript
// Usar formato numérico para permitir operações de soma
const STYLES_NUMBER = {
  ...STYLES.dataCellNumber,
  numFmt: '#,##0.00', // Formato brasileiro
};
```
