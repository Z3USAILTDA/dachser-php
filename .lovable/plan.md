## Ajustes no filtro unificado de data

### 1. Layout horizontal dos calendários
No `PopoverContent`, exibir os dois calendários **lado a lado** (De à esquerda, Até à direita) em vez de empilhados:

```tsx
<PopoverContent className="w-auto p-3 ...">
  <div className="flex gap-4">
    <div>
      <div className="text-xs ... mb-1">De</div>
      <CalendarPicker mode="single" selected={filterDataInicio} onSelect={setFilterDataInicio} />
    </div>
    <div>
      <div className="text-xs ... mb-1">Até</div>
      <CalendarPicker mode="single" selected={filterDataFim} onSelect={setFilterDataFim} />
    </div>
  </div>
  {(filterDataInicio || filterDataFim) && <Button>Limpar datas</Button>}
</PopoverContent>
```

Em mobile (`max-md`), usar `flex-col` para empilhar.

### 2. Reordenar o filtro
Mover o bloco do `<Popover>` unificado para **antes** do `<Select>` "Vencimento" (Todos/Hoje/Vencidos/Próximos 7), ou seja, logo após o campo de busca.

Ordem final na barra de filtros:
```
[🔍 Busca] [📅 Vencimento (calendário)] [▼ Vencimento rápido] [Status ▼] ...
```

### Arquivo
- `src/components/esteira/PagamentosTab.tsx` (única alteração)

Sem mudanças de lógica, estado ou backend.