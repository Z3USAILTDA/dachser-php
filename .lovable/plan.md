
# Plano Atualizado: Implementação Completa da Régua de Cobrança e Tela de Disputa

## Resumo Executivo

Este plano detalha a implementação de todos os itens pendentes, organizados por prioridade. A análise do código revelou que as estruturas básicas existem, mas funcionalidades críticas estão incompletas ou ausentes.

---

## Análise do Estado Atual

| Funcionalidade | Status | Observações |
|----------------|--------|-------------|
| Importação flexível de planilha | Parcial | Aceita xlsx/csv mas falta buscar variações como "obs", "observações" |
| Bug tela preta | Não implementado | Sem ErrorBoundary ou proteções de estado |
| Email editável | Não implementado | Email hardcoded na linha 323 (frontend) e 506-510 (backend) |
| Herança de OBS | Não implementado | Nenhuma lógica de agrupamento por processo |
| Ações em lote | Não implementado | Sem checkbox, sem estado selectedDocKeys |
| Agrupamento aging | Não implementado | Apenas envio individual |
| CNPJ na tabela | Não implementado | Coluna ausente |
| Scroll horizontal | Parcial | Usa overflow-auto básico |
| Formatação planilha aging | Parcial | VALOR é string, sem wrapText, sem subtotais |

---

## Fase 1: Estabilidade (Prioridade Crítica)

### 1.1 Resolução do Bug de Tela Preta

**Problema**: Erros JavaScript não capturados causam tela preta ao atualizar.

**Arquivos**: `src/pages/ReguaCobranca.tsx`, `src/pages/FinanceiroDisputa.tsx`

**Solução**:

1. Criar componente ErrorBoundary genérico:
```typescript
// src/components/ErrorBoundary.tsx
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-8 text-center">
          <p className="text-red-400">Erro ao carregar. Tente atualizar a página.</p>
          <button onClick={() => window.location.reload()}>Recarregar</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

2. Proteger useEffect com try-catch:
```typescript
// Em ambas as páginas
useEffect(() => {
  const load = async () => {
    try {
      await fetchData();
    } catch (err) {
      console.error("Erro na inicialização:", err);
      setHasError(true);
    }
  };
  load();
}, []);
```

3. Validar estados iniciais antes de renderizar:
```typescript
if (!rows || loading) return <LoadingSkeleton />;
```

---

## Fase 2: Funcionalidades Core (Prioridade Alta)

### 2.1 Email de Destino Editável

**Arquivos**: 
- `src/pages/ReguaCobranca.tsx` (linhas 112-114, 320-325, 727-728)
- `supabase/functions/regua-send-aging/index.ts` (linhas 505-510)

**Frontend**:
```typescript
// Novo estado para emails editáveis
const [agingRecipients, setAgingRecipients] = useState<string>(
  "devs@z3us.ai; bia.souza@dachser.com; jessica.costa@dachser.com"
);

// Adicionar Input editável no modal (após linha 727)
<div className="space-y-2">
  <Label className="text-sm text-muted-foreground">Destinatários</Label>
  <Input
    value={agingRecipients}
    onChange={(e) => setAgingRecipients(e.target.value)}
    placeholder="email1@domain.com; email2@domain.com"
    className="bg-[#13141a] border-white/20"
  />
  <p className="text-xs text-muted-foreground">
    Separe múltiplos emails com ponto e vírgula (;)
  </p>
</div>

// Atualizar confirmSendAging (linha 319-325)
body: {
  cnpj: selectedRow.cnpj,
  cliente: selectedRow.razao_base || selectedRow.razao_social,
  email_to: agingRecipients, // Usar estado editável
  custom_text: agingEmailText,
}
```

**Backend** (`regua-send-aging/index.ts`):
```typescript
// Substituir linhas 505-510
const parseEmails = (input: string): string[] => {
  const fallback = ["devs@z3us.ai", "bia.souza@dachser.com", "jessica.costa@dachser.com"];
  if (!input?.trim()) return fallback;
  
  const emails = input
    .split(/[;,\n]/)
    .map(e => e.trim().toLowerCase())
    .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  
  return emails.length > 0 ? emails : fallback;
};

