

# Plano: Sistema de Coloaders e Filtros LCL/FCL para Monitoramento Marítimo

## Contexto

Com base no feedback recebido, as seguintes melhorias foram solicitadas:

1. **Campo específico para Coloader**: Permitir que o time indique o consolidador no momento do cadastro manual de LCL
2. **Filtro LCL/FCL**: Adicionar filtro para separar embarques FCL de LCL
3. **Renomear "Armador" para "Armador/Coloader"**: O filtro deve mostrar apenas parceiros relevantes ao tipo selecionado
4. **Futura sugestão por IA**: Sistema aprenderá padrões e sugerirá coloaders automaticamente

## Regras de Negócio Definidas

| Regra | Definição |
|-------|-----------|
| FCL vs LCL | Registros manuais via "Cadastrar LCL" são LCL; demais (vindos do t_sea_master) são FCL |
| Coloader vs Armador | Para LCLs, o **coloader substitui o armador** (não são independentes) |
| Lista de coloaders | Cadastrados pelos usuários inicialmente (sem lista fixa) |

---

## Alterações Técnicas

### 1. Banco de Dados (MariaDB)

**Adicionar duas colunas na tabela `t_tracking_sea`:**

```sql
ALTER TABLE dados_dachser.t_tracking_sea 
ADD COLUMN tipo_carga ENUM('FCL', 'LCL') DEFAULT 'FCL' 
COMMENT 'Tipo de carga: FCL ou LCL (manual)';

ALTER TABLE dados_dachser.t_tracking_sea 
ADD COLUMN coloader VARCHAR(255) NULL 
COMMENT 'Nome do coloader/consolidador (apenas para LCL)';
```

---

### 2. Edge Function: `olimpo-proxy/index.ts`

**2.1 Nova action: `add_lcl_container`**

A action já é chamada pelo frontend mas NÃO existe no backend. Precisa ser criada:

```typescript
// ===== SEA TRACKING: Add LCL container manually =====
if (action === 'add_lcl_container') {
  const body = await req.json();
  const { mbl_id, container, shipping_line, consignee, eta, transbordo } = body;
  
  // Valida campos obrigatórios
  if (!mbl_id || !container || !shipping_line) {
    return error 400: 'mbl_id, container e armador/coloader obrigatórios';
  }
  
  // Insere com tipo_carga = 'LCL' e coloader = shipping_line
  INSERT INTO t_tracking_sea (
    mbl_id, container, coloader, tipo_carga, consignee, eta, transshipment_port, active
  ) VALUES (?, ?, ?, 'LCL', ?, ?, ?, 1)
  ON DUPLICATE KEY UPDATE ...
  
  return { success: true };
}
```

**2.2 Atualizar action: `get_sea_tracking`**

Incluir os novos campos `tipo_carga` e `coloader` no retorno da query.

**2.3 Nova action: `setup_lcl_columns`**

Criar as novas colunas se não existirem (migration).

---

### 3. Frontend: `ContainerTracking.tsx`

**3.1 Novo estado para filtro de tipo de carga:**

```typescript
const [filterTipoCarga, setFilterTipoCarga] = useState<"all" | "FCL" | "LCL">("all");
```

**3.2 Atualizar interface `MblTrackingData`:**

```typescript
interface MblTrackingData {
  // ... campos existentes ...
  tipo_carga: 'FCL' | 'LCL';
  coloader: string | null;
}
```

**3.3 Renomear label do filtro "Armador" para "Armador/Coloader":**

```tsx
<span className="text-[0.68rem] tracking-[0.1em] uppercase text-[#aaaaaa]">Armador/Coloader</span>
```

**3.4 Adicionar novo filtro "Tipo Carga" (LCL/FCL):**

```tsx
<div className="flex items-center gap-1.5">
  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(0,0,0,.5)] border border-[rgba(255,255,255,.22)]">
    <Package className="h-3 w-3 text-[#ffc800]" />
    <span className="text-[0.68rem] uppercase text-[#aaaaaa]">Carga</span>
  </div>
  <Select value={filterTipoCarga} onValueChange={setFilterTipoCarga}>
    <SelectTrigger className="h-8 w-[100px] rounded-full ...">
      <SelectValue placeholder="Todos" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">Todos</SelectItem>
      <SelectItem value="FCL">FCL</SelectItem>
      <SelectItem value="LCL">LCL</SelectItem>
    </SelectContent>
  </Select>
</div>
```

