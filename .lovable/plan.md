

## Diagnóstico
Na tela `/air/tracking-aereo` **não existe** detecção nem visualização de transporte terrestre. A lógica de detecção `is_ground_transport` (sufixo `-T`, `digit+X`, `digit+D` em códigos de voo, varredura de `last_flight` e `timeline_json`) existe **apenas** no `fetch-status-aereo` (dashboard `/air/tracking`), e o ícone de avião na coluna Rastreio é fixo — nunca vira caminhão.

Confirmações:
- `fetch-tracking-aereo/index.ts` não menciona `terrestre`/`ground`/`truck`/`-T`.
- `TrackingAereo.tsx` (linhas 797–897) renderiza sempre `<Plane />` na progress bar e badges fixos (Conexão/Destino/UNK), sem ramo terrestre.
- O endpoint `fetch-status-aereo` (linhas 1273–1325) já tem `isGroundFlight()` testado e em produção — fonte canônica para reaproveitar.

## Proposta (cirúrgica)

### 1. Backend — `supabase/functions/fetch-tracking-aereo/index.ts`
Antes do `const normalized = {...}` (no mesmo bloco onde foi adicionada a extração de `conexao`), adicionar:

```ts
// Detect ground transport from flight codes (mirrors fetch-status-aereo)
function isGroundFlight(val: string): boolean {
  const clean = (val || "").trim().replace(/,\s*$/, '');
  if (!clean) return false;
  // Patterns: "LA 5491-T", "AF0677D", "M3 8516X"
  if (/[-\s]T$/i.test(clean)) return true;
  if (/\d[XD]$/i.test(clean)) return true;
  return false;
}

let isGroundTransport = false;
const lastFlightRaw = String(row.LAST_FLIGHT || row.last_flight || "");
if (isGroundFlight(lastFlightRaw)) isGroundTransport = true;
if (!isGroundTransport && timeline?.length) {
  for (const ev of timeline) {
    const candidates = [
      ev.flight, ev.flight_number, ev.last_flight,
      ev.description, ev.event_description, ev.location
    ].filter(Boolean);
    for (const c of candidates) {
      // extract tokens that look like flight codes and test
      const tokens = String(c).match(/\b[A-Z0-9]{2,4}\s?\d{2,5}[A-Z\-T]*\b/g) || [];
      if (tokens.some(isGroundFlight)) { isGroundTransport = true; break; }
    }
    if (isGroundTransport) break;
  }
}
```

Adicionar `is_ground_transport: isGroundTransport,` no objeto `normalized`.

### 2. Frontend — `src/pages/air/TrackingAereo.tsx`

**a. Tipo**: Adicionar `is_ground_transport?: boolean` na interface do AWB (~linha 320).

**b. Ícone na progress bar (linha 876)**: Trocar `Plane` por `Truck` quando `awb.is_ground_transport === true`. Manter mesma cor/sombra/posicionamento. Importar `Truck` do `lucide-react`.

```tsx
{awb.is_ground_transport ? (
  <Truck className="w-4 h-4" style={{ color: planeColor, fill: planeColor, filter: `drop-shadow(0 0 4px ${shadowColor})` }} />
) : (
  <Plane className="w-4 h-4" style={{ transform: "rotate(90deg)", color: planeColor, ... }} />
)}
```

**c. Badge na coluna Rota (linhas 847–859)**: Após o destino, adicionar pílula discreta quando terrestre:
```tsx
{awb.is_ground_transport && (
  <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.6rem] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
    <Truck className="w-2.5 h-2.5" /> RFS
  </span>
)}
```

**d. Tooltip do ícone (linhas 879–882)**: incluir "Transporte Terrestre" quando aplicável.

### 3. Memória persistente
Atualizar `mem://air/tracking/aereo-monitoring-spec` adicionando:
> "Detecção de transporte terrestre: `fetch-tracking-aereo` espelha a função `isGroundFlight` de `fetch-status-aereo` (sufixos `-T`, `dígitoX`, `dígitoD` em códigos de voo). Resultado vai no campo `is_ground_transport` do payload. UI substitui o ícone `<Plane>` por `<Truck>` na coluna Rastreio e exibe pílula 'RFS' (âmbar) ao lado do destino na coluna Rota."

## Arquivos alterados
- `supabase/functions/fetch-tracking-aereo/index.ts` — ~25 linhas (função + detecção + 1 campo no `normalized`).
- `src/pages/air/TrackingAereo.tsx` — import `Truck`, 1 campo no tipo, ~10 linhas no JSX (ícone condicional + badge RFS + tooltip).
- `mem://air/tracking/aereo-monitoring-spec` — atualização.

## Validação pós-deploy
1. Recarregar `/air/tracking-aereo`.
2. Localizar AWBs cuja timeline contém códigos como `LA 5491-T`, `AF0677D`, `M3 8516X` → ícone caminhão na barra + pílula "RFS" na coluna Rota.
3. AWBs sem voo terrestre devem manter ícone avião (sem regressão).
4. Conferir tooltip do ícone exibindo "Transporte Terrestre" quando aplicável.

## Riscos e mitigações
- **Falso positivo**: regex `\b[A-Z0-9]{2,4}\s?\d{2,5}[A-Z\-T]*\b` extrai tokens tipo voo antes de testar; `isGroundFlight` exige sufixo específico — não dispara em códigos comuns como `LH8284` ou `AF447`.
- **Sem alteração de schema**: campo é derivado em runtime, não vai pro banco.
- **Performance**: O(n) sobre timeline já carregada, sem queries extras.
- **Reaproveitamento**: a função-fonte (`fetch-status-aereo`) já está validada em produção há semanas — comportamento consistente entre as duas telas.

