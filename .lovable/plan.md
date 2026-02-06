

# Implementação: Autocomplete de Consignee com Busca Dinâmica

## Resumo

Implementar um campo de autocomplete para o Consignee no diálogo de cadastro LCL, com busca dinâmica na tabela `t_clientes_base` conforme o usuário digita. O usuário pode selecionar uma sugestão ou usar um valor customizado não cadastrado.

---

## Alterações Técnicas

### 1. Backend: `supabase/functions/olimpo-proxy/index.ts`

**Nova action `search_clientes_base`** (inserir após linha 6775, antes de `add_lcl_container`):

```typescript
// ===== SEARCH CLIENTES BASE: Autocomplete for consignee =====
if (action === 'search_clientes_base') {
  const mariadbHost = Deno.env.get('MARIADB_HOST');
  const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
  const mariadbUser = Deno.env.get('MARIADB_USER');
  const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
  const database = Deno.env.get('MARIADB_DATABASE') || 'dados_dachser';

  if (!mariadbHost || !mariadbUser || !mariadbPass) {
    return new Response(JSON.stringify({ error: 'MariaDB não configurado', clientes: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const searchTerm = url.searchParams.get('q') || '';
  const limit = parseInt(url.searchParams.get('limit') || '15', 10);

  if (searchTerm.length < 2) {
    return new Response(JSON.stringify({ success: true, clientes: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
  const client = await new Client().connect({
    hostname: mariadbHost,
    port: parseInt(mariadbPort, 10),
    username: mariadbUser,
    password: mariadbPass,
    db: database,
  });

  try {
    const rows = await client.query(`
      SELECT 
        nome_cliente,
        cnpj,
        dchr_customer_number,
        cidade_uf,
        pais
      FROM ${database}.t_clientes_base
      WHERE ativo = 1 
        AND nome_cliente LIKE ?
      ORDER BY nome_cliente
      LIMIT ?
    `, [`%${searchTerm}%`, limit]);

    await client.close();
    console.log(`[search_clientes_base] Found ${rows.length} clients for term "${searchTerm}"`);
    
    return new Response(JSON.stringify({
      success: true,
      clientes: rows
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  } catch (e: any) {
    await client.close();
    console.error('[search_clientes_base] Error:', e);
    return new Response(JSON.stringify({ error: e.message, clientes: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
```

---

### 2. Frontend: `src/pages/ContainerTracking.tsx`

**2.1 Adicionar imports** (linha ~1):

```typescript
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Plus } from "lucide-react";
```

**2.2 Adicionar tipo e estados** (após linha ~387):