const recipientEmails = parseEmails(email_to);
console.log("Sending aging email to recipients:", recipientEmails);
```

### 2.2 CNPJ na Tabela de Busca de Clientes

**Arquivo**: `src/pages/ReguaCobranca.tsx` (linhas 545-583)

```typescript
// Adicionar coluna no thead (após linha 552)
<th className="px-4 py-3 text-left text-[0.75rem] uppercase tracking-wider font-bold">
  CNPJ
</th>

// Adicionar célula no tbody (após linha 562)
<td className="px-4 py-3 font-mono text-[0.8rem]">
  {formatCnpj(c.cnpj)}
</td>

// Função de formatação (adicionar no início do arquivo)
const formatCnpj = (cnpj: string) => {
  if (!cnpj) return "—";
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length === 14) {
    return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12,14)}`;
  }
  return cnpj;
};
```

### 2.3 Scroll Horizontal Otimizado na Disputa

**Arquivo**: `src/pages/FinanceiroDisputa.tsx` (linha 611-613)

```typescript
// Substituir div wrapper
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

// Na linha 611-613
<ScrollArea className="w-full whitespace-nowrap rounded-2xl">
  <table className="w-full min-w-[1500px] border-collapse">
    {/* ... conteúdo da tabela ... */}
  </table>
  <ScrollBar orientation="horizontal" />
</ScrollArea>
```

---

## Fase 3: Importação e Herança de Dados (Prioridade Alta)

### 3.1 Importação Flexível de Planilha

**Arquivo**: `src/pages/FinanceiroDisputa.tsx` (função parseSpreadsheet, linhas 358-455)

**Atualizar findColumnIndex** para aceitar mais variações:
```typescript
const findColumnIndex = (headers: string[], ...names: string[]): number => {
  const normalize = (s: string) => 
    s?.toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")  // Remove acentos
      .replace(/\s+/g, ' ')
      .trim() || '';
  
  for (let i = 0; i < headers.length; i++) {
    const h = normalize(headers[i]);
    for (const name of names) {
      if (h.includes(normalize(name))) return i;
    }
  }
  return -1;
};

// Atualizar busca de colunas (linhas 400-404)
const ndIdx = findColumnIndex(headerRow, 'nd', 'documento', 'nf', 'numero', 'doc', 'nota');
const descIdx = findColumnIndex(headerRow, 
  'obs', 'observações', 'observacoes', 'observacao',
  'descrição', 'descricao', 
  'pendência', 'pendencia',
  'motivo', 'comentário', 'comentario'
);
const respIdx = findColumnIndex(headerRow, 
  'responsável', 'responsavel', 'resp', 
  'analista', 'atribuído', 'atribuido'
);

// Adicionar validação de colunas obrigatórias
if (ndIdx === -1) {
  toast({ 
    title: "Erro de formato", 
    description: "Coluna 'ND' ou 'Documento' não encontrada na planilha",
    variant: "destructive" 
  });
  return [];
}
```

### 3.2 Herança de Observações entre ND/NF do Mesmo Processo

**Arquivo**: `src/pages/FinanceiroDisputa.tsx` (adicionar após parseSpreadsheet)

```typescript
// Função para propagar OBS e Responsável entre itens do mesmo processo
const propagateObservations = (
  items: Array<{ nd: string; descricao: string; responsavel: string; departamento: string; escalation: string }>
) => {
  // Agrupar por prefixo do documento (primeiros 8-10 caracteres como identificador de processo)
  const groups = new Map<string, typeof items>();
  
  for (const item of items) {
    // Extrair base do processo (remover sufixos como -A, -B, /1, /2)
    const processoBase = item.nd.replace(/[-\/][A-Z0-9]{1,2}$/i, '').substring(0, 12);
    
    if (!groups.has(processoBase)) {
      groups.set(processoBase, []);
    }
    groups.get(processoBase)!.push(item);
  }
  
  // Propagar OBS e Responsável dentro de cada grupo
  for (const [, groupItems] of groups) {
    if (groupItems.length <= 1) continue;
    
    // Encontrar valores para propagar
    const obsDoGrupo = groupItems.find(i => i.descricao?.trim())?.descricao || '';
    const respDoGrupo = groupItems.find(i => i.responsavel?.trim())?.responsavel || '';
    const deptDoGrupo = groupItems.find(i => i.departamento?.trim())?.departamento || '';
    
    // Propagar para itens vazios
    for (const item of groupItems) {
      if (!item.descricao?.trim() && obsDoGrupo) {
        item.descricao = obsDoGrupo;
      }
      if (!item.responsavel?.trim() && respDoGrupo) {
        item.responsavel = respDoGrupo;
      }
      if (!item.departamento?.trim() && deptDoGrupo) {
        item.departamento = deptDoGrupo;
      }
    }
  }
  
  return items;
};

// Atualizar handleImportSpreadsheet (linha 465)
const items = await parseSpreadsheet(importFile);
const processedItems = propagateObservations(items);
// Usar processedItems na chamada da API
```

---

## Fase 4: Ações em Lote (Prioridade Média-Alta)

### 4.1 Frontend - Seleção Múltipla

**Arquivo**: `src/pages/FinanceiroDisputa.tsx`

```typescript
// Novos estados (adicionar após linha 100)
const [selectedDocKeys, setSelectedDocKeys] = useState<Set<string>>(new Set());
const [selectAll, setSelectAll] = useState(false);
const [bulkLoading, setBulkLoading] = useState(false);

// Funções de seleção
const toggleSelectAll = () => {
  if (selectAll) {
    setSelectedDocKeys(new Set());
  } else {
    setSelectedDocKeys(new Set(paginatedRows.map(r => r.doc_key)));
  }
  setSelectAll(!selectAll);
};

const toggleSelectRow = (docKey: string) => {
  const newSet = new Set(selectedDocKeys);
  if (newSet.has(docKey)) {
    newSet.delete(docKey);
    setSelectAll(false);
  } else {
    newSet.add(docKey);
  }
  setSelectedDocKeys(newSet);
};

// Ações em lote
const handleBulkDelete = async () => {
  if (selectedDocKeys.size === 0) return;
  setBulkLoading(true);
  try {
    const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
      body: { action: "bulk_delete_disputas", doc_keys: Array.from(selectedDocKeys) },
    });
    if (error) throw error;
    toast({ title: "Sucesso", description: `${data.deleted} disputa(s) excluída(s)` });
    setSelectedDocKeys(new Set());
    setSelectAll(false);
    fetchDisputas();
  } catch (err) {
    toast({ title: "Erro", description: "Falha ao excluir disputas", variant: "destructive" });
  } finally {
    setBulkLoading(false);
  }
};

const handleBulkResolve = async () => {
  // Similar ao handleBulkDelete, usando action "bulk_resolve_disputas"
};
```

**Adicionar checkbox na tabela**:
```typescript
// Nova coluna no thead (antes de Cliente)
<th className="bg-[#15151f] sticky top-0 z-[1] px-2 py-[14px] w-10">
  <Checkbox 
    checked={selectAll}
    onCheckedChange={() => toggleSelectAll()}
  />
</th>

// Nova célula no tbody
<td className="px-2 py-[14px]">
  <Checkbox 
    checked={selectedDocKeys.has(r.doc_key)}
    onCheckedChange={() => toggleSelectRow(r.doc_key)}
  />
</td>
```

**Barra de ações em lote** (adicionar antes da tabela):
```typescript
{selectedDocKeys.size > 0 && (
  <div className="mb-3 p-3 bg-primary/10 border border-primary/30 rounded-lg flex items-center gap-4">
    <span className="text-sm font-medium">
      {selectedDocKeys.size} item(s) selecionado(s)
    </span>
    <Button 
      size="sm" 
      variant="outline" 
      onClick={handleBulkResolve}
      disabled={bulkLoading}
      className="h-8 gap-1"
    >
      <Check className="w-3 h-3" /> Resolver selecionados
    </Button>
    <Button 
      size="sm" 
      variant="destructive" 
      onClick={() => {/* abrir dialog de confirmação */}}
      disabled={bulkLoading}
      className="h-8 gap-1"
    >
      <Trash2 className="w-3 h-3" /> Excluir selecionados
    </Button>
    <Button 
      size="sm" 
      variant="ghost" 
      onClick={() => { setSelectedDocKeys(new Set()); setSelectAll(false); }}
      className="h-8"
    >
      Limpar seleção
    </Button>
  </div>
)}
```

### 4.2 Backend - Actions de Lote

**Arquivo**: `supabase/functions/mariadb-proxy/index.ts`

