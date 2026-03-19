

## Plano: Melhorias na tela de Tracking Aéreo (Index.tsx)

### 1. Rota com indicação visual de conexão

**Contexto atual:** A coluna Rota exibe `{origem} → {destino}` (linha 2731-2734).

**Alteração:** Exibir `{origem} → {conexão} → {destino}` quando houver aeroporto de conexão. A sigla do meio ficará destacada (laranja pulsante) quando o AWB estiver na conexão (status `ARR - CONEXÃO`).

**Como identificar a conexão:** Os eventos da timeline contêm o campo `aeroporto`. Uma conexão é um ARR cujo aeroporto não é o destino final. Atualmente o backend já resolve `ARR - CONEXÃO` vs `ARR - DESTINO`. Precisamos que o backend também retorne o aeroporto de conexão nos dados do `fetch-status-aereo`.

**Implementação:**
- **Backend (`supabase/functions/mariadb-proxy/index.ts`):** Na action `fetch_status_aereo`, após buscar a timeline, extrair o aeroporto do primeiro evento ARR que não seja o destino — esse é o aeroporto de conexão. Retornar campo `conexao` no response de cada AWB.
- **Frontend (`src/pages/Index.tsx`):**
  - Adicionar `conexao?: string` na interface `AWBData`
  - Mapear `conexao` no `fetchStatusAereoData`
  - Na célula da coluna Rota (linha 2731), renderizar condicionalmente:
    - Sem conexão: `{origem} → {destino}`
    - Com conexão: `{origem} → {conexão (estilizada)} → {destino}`
    - Se status = `ARR - CONEXÃO`, a sigla do meio fica em laranja com animação pulse

### 2. Hierarquia IATA para desempate na timeline

**Contexto atual:** O `AwbTimelineModal.tsx` ordena eventos por `data_hora_evento` DESC (linha 109-113), sem desempate por hierarquia.

**Implementação:**
- **`src/components/air/AwbTimelineModal.tsx`:** Criar mapa de pesos IATA (BKD=1, TKG=2, ..., POD=47, MSCA=50, ..., BUP=58) e usar como critério secundário no sort: se datas iguais, evento com maior peso vem primeiro (mais recente na timeline DESC).

```typescript
const IATA_WEIGHT: Record<string, number> = {
  BKD: 1, TKG: 2, LAT: 3,
  RCS: 10, RCT: 11, DOC: 12, RFC: 13, ECC: 14, SCR: 15,
  PRE: 20, MAN: 21, RDP: 22, DEP: 23,
  TFD: 30, TRM: 31, TRA: 32,
  ARR: 40, RCF: 41, NFD: 42, AWD: 43, AWR: 44, CCD: 45, DLV: 46, POD: 47,
  MSCA: 50, FDCA: 51, OVCD: 52, SSPD: 53, DMG: 54, DIS: 55, 'RCS-P': 56, RET: 57, BUP: 58,
};

// Sort: DESC by date, then DESC by IATA weight for same timestamp
deduped.sort((a, b) => {
  const diff = dateB - dateA;
  if (diff !== 0) return diff;
  return (IATA_WEIGHT[b.codigo_evento?.toUpperCase()] || 0) 
       - (IATA_WEIGHT[a.codigo_evento?.toUpperCase()] || 0);
});
```

### 3. Coluna de SLA por etapa

**Contexto atual:** Existe a edge function `air-dep-transition-alert` com regras: BKD >12h, RCF >6h, MAN >3h. Mas isso só envia e-mails — não há indicação visual na tabela.

**Implementação:**
- **Backend:** Na action `fetch_status_aereo`, calcular `hours_in_current_status` (diferença entre `NOW()` e `última atualização`) e retornar junto com `ultimo_status`.
- **Frontend (`src/pages/Index.tsx`):**
  - Adicionar `hours_in_status?: number` na `AWBData`
  - Adicionar coluna "SLA" na tabela (entre "Situação" e "Nome Analista")
  - Lógica de exibição:
    - **Verde (OK):** BKD <12h, RCF <6h, MAN <3h, outros status
    - **Amarelo (Atenção):** ≥70% do threshold (BKD ≥8.4h, RCF ≥4.2h, MAN ≥2.1h)
    - **Vermelho (Crítico):** Acima do threshold
    - **Badge:** Exibir tempo formatado ("2h30", "14h") com ícone de relógio e cor correspondente
  - Para status pós-DEP (DEP, ARR, RCF, NFD, DLV etc.) mostrar "✓" verde (sem SLA aplicável)

**Arquivos modificados:**
1. `supabase/functions/mariadb-proxy/index.ts` — retornar `conexao` e `hours_in_status`
2. `src/pages/Index.tsx` — interface AWBData, coluna Rota, coluna SLA
3. `src/components/air/AwbTimelineModal.tsx` — hierarquia IATA no sort

