

## Plano: Adicionar coluna HBL em todas as visualizações de Demurrage

### Contexto
O campo `hbl` já existe na interface `DemurrageContainer` (linha 63) e `bl_number` existe na `PreInvoice` (linha 447). Precisamos apenas adicionar a coluna na UI das tabelas.

### Alterações

**1. `src/pages/demurrage/DemurrageMonitor.tsx` — Tabela principal**
- Adicionar `<TableHead>HBL</TableHead>` após a coluna MBL (linha 441)
- Adicionar `<TableCell className="font-mono text-sm">{container.hbl || '-'}</TableCell>` após a célula MBL (linha 460)

**2. `src/pages/demurrage/DemurragePreInvoicing.tsx` — Tabela de pré-faturas**
- Adicionar `<TableHead>HBL</TableHead>` após a coluna MBL (linha 426)
- Adicionar `<TableCell className="font-mono text-sm">{invoice.bl_number || '-'}</TableCell>` após a célula MBL (linha 458)

**3. `src/pages/demurrage/DemurrageClients.tsx` — Tabela de alertas**
- Adicionar `<TableHead>HBL</TableHead>` após a coluna MBL (linha 468)
- Adicionar `<TableCell className="font-mono text-sm">{(alert as any).house_bl || '-'}</TableCell>` após a célula MBL (linha 489)

**4. `src/pages/demurrage/DemurrageFreeTimes.tsx` — Tabela de free times**
- Adicionar `<TableHead>HBL</TableHead>` após a coluna MBL (linha 254)
- Adicionar célula com dado HBL correspondente após a célula MBL

### Arquivos editados
- `src/pages/demurrage/DemurrageMonitor.tsx`
- `src/pages/demurrage/DemurragePreInvoicing.tsx`
- `src/pages/demurrage/DemurrageClients.tsx`
- `src/pages/demurrage/DemurrageFreeTimes.tsx`

