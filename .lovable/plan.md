
# Plano: Adicionar Prefixos Não-Padrão no Modal de Armadores Mapeados

## Resumo
Expandir o modal "Armadores Mapeados" para incluir duas novas seções além da já existente seção LCL:
1. **Prefixos DACHSER Internos** - Variantes do SSZ e outros prefixos internos
2. **Prefixos Numéricos** - MBLs que não seguem o padrão SCAC (apenas números)
3. **Formato com Barra** - MBLs no formato `ORIGEM/DESTINO/NUMERO`

---

## Dados Descobertos na t_master_dados

### Prefixos SSZ/DACHSER Internos (com variantes):
| Prefixo | Registros | Descrição |
|---------|-----------|-----------|
| SSZ1 | 14.218 | DACHSER Santos (com ano) |
| SS01 | 3.543 | DACHSER Santos (variante) |
| SSZN | 1.327 | DACHSER Santos NYC |
| SS12 | 1.302 | DACHSER Santos (variante) |
| SSZB | 844 | DACHSER Santos Brasil |
| SS11, SSZA, SSZL, SS06 | < 10 | Outras variantes |

### Prefixos com Barra (`/`):
| Formato | Exemplo | Descrição |
|---------|---------|-----------|
| SSZ/HAM/... | SSZ/HAM/1175322 | Santos → Hamburgo |
| ITJ/NAV/... | ITJ/NAV/02621 | Itajaí → Navegantes |

### Prefixos Puramente Numéricos:
| Padrão | Registros | Descrição |
|--------|-----------|-----------|
| 721274... | 6.455 | Booking number (sem SCAC) |
| 265249... | 3.041 | Booking number |
| 254608... | 1.755 | Booking number |
| (+ ~20 outros) | ~15.000+ | Variados |

---

## Alterações

### 1. Expandir constantes em `shippingLineMapping.ts`

**Arquivo:** `src/lib/shippingLineMapping.ts`

Adicionar novas constantes:

```typescript
// Prefixos LCL / Consolidadores DACHSER (variantes SSZ)
export const LCL_PREFIXES: { prefix: string; label: string }[] = [
  // Prefixos padrão
  { prefix: 'GLNL', label: 'DACHSER Netherlands' },
  { prefix: 'GLSL', label: 'DACHSER Sea Logistics' },
  { prefix: 'GLDL', label: 'DACHSER Logistics' },
  { prefix: 'BRSA', label: 'DACHSER Brasil' },
  { prefix: 'DACS', label: 'DACHSER Consolidação' },
  { prefix: 'BRAN', label: 'Brasil Consolidador' },
  // Variantes SSZ
  { prefix: 'SSZ', label: 'DACHSER Santos (base)' },
  { prefix: 'SSZ1', label: 'DACHSER Santos + Ano' },
  { prefix: 'SSZN', label: 'DACHSER Santos NYC' },
  { prefix: 'SSZB', label: 'DACHSER Santos Brasil' },
  { prefix: 'SSZA', label: 'DACHSER Santos Variante A' },
  { prefix: 'SSZL', label: 'DACHSER Santos Variante L' },
  { prefix: 'SS01', label: 'DACHSER Santos (SS01)' },
  { prefix: 'SS06', label: 'DACHSER Santos (SS06)' },
  { prefix: 'SS11', label: 'DACHSER Santos (SS11)' },
  { prefix: 'SS12', label: 'DACHSER Santos (SS12)' },
];

// Prefixos com formato de rota (ORIGEM/DESTINO/...)
export const ROUTE_FORMAT_PREFIXES: { prefix: string; label: string }[] = [
  { prefix: 'SSZ/HAM', label: 'Santos → Hamburgo' },
  { prefix: 'SSZ/RTM', label: 'Santos → Rotterdam' },
  { prefix: 'ITJ/NAV', label: 'Itajaí → Navegantes' },
  { prefix: 'PNG/SSZ', label: 'Paranaguá → Santos' },
];

// Descrição de MBLs numéricos (não SCAC)
export const NUMERIC_MBL_INFO = {
  description: 'MBLs puramente numéricos',
  note: 'Estes MBLs não seguem o padrão SCAC (4 letras + números). São tipicamente booking numbers ou referências internas de consolidadores.',
  examples: ['721274713', '265249042', '94263959'],
};
```

### 2. Atualizar o Modal de Armadores

**Arquivo:** `src/pages/ContainerTracking.tsx`

Expandir o modal para incluir:
- Seção de prefixos LCL (já existente, expandir com variantes SSZ)
- Nova seção "Formatos Especiais" para prefixos com barra
- Nova seção informativa sobre MBLs numéricos

**Estrutura visual:**

```text
┌────────────────────────────────────────────────────────────────┐
│  🚢 Armadores Mapeados (API)                                    │
│  [tabela existente - 13 armadores]                             │
├────────────────────────────────────────────────────────────────┤
│  📦 Prefixos LCL / Consolidadores                              │
│  GLNL, GLSL, GLDL, BRSA, SSZ, SSZ1, SSZN, SS01, SS12...       │
├────────────────────────────────────────────────────────────────┤
│  🔀 Formatos com Rota (ORIGEM/DESTINO)                         │
│  SSZ/HAM → Santos-Hamburgo                                     │
│  ITJ/NAV → Itajaí-Navegantes                                   │
├────────────────────────────────────────────────────────────────┤
│  🔢 MBLs Numéricos                                             │
│  ⚠️ MBLs puramente numéricos não identificam armador.          │
│  Ex: 721274713, 265249042                                      │
│  São booking numbers de consolidadores.                        │
└────────────────────────────────────────────────────────────────┘
```

---

## Detalhes Técnicos

### Importar novas constantes:
```typescript
import { 
  LCL_PREFIXES, 
  ROUTE_FORMAT_PREFIXES, 
  NUMERIC_MBL_INFO,
  // ... existentes
} from "@/lib/shippingLineMapping";
```

### Ícones a usar:
- 🚢 Ship (existente) - Armadores
- 📦 Package (existente) - LCL
- 🔀 ArrowLeftRight ou Shuffle - Rotas
- 🔢 Hash ou ListOrdered - Numéricos

### Cores por seção:
- Armadores: Verde (existente)
- LCL: Laranja (existente)
- Rotas: Azul (`bg-blue-500/20 text-blue-400`)
- Numéricos: Cinza/Amarelo (`bg-yellow-500/20 text-yellow-400`)

---

## Resumo de Arquivos

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/shippingLineMapping.ts` | Expandir `LCL_PREFIXES`, adicionar `ROUTE_FORMAT_PREFIXES` e `NUMERIC_MBL_INFO` |
| `src/pages/ContainerTracking.tsx` | Adicionar novas seções no modal de Armadores Mapeados |
| `supabase/functions/_shared/shippingLineMapping.ts` | Sincronizar alterações (se necessário) |

---

## Benefícios

1. **Transparência**: Usuários entendem por que certos MBLs não têm armador identificado
2. **Documentação**: Cataloga os diferentes formatos de MBL usados internamente
3. **Manutenção**: Facilita identificar novos padrões quando surgirem
