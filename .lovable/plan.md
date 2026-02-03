
# Plano: Adicionar Prefixos LCL Não Identificados no Modal de Armadores Mapeados

## Resumo
Adicionar uma seção no modal "Armadores Mapeados" da tela de Monitoramento Marítimo (`/sea/tracking`) para exibir os prefixos de MBL que não conseguimos identificar como armadores conhecidos. Esses são tipicamente cargas LCL (Less than Container Load) ou consolidadores.

---

## Contexto Técnico

### Situação Atual
- O modal "Armadores Mapeados" (`ContainerTracking.tsx`, linhas 2279-2338) exibe apenas os 13 armadores com integração de API via `getTrackableCarriers()`
- Os prefixos internos DACHSER já estão definidos em `INTERNAL_PREFIXES`: `['GLNL', 'GLSL', 'GLDL', 'BRSA', 'SSZ']`
- A função `detectCarrierFromMbl()` retorna `UNKNOWN` quando não reconhece o prefixo

### Objetivo
Criar uma seção adicional no modal mostrando os prefixos que retornam `UNKNOWN` quando processados pela função de detecção - tipicamente identificados como cargas LCL/consolidadores.

---

## Alterações

### 1. Adicionar constante com prefixos LCL conhecidos

**Arquivo:** `src/lib/shippingLineMapping.ts`

Adicionar uma nova constante exportada com os prefixos que são conhecidos como LCL/consolidadores (baseado nos `INTERNAL_PREFIXES` existentes mais outros comuns):

```typescript
// Prefixos LCL / Consolidadores conhecidos (não são armadores diretos)
export const LCL_PREFIXES: { prefix: string; label: string }[] = [
  { prefix: 'GLNL', label: 'DACHSER Netherlands' },
  { prefix: 'GLSL', label: 'DACHSER Sea Logistics' },
  { prefix: 'GLDL', label: 'DACHSER Logistics' },
  { prefix: 'BRSA', label: 'DACHSER Brasil' },
  { prefix: 'SSZ', label: 'DACHSER Santos' },
  { prefix: 'DACS', label: 'DACHSER Consolidação' },
  { prefix: 'BRAN', label: 'Brasil Consolidador' },
];
```

---

### 2. Atualizar o Modal de Armadores Mapeados

**Arquivo:** `src/pages/ContainerTracking.tsx` (linhas 2279-2338)

Modificar o modal para incluir uma segunda tabela/seção mostrando os prefixos LCL:

**Alterações necessárias:**

1. Importar `LCL_PREFIXES` do mapeamento
2. Adicionar uma nova seção abaixo da tabela de armadores:
   - Título: "Prefixos LCL / Consolidadores"
   - Descrição: "Prefixos não mapeados para armadores específicos"
3. Exibir em formato de tabela com:
   - Coluna "Prefixo"
   - Coluna "Descrição"

**Estrutura visual proposta:**

```text
┌────────────────────────────────────────────────────────────┐
│  🚢 Armadores Mapeados                                      │
│  Lista de armadores com integração de rastreamento via API  │
├────────────────────────────────────────────────────────────┤
│  Prefixo    │  Armador              │  País                 │
│  HLCU       │  Hapag-Lloyd          │  Germany              │
│  MSCU       │  MSC                  │  Switzerland          │
│  ...        │  ...                  │  ...                  │
├────────────────────────────────────────────────────────────┤
│  📦 Prefixos LCL / Consolidadores                           │
│  Prefixos não mapeados para armadores específicos           │
├────────────────────────────────────────────────────────────┤
│  Prefixo    │  Descrição                                    │
│  GLNL       │  DACHSER Netherlands                          │
│  GLSL       │  DACHSER Sea Logistics                        │
│  BRSA       │  DACHSER Brasil                               │
│  SSZ        │  DACHSER Santos                               │
│  ...        │  ...                                          │
├────────────────────────────────────────────────────────────┤
│  13 armadores com integração ativa | 5 prefixos LCL         │
└────────────────────────────────────────────────────────────┘
```

---

## Detalhes de Implementação

### Cores e Estilo
- Seção de armadores: mantém o estilo atual (ícone 🚢 verde)
- Nova seção LCL: usar ícone 📦 (Package) em cor laranja ou amarelo
- Badges de prefixos LCL: `bg-orange-500/20 text-orange-400`

### Separação Visual
- Adicionar um `Separator` entre as duas tabelas
- Subtítulo com estilo diferenciado para a seção LCL

### Footer Atualizado
- Mostrar contagem de ambos: "13 armadores | 7 prefixos LCL"

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/shippingLineMapping.ts` | Adicionar `LCL_PREFIXES` constante exportada |
| `src/pages/ContainerTracking.tsx` | Adicionar seção LCL no modal de Armadores (linhas 2279-2338) |

---

## Prefixos LCL a Incluir

Baseado na constante `INTERNAL_PREFIXES` existente e padrões conhecidos:

| Prefixo | Descrição |
|---------|-----------|
| GLNL | DACHSER Netherlands |
| GLSL | DACHSER Sea Logistics |
| GLDL | DACHSER Logistics |
| BRSA | DACHSER Brasil |
| SSZ | DACHSER Santos |
| DACS | DACHSER Consolidação |
| BRAN | Brasil Consolidador |

*Nota: Esta lista pode ser expandida conforme novos prefixos forem identificados na operação.*