**3.5 Lógica de filtro dinâmico para Armador/Coloader:**

```typescript
// Lista dinâmica de armadores/coloaders baseada no tipo selecionado
const dynamicArmadoresColoaders = useMemo(() => {
  if (filterTipoCarga === 'FCL') {
    // Apenas armadores com API (JSONCargo)
    return getTrackableCarriers().map(info => normalizeArmadorName(info.name));
  } else if (filterTipoCarga === 'LCL') {
    // Apenas coloaders únicos dos registros LCL
    return [...new Set(mblList.filter(m => m.tipo_carga === 'LCL' && m.coloader)
                               .map(m => m.coloader))];
  } else {
    // Todos: armadores + coloaders
    const armadores = getTrackableCarriers().map(info => normalizeArmadorName(info.name));
    const coloaders = mblList.filter(m => m.coloader).map(m => m.coloader);
    return [...new Set([...armadores, ...coloaders])];
  }
}, [mblList, filterTipoCarga]);
```

**3.6 Atualizar filtro de MBLs:**

```typescript
const matchesTipoCarga = filterTipoCarga === "all" || m.tipo_carga === filterTipoCarga;
const matchesArmadorColoader = filterLine === "all" || 
  (m.tipo_carga === 'LCL' ? m.coloader === filterLine : armador === filterLine);
```

**3.7 Atualizar diálogo "Cadastrar LCL":**

Renomear campo "Armador" para "Coloader" e adicionar hint explicativo:

```tsx
<Label className="text-white">Coloader *</Label>
<Input 
  placeholder="Ex: DACHSER Netherlands, DSV, Kuehne+Nagel..."
  value={lclFormData.coloader}
  ...
/>
<span className="text-xs text-gray-500">
  Nome do consolidador responsável pelo embarque LCL
</span>
```

---

### 4. Tabela de Exibição

Atualizar coluna "Armador" para mostrar coloader quando for LCL:

```tsx
<TableCell>
  {row.tipo_carga === 'LCL' ? (
    <span className="flex items-center gap-1">
      <Package className="w-3 h-3 text-cyan-400" />
      {row.coloader || 'N/D'}
    </span>
  ) : (
    getShippingLineFromMbl(row.mbl_id, row.shipping_line)
  )}
</TableCell>
```

---

## Fluxo de Dados

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FLUXO DE DADOS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   t_sea_master                                                              │
│   ┌────────────────┐                                                        │
│   │ master (MBL)   │───────┐                                                │
│   │ customer_no    │       │  sync_sea_tracking                             │
│   │ nome_analista  │       │  (automático)                                  │
│   └────────────────┘       │                                                │
│                            ▼                                                │
│              ┌─────────────────────────────────────────────────┐            │
│              │           t_tracking_sea                        │            │
│              │  ┌───────────────────────────────────────────┐  │            │
│              │  │ mbl_id          │ tipo_carga = 'FCL'      │  │            │
│              │  │ container       │ coloader = NULL         │  │            │
│              │  │ shipping_line   │ (armador via API)       │  │            │
│              │  └───────────────────────────────────────────┘  │            │
│              └─────────────────────────────────────────────────┘            │
│                            ▲                                                │
│                            │                                                │
│   Cadastro Manual          │  add_lcl_container                             │
│   ┌────────────────┐       │  (manual)                                      │
│   │ MBL            │───────┘                                                │
│   │ Container      │       ┌───────────────────────────────────┐            │
│   │ Coloader       │──────▶│ tipo_carga = 'LCL'                │            │
│   │ ETA            │       │ coloader = 'DACHSER Netherlands'  │            │
│   │ Transbordo     │       │ shipping_line = NULL              │            │
│   └────────────────┘       └───────────────────────────────────┘            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Resumo de Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/olimpo-proxy/index.ts` | Nova action `add_lcl_container`, `setup_lcl_columns`, atualizar `get_sea_tracking` |
| `src/pages/ContainerTracking.tsx` | Novo filtro LCL/FCL, renomear Armador, lógica dinâmica, interface atualizada |

---

## Próximos Passos (Futuro - IA)

Após acúmulo de dados manuais:

1. Criar tabela `t_coloader_patterns` para armazenar padrões detectados
2. Implementar sugestão automática baseada em MBL prefix, origem/destino
3. Exibir sugestão no dialog de cadastro com opção de aceitar ou editar