```typescript
case 'bulk_delete_disputas': {
  const { doc_keys } = body as { doc_keys?: string[] };
  
  if (!doc_keys || !Array.isArray(doc_keys) || doc_keys.length === 0) {
    return new Response(
      JSON.stringify({ error: 'doc_keys é obrigatório', success: false }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  let deletedCount = 0;
  for (const docKey of doc_keys) {
    const insertSql = `
      INSERT IGNORE INTO ai_agente.t_financeiro_soft_delete (documento, active)
      VALUES (?, 0)
    `;
    await client.execute(insertSql, [docKey]);
    deletedCount++;
  }
  
  console.log(`Bulk soft-deleted ${deletedCount} disputas`);
  result = { success: true, deleted: deletedCount };
  break;
}

case 'bulk_resolve_disputas': {
  const { doc_keys } = body as { doc_keys?: string[] };
  
  if (!doc_keys || !Array.isArray(doc_keys) || doc_keys.length === 0) {
    return new Response(
      JSON.stringify({ error: 'doc_keys é obrigatório', success: false }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  let resolvedCount = 0;
  for (const docKey of doc_keys) {
    // Obter id_rm
    const getIdRmSql = `
      SELECT id_rm FROM dados_dachser.t_dados_financeiro_nfs 
      WHERE documento = ? OR numero_nf = ? OR nd = ?
      LIMIT 1
    `;
    const idRmRows = await client.query(getIdRmSql, [docKey, docKey, docKey]);
    const idRm = idRmRows?.[0]?.id_rm;
    
    // Atualizar NFs
    await client.execute(`
      UPDATE dados_dachser.t_dados_financeiro_nfs 
      SET disputa = 0, fim_disputa = NOW()
      WHERE documento = ? OR numero_nf = ? OR nd = ?
    `, [docKey, docKey, docKey]);
    
    // Atualizar RM se existir
    if (idRm) {
      await client.execute(`
        UPDATE dados_dachser.t_dados_rm 
        SET nf_disputa = 0, fim_disputa = NOW()
        WHERE id_rm = ?
      `, [idRm]);
    }
    
    resolvedCount++;
  }
  
  console.log(`Bulk resolved ${resolvedCount} disputas`);
  result = { success: true, resolved: resolvedCount };
  break;
}
```

---

## Fase 5: Agrupamento para Aging (Prioridade Média)

### 5.1 Frontend - Seleção Múltipla de Clientes

**Arquivo**: `src/pages/ReguaCobranca.tsx`

```typescript
// Novo estado
const [selectedClienteCnpjs, setSelectedClienteCnpjs] = useState<Set<string>>(new Set());

// Adicionar checkbox na tabela de clientes (linhas 545-583)
<th className="px-4 py-3 w-10">
  <Checkbox 
    checked={selectedClienteCnpjs.size === clienteRows.length && clienteRows.length > 0}
    onCheckedChange={() => {
      if (selectedClienteCnpjs.size === clienteRows.length) {
        setSelectedClienteCnpjs(new Set());
      } else {
        setSelectedClienteCnpjs(new Set(clienteRows.map(c => c.cnpj)));
      }
    }}
  />
</th>

// Botão de envio agrupado
{selectedClienteCnpjs.size > 1 && (
  <Button
    size="sm"
    className="h-8 gap-1 bg-orange-600 hover:bg-orange-700"
    onClick={handleSendAgingAgrupado}
  >
    <Mail className="h-3 w-3" />
    Enviar Aging Agrupado ({selectedClienteCnpjs.size})
  </Button>
)}

// Nova função
const handleSendAgingAgrupado = () => {
  // Preparar lista de CNPJs para envio consolidado
  const cnpjsList = Array.from(selectedClienteCnpjs);
  // Abrir modal com configuração de envio agrupado
  setAgrupamentoModalOpen(true);
  setAgrupamentoCnpjs(cnpjsList);
};
```

### 5.2 Backend - Aging com Múltiplos CNPJs

**Arquivo**: `supabase/functions/regua-send-aging/index.ts`

