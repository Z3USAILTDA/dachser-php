## Ajustes no rodapé do preview (Importar SPO em Lote)

### 1) Alinhamento e tamanho dos badges de erro

**Arquivo:** `src/components/esteira/BatchImportVoucherDialog.tsx` (rodapé do step `preview`)

Mudanças:
- Trocar o container do bloco esquerdo de `items-start` → `items-center` para alinhar os badges verticalmente com o botão "Voltar".
- Trocar o classe externa do footer também para `items-center`.
- Aumentar levemente o texto dos badges: `text-[11px]` → `text-xs`, `px-2 py-0.5` → `px-2.5 py-1`.

```tsx
<div className="flex items-center justify-between gap-3 pt-2 border-t border-border/60">
  <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
    <Button variant="outline" onClick={reset} disabled={busy}>Voltar</Button>
    {errorReasons.length > 0 && (
      <div className="flex flex-wrap gap-1.5 items-center">
        {errorReasons.map(([msg, count]) => (
          <button
            key={msg}
            type="button"
            onClick={() => { setFilter("errors"); setSearch(""); }}
            className="text-xs px-2.5 py-1 rounded-full border border-red-500/30 bg-red-500/5 text-red-300 hover:bg-red-500/10"
            title="Filtrar linhas com erro"
          >
            {count} {count === 1 ? "linha com" : "linhas com"} {msg}
          </button>
        ))}
      </div>
    )}
  </div>
  ...
</div>
```

---

### 2) "Só 11 linhas estão sendo mostradas" — não é bug, é scroll interno

A tabela está dentro de `flex-1 overflow-hidden` com scroll vertical próprio (`h-full overflow-auto` em `BatchImportPreviewTable`). No viewport atual (~1205px CSS, dialog limitado a 85vh), cabem ~11 linhas visíveis — o restante das 26 está acessível via scroll dentro da tabela, mas não há nenhuma pista visual de que existem mais linhas.

Duas correções complementares:

**a) Indicador "Mostrando X de Y"** abaixo da tabela (ou na própria toolbar), reaproveitando a contagem que a tabela já faz internamente.

Como o filtro/busca vivem no pai, basta calcular no `BatchImportVoucherDialog`:

```tsx
const visibleCount = useMemo(() => {
  const q = search.trim().toLowerCase();
  return items.filter(it => {
    if (filter === "errors" && it.status !== "ERROR") return false;
    if (filter === "valid" && it.status !== "VALID") return false;
    if (q) {
      const hay = `${it.spo || ""} ${it.processo || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).length;
}, [items, filter, search]);
```

Renderizar uma linha curta entre a tabela e o footer:
```tsx
<div className="text-[11px] text-muted-foreground px-1">
  Mostrando {visibleCount} de {items.length} linha(s){visibleCount > 11 ? " — role a tabela para ver mais" : ""}
</div>
```

**b) Aumentar a altura útil da tabela** (opcional, para evitar a sensação de "sumiu"): trocar `max-h-[85vh]` do `DialogContent` no step `preview` para `h-[90vh]`, garantindo que a tabela ocupe quase todo o viewport. Sem mudar o comportamento dos outros steps.

```tsx
className={`${step === "preview" ? "w-[90vw] max-w-[1400px] h-[90vh]" : "max-w-2xl"} ...`}
```

---

### O que NÃO muda

- Lógica de filtros, validação, fornecedor da DFV, ícone de info no Fiscal.
- Qualquer comportamento do backend.
- Estrutura dos componentes.