```typescript
// Tipo para cliente sugerido
interface ClienteSugerido {
  nome_cliente: string;
  cnpj?: string;
  dchr_customer_number?: string;
  cidade_uf?: string;
  pais?: string;
}

// Estados para autocomplete de consignee
const [consigneeSuggestions, setConsigneeSuggestions] = useState<ClienteSugerido[]>([]);
const [consigneePopoverOpen, setConsigneePopoverOpen] = useState(false);
const [isSearchingConsignee, setIsSearchingConsignee] = useState(false);

// Debounce para busca de consignee
const searchConsigneeTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

const searchConsignee = (term: string) => {
  // Limpa timeout anterior
  if (searchConsigneeTimeoutRef.current) {
    clearTimeout(searchConsigneeTimeoutRef.current);
  }
  
  if (term.length < 2) {
    setConsigneeSuggestions([]);
    setConsigneePopoverOpen(false);
    return;
  }
  
  // Debounce de 300ms
  searchConsigneeTimeoutRef.current = setTimeout(async () => {
    setIsSearchingConsignee(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=search_clientes_base&q=${encodeURIComponent(term)}&limit=15`,
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
          }
        }
      );
      const data = await res.json();
      if (data.success && data.clientes) {
        setConsigneeSuggestions(data.clientes);
        if (data.clientes.length > 0) {
          setConsigneePopoverOpen(true);
        }
      }
    } catch (e) {
      console.error('Erro ao buscar consignees:', e);
    } finally {
      setIsSearchingConsignee(false);
    }
  }, 300);
};
```

**2.3 Substituir campo Consignee** (linhas ~2566-2581):

Substituir o input atual por um Popover com Command:

```tsx
<div className="space-y-2">
  <Label className={cn("text-white", lclAutoFilled && lclFormData.consignee && "text-green-300")}>
    Consignee
  </Label>
  <Popover open={consigneePopoverOpen} onOpenChange={setConsigneePopoverOpen}>
    <PopoverTrigger asChild>
      <div className="relative">
        <Input 
          placeholder="Digite para buscar clientes..."
          value={lclFormData.consignee}
          onChange={e => {
            const value = e.target.value;
            setLclFormData(prev => ({ ...prev, consignee: value }));
            if (!lclAutoFilled) {
              searchConsignee(value);
            }
          }}
          onFocus={() => {
            if (consigneeSuggestions.length > 0 && !lclAutoFilled) {
              setConsigneePopoverOpen(true);
            }
          }}
          className={cn(
            "bg-[rgba(0,0,0,.3)] border-[rgba(255,255,255,.14)] text-white placeholder:text-gray-500 pr-8",
            lclAutoFilled && lclFormData.consignee && "border-green-500/30 bg-green-900/5"
          )}
          readOnly={lclAutoFilled}
        />
        {isSearchingConsignee && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
        )}
      </div>
    </PopoverTrigger>
    <PopoverContent 
      className="w-[400px] p-0 bg-[#1a1a2e] border-[rgba(255,255,255,.1)]" 
      align="start"
      onOpenAutoFocus={e => e.preventDefault()}
    >
      <Command className="bg-transparent">
        <CommandList>
          {consigneeSuggestions.length === 0 ? (
            <CommandEmpty className="text-gray-400 py-4 text-center text-sm">
              {lclFormData.consignee.length < 2 
                ? "Digite pelo menos 2 caracteres..." 
                : "Nenhum cliente encontrado"}
            </CommandEmpty>
          ) : (
            <CommandGroup heading="Clientes cadastrados" className="text-gray-400">
              {consigneeSuggestions.map((cliente, idx) => (
                <CommandItem
                  key={idx}
                  value={cliente.nome_cliente}
                  onSelect={() => {
                    setLclFormData(prev => ({ ...prev, consignee: cliente.nome_cliente }));
                    setConsigneePopoverOpen(false);
                  }}
                  className="cursor-pointer hover:bg-[rgba(255,255,255,.05)] text-white"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{cliente.nome_cliente}</span>
                    <span className="text-xs text-gray-400">
                      {[cliente.cidade_uf, cliente.pais].filter(Boolean).join(' - ')}
                      {cliente.cnpj && ` • CNPJ: ${cliente.cnpj}`}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
        {lclFormData.consignee && !consigneeSuggestions.some(c => c.nome_cliente === lclFormData.consignee) && (
          <div className="border-t border-[rgba(255,255,255,.1)] p-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full justify-start text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/20"
              onClick={() => setConsigneePopoverOpen(false)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Usar "{lclFormData.consignee}" (não cadastrado)
            </Button>
          </div>
        )}
      </Command>
    </PopoverContent>
  </Popover>
  <span className="text-xs text-gray-500">
    Busque por nome ou digite um consignatário não cadastrado
  </span>
</div>
```

**2.4 Reset do estado ao fechar dialog** (no onClick do botão Cancelar, ~linha 2644):

Adicionar reset dos estados do autocomplete:

```typescript
setConsigneeSuggestions([]);
setConsigneePopoverOpen(false);
```

---

## Fluxo de Funcionamento

```text
FLUXO: AUTOCOMPLETE DE CONSIGNEE

1. Usuário abre o diálogo "Cadastrar LCL"

2. Usuário digita no campo Consignee (ex: "DACH")

3. Após 300ms (debounce), sistema busca em t_clientes_base:
   SELECT nome_cliente, cnpj, cidade_uf, pais
   WHERE ativo = 1 AND nome_cliente LIKE '%DACH%'
   LIMIT 15

4. Popover abre com sugestões:
   ┌─────────────────────────────────────────────────┐
   │ Clientes cadastrados                            │
   ├─────────────────────────────────────────────────┤
   │ DACHSER BRASIL LTDA                             │
   │ São Paulo - SP • CNPJ: 12.345.678/0001-90      │
   ├─────────────────────────────────────────────────┤
   │ DACHSER NETHERLANDS BV                          │
   │ Netherlands                                     │
   ├─────────────────────────────────────────────────┤
   │ ───────────────────────────────────────────────│
   │ [+] Usar "DACH" (não cadastrado)               │
   └─────────────────────────────────────────────────┘

5. Usuário pode:
   a) Clicar em uma sugestão -> preenche automaticamente
   b) Continuar digitando -> permite valor customizado
   c) Clicar "Usar (não cadastrado)" -> fecha popover, mantém texto
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/olimpo-proxy/index.ts` | Nova action `search_clientes_base` para buscar clientes por nome |
| `src/pages/ContainerTracking.tsx` | Autocomplete com Popover+Command, estados e lógica de busca |

---

## Considerações Técnicas

1. **Debounce de 300ms**: Evita chamadas excessivas à API durante digitação rápida
2. **Mínimo 2 caracteres**: Busca só inicia após digitar pelo menos 2 letras
3. **Limite de 15 resultados**: Mantém a lista gerenciável
4. **Apenas clientes ativos**: Filtra `WHERE ativo = 1`
5. **Auto-preenchimento preservado**: Se o MBL foi auto-preenchido, o campo Consignee fica readonly
6. **Valor customizado**: Usuário pode usar qualquer texto, mesmo não cadastrado