```typescript
// Atualizar interface (linha 12)
interface AgingRequest {
  cnpj?: string;
  cnpjs?: string[];  // Nova propriedade para múltiplos
  cliente: string;
  email_to: string;
  custom_text?: string;
}

// Atualizar lógica de busca (após linha 230)
const { cnpj, cnpjs, cliente, email_to, custom_text }: AgingRequest = await req.json();

// Determinar lista de CNPJs a processar
let targetCnpjs: string[] = [];
if (cnpjs && Array.isArray(cnpjs) && cnpjs.length > 0) {
  // Modo agrupado: usar todos os CNPJs fornecidos
  for (const c of cnpjs) {
    const baseCnpj = c.replace(/\D/g, "").substring(0, 8);
    const relatedResult = await client.query(`
      SELECT DISTINCT cnpj 
      FROM dados_dachser.t_dados_financeiro_nfs 
      WHERE cnpj LIKE CONCAT(?, '%')
      AND DATEDIFF(CURDATE(), data_vencimento) >= 1
    `, [baseCnpj]);
    targetCnpjs.push(...relatedResult.map((r: any) => r.cnpj));
  }
  targetCnpjs = [...new Set(targetCnpjs)]; // Remover duplicatas
} else if (cnpj) {
  // Modo individual (comportamento atual)
  const baseCnpj = cnpj.replace(/\D/g, "").substring(0, 8);
  // ... lógica existente ...
}
```

---

## Fase 6: Formatação da Planilha de Aging (Prioridade Média)

### 6.1 Corrigir Formatação

**Arquivo**: `supabase/functions/regua-send-aging/index.ts`

```typescript
// Atualizar estilo de células de dados para habilitar wrap (linha ~90-100)
dataCell: {
  font: { name: "Arial", sz: 10, color: { rgb: "000000" } },
  alignment: { 
    horizontal: "left", 
    vertical: "center", 
    wrapText: true  // ADICIONAR
  },
  border: { /* ... existente ... */ },
}

// Inserir VALOR como número (na função createSheetForCnpj, onde monta rowData)
// Ao invés de formatCurrencyNumber(Number(inv.valor_nf) || 0)
// Inserir valor numérico com formatação:
ws[cellRef] = { 
  v: Number(inv.valor_nf) || 0, 
  t: 'n',  // tipo numérico
  s: STYLES.dataCellNumber,
  z: '#,##0.00'  // formato com 2 decimais
};

// Adicionar linha de total ao final de cada sheet
const totalRow = 6 + invoices.length;
ws[XLSX.utils.encode_cell({ r: totalRow, c: 9 })] = { 
  v: "TOTAL EM ATRASO:", 
  s: STYLES.boxLabel 
};
ws[XLSX.utils.encode_cell({ r: totalRow, c: 10 })] = { 
  v: cnpjTotal, 
  t: 'n',
  s: STYLES.boxValue,
  z: '"R$ "#,##0.00'
};
```

---

## Resumo de Arquivos a Modificar

| Arquivo | Alterações |
|---------|------------|
| `src/components/ErrorBoundary.tsx` | **CRIAR** - Componente de tratamento de erros |
| `src/pages/ReguaCobranca.tsx` | Bug fix, email editável, CNPJ na tabela, seleção de clientes |
| `src/pages/FinanceiroDisputa.tsx` | Bug fix, importação flexível, herança OBS, ações em lote, scroll |
| `supabase/functions/regua-send-aging/index.ts` | Email dinâmico, múltiplos CNPJs, formatação Excel |
| `supabase/functions/mariadb-proxy/index.ts` | Actions bulk_delete e bulk_resolve |

---

## Ordem de Implementação Recomendada

1. **Fase 1**: ErrorBoundary + proteções de estado (30min)
2. **Fase 2.1**: Email editável (45min)
3. **Fase 2.2**: CNPJ na tabela (15min)
4. **Fase 2.3**: Scroll horizontal (15min)
5. **Fase 3.1**: Importação flexível (30min)
6. **Fase 3.2**: Herança de OBS (30min)
7. **Fase 4**: Ações em lote - frontend + backend (1h)
8. **Fase 5**: Agrupamento aging (45min)
9. **Fase 6**: Formatação planilha aging (30min)

**Tempo total estimado**: ~5 horas de implementação

---

## Testes Recomendados

1. **Bug tela preta**: Atualizar (F5) as páginas várias vezes
2. **Importação**: Testar com planilhas de diferentes formatos/headers
3. **Herança OBS**: Importar planilha com ND/NF do mesmo processo, um com OBS e outro sem
4. **Ações em lote**: Selecionar múltiplos itens e executar exclusão/resolução
5. **Email editável**: Modificar destinatários e verificar logs do Resend
6. **Aging agrupado**: Selecionar múltiplos clientes e verificar planilha gerada
