

## Plano: Fallback multi-armador para MBLs PENDENTE/NAO_ENCONTRADO

### Contexto

Existem 37 MBLs travados com `container = 'PENDENTE'` ou `'NAO_ENCONTRADO'` na `t_tracking_sea`. O sistema atual (`sea_seed_smart`) só processa containers já conhecidos. O `hapag-batch-discover` existe mas conecta diretamente na API Hapag e faz toda a lógica internamente.

A tela **Status Doc Exportação** já possui Edge Functions prontas que consultam APIs de 3 armadores:
- **Hapag-Lloyd**: `draft-track-hapag-multi` (API `hlag.com`, usa `transportDocumentReference`)
- **MSC**: `draft-track-msc` (API `msc.com/api/feature/tools/TrackingInfo`)
- **ONE**: `draft-track-one` (API `ecomm.one-line.com`)

Todas retornam o mesmo formato normalizado: `{ success, bookingInfo, containers[], events[] }`.

### O que será feito

**1 nova Edge Function**: `sea-carrier-fallback/index.ts`

Responsabilidade:
1. Conecta ao MariaDB e busca MBLs ativos com `container IN ('PENDENTE', 'NAO_ENCONTRADO', '')` da `t_tracking_sea`
2. Identifica o armador pelo prefixo do MBL (usando mapeamento já existente em `_shared/shippingLineMapping.ts`)
3. Para cada MBL, chama a Edge Function correspondente:
   - Hapag → `draft-track-hapag-multi` com `{ searchType: 'bl', searchValue: mblId }`
   - MSC → `draft-track-msc` com `{ searchType: 'bl', searchValue: mblId }`
   - ONE → `draft-track-one` com `{ searchType: 'bl', searchValue: mblId }`
4. Com o retorno (`containers[]`, `bookingInfo`), insere/atualiza os containers na `t_tracking_sea` e remove o placeholder PENDENTE
5. Atualiza o `t_sea_master` com informações consolidadas (container_count, status, vessel, eta, origem, destino)
6. Limite: processa até 15 MBLs por execução, com delay de 1s entre chamadas

**1 alteração no `sea-tracking-cron/index.ts`**: adicionar Passo 4 que chama `sea-carrier-fallback` após o enrich_coords.

### Detalhes técnicos

```text
sea-tracking-cron (orquestrador)
├── Passo 1: olimpo-sync
├── Passo 2: sea_seed_smart (batches)
├── Passo 3: enrich_missing_coords
└── Passo 4 (NOVO): sea-carrier-fallback
    ├── Busca MBLs PENDENTE/NAO_ENCONTRADO no MariaDB
    ├── Detecta armador por prefixo
    ├── Chama draft-track-hapag-multi / draft-track-msc / draft-track-one
    ├── Insere containers descobertos na t_tracking_sea
    ├── Remove placeholders PENDENTE
    └── Atualiza t_sea_master
```

Armadores suportados no fallback:
- `HLCU, HLXU, HLBU, SAHL, GLNL` → Hapag (`draft-track-hapag-multi`)
- `MSCU, MEDU, MSCM` → MSC (`draft-track-msc`)
- `ONEY, ONEU, NYKU, MOLU, KKFU` → ONE (`draft-track-one`)
- Outros prefixos → ignorados (log + skip)

### Arquivos alterados

| Arquivo | Ação |
|---------|------|
| `supabase/functions/sea-carrier-fallback/index.ts` | **Criar** |
| `supabase/functions/sea-tracking-cron/index.ts` | **Adicionar** Passo 4 |

### O que NÃO muda

- Nenhuma Edge Function existente (draft-track-*, olimpo-proxy, hapag-batch-discover)
- Nenhum componente, hook ou tela
- Nenhuma tabela ou migração
- Lógica dos Passos 1-3 do cron permanece idêntica

