
# Plano: Mapeamento Centralizado de Prefixos MBL para Identificação de Armadores

## Objetivo
Criar um mapeamento centralizado e completo de prefixos MBL (Bill of Lading) para identificar automaticamente o armador (shipping line) responsável pelo transporte marítimo.

## Situação Atual

O projeto possui **4 mapeamentos dispersos** em diferentes arquivos:

| Local | Escopo | Problema |
|-------|--------|----------|
| `olimpo-proxy/index.ts` | MBL + Container prefixes | Duplicado em múltiplas funções |
| `demurrage-import-jsoncargo/index.ts` | MBL prefixes (array) | Incompleto |
| `fetch-sea-master-dados-stats/index.ts` | SCAC para nomes | Apenas estatísticas |
| `ImportMblDialog.tsx` | Frontend simplificado | Muito básico |

## Implementação

### Fase 1: Criar Arquivo Central de Mapeamentos

**Arquivo:** `src/lib/shippingLineMapping.ts`

Estrutura do mapeamento unificado:

```text
+------------------------+
|  ShippingLineMapping   |
+------------------------+
| - MBL_PREFIX_MAP       |  -> Prefixos MBL para código do armador
| - CONTAINER_PREFIX_MAP |  -> Prefixos container para código do armador  
| - SHIPPING_LINE_NAMES  |  -> Código para nome legível
| - SHIPPING_LINE_COLORS |  -> Cores para UI (badges)
+------------------------+
| + detectCarrierFromMbl |  -> Função de detecção automática
| + getShippingLineName  |  -> Obter nome legível
| + getShippingLineColor |  -> Obter cor do badge
| + isValidMblFormat     |  -> Validar formato MBL
+------------------------+
```

**Prefixos MBL a serem mapeados** (baseado em dados reais do banco):

```text
ARMADOR                  | PREFIXOS MBL
-------------------------|------------------------------------------
Hapag-Lloyd              | HLCU, HLXU, HLBU, HBG, SAHL, HLC
MSC                      | MSCU, MEDU, MSCM, MSDU, MSCB, MSCR
Maersk                   | MAEU, MRKU, MSKU, PONU, SUDU, HASL, HSUD
Hamburg Sud (Maersk)     | SUDU, HASL, HSUD
CMA CGM                  | CMAU, CGMU, CMDU, CXDU, APLU, APHU, ANLU
ONE                      | ONEY, ONEU, NYKU, MOLU, KKFU, MOAU
Evergreen                | EISU, EITU, EGSU, EGHU, EMCU, EGLV
COSCO/OOCL               | COSU, CSNU, CBHU, OOLU, CSLU, CCLU
Yang Ming                | YMLU, YMMU, YMPU
HMM                      | HDMU, HMMU, HMCU, KMTU
ZIM                      | ZIMU, ZCSU
PIL                      | PCIU, PILU
Wan Hai                  | WHLU, WANU
Seaboard                 | SEAU
Crowley                  | CROU, CLHU
Arkas                    | ARKU
Turkon                   | TRKU
Grimaldi                 | GRIU
SM Line                  | SMLM
Transroll                | TRHU
```

**Prefixos internos DACHSER** (não são armadores):

```text
GLNL, GLSL, GLDL, BRSA, SSZ
```

### Fase 2: Criar Tipo TypeScript para Armadores

**Arquivo:** `src/types/sea.ts` (adicionar ao existente)

```typescript
export type ShippingLineCode = 
  | 'HAPAG_LLOYD' | 'MSC' | 'MAERSK' | 'CMA_CGM' 
  | 'ONE' | 'EVERGREEN' | 'COSCO' | 'YANG_MING' 
  | 'HMM' | 'ZIM' | 'PIL' | 'WAN_HAI' 
  | 'SEABOARD' | 'CROWLEY' | 'ARKAS' | 'TURKON' 
  | 'GRIMALDI' | 'SM_LINE' | 'TRANSROLL' | 'UNKNOWN';

export interface ShippingLineInfo {
  code: ShippingLineCode;
  name: string;
  country: string;
  color: string;
  apiSupported: boolean; // Se tem integração com API de tracking
}
```

### Fase 3: Implementar Funções Utilitárias

```typescript
// Detecção automática de armador pelo MBL
export function detectCarrierFromMbl(mbl: string): ShippingLineInfo {
  const upper = mbl.toUpperCase().trim();
  
  // Tentar prefixos de 4 caracteres primeiro, depois 3
  for (const length of [4, 3]) {
    const prefix = upper.substring(0, length);
    if (MBL_PREFIX_MAP[prefix]) {
      return getShippingLineInfo(MBL_PREFIX_MAP[prefix]);
    }
  }
  
  return getShippingLineInfo('UNKNOWN');
}

// Verificar se MBL tem formato válido de armador
export function isKnownCarrierMbl(mbl: string): boolean {
  const info = detectCarrierFromMbl(mbl);
  return info.code !== 'UNKNOWN';
}

// Obter lista de armadores com suporte a tracking API
export function getTrackableCarriers(): ShippingLineInfo[] {
  return Object.values(SHIPPING_LINE_INFO)
    .filter(info => info.apiSupported);
}
```

### Fase 4: Atualizar Edge Functions para Usar Mapeamento Central

**Arquivos a modificar:**
- `supabase/functions/olimpo-proxy/index.ts`
- `supabase/functions/demurrage-import-jsoncargo/index.ts`
- `supabase/functions/fetch-sea-master-dados-stats/index.ts`

Como edge functions não podem importar de `src/`, o mapeamento será duplicado em:
- `supabase/functions/_shared/shippingLineMapping.ts`

### Fase 5: Atualizar Componentes Frontend

**Arquivos a modificar:**
- `src/components/demurrage/ImportMblDialog.tsx` - Usar novo utilitário
- `src/pages/ContainerTracking.tsx` - Exibir badge com cor do armador

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/lib/shippingLineMapping.ts` | Criar | Mapeamento central para frontend |
| `supabase/functions/_shared/shippingLineMapping.ts` | Criar | Mapeamento para edge functions |
| `src/types/sea.ts` | Modificar | Adicionar tipos de armadores |
| `src/components/demurrage/ImportMblDialog.tsx` | Modificar | Usar novo utilitário |
| `supabase/functions/olimpo-proxy/index.ts` | Modificar | Importar mapeamento central |
| `supabase/functions/demurrage-import-jsoncargo/index.ts` | Modificar | Importar mapeamento central |

## Resultado Esperado

1. **Mapeamento único e centralizado** de 50+ prefixos MBL
2. **Função `detectCarrierFromMbl()`** disponível em todo o projeto
3. **Tipos TypeScript** para armadores com autocompletar
4. **Cores consistentes** para badges de armadores na UI
5. **Flag `apiSupported`** para identificar armadores com tracking disponível
6. **Prefixos internos DACHSER** ignorados automaticamente

## Armadores com API de Tracking Suportada

| Armador | Integração | Status |
|---------|------------|--------|
| Hapag-Lloyd | `HAPAG_CLIENT_ID` + `HAPAG_API_KEY` | Ativa |
| COSCO | Planejada | Pendente |
| MSC | Via JSONCARGO | Parcial |
| Maersk | Via JSONCARGO | Parcial |
