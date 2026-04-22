

## Diagnóstico
O usuário está certo: na coluna `LAST_FLIGHT` o crawler grava o número do voo **sem sufixo** (ex.: `LA 5462`), mas dentro de `timeline_json` o evento exibe o código completo (ex.: `LA 5462-T`). Hoje a detecção:

1. Testa `LAST_FLIGHT` → falha (sem sufixo).
2. Varre `timeline.flightFields` (`Flight`, `flight`, `voo`, `flight_number`, etc.) → também falha porque, nesse caso, o código completo aparece **dentro de campos textuais como `description`, `details` ou `event_description`**, ou em chaves não listadas (`flight_no`, `flight_info`, `awb_flight`).
3. Roda `extractFlightsFromText` em uma lista fixa de campos, mas se a chave real for outra (ex.: subobjeto `flight_data`, ou chave em maiúsculas), o sufixo escapa.

## Causa raiz
- Allowlist de chaves de timeline está **fechada demais**.
- `extractFlightsFromText` não é aplicado de forma exaustiva — só varre uma lista fixa de campos textuais.
- Não há fallback para **serializar a timeline inteira** e procurar o padrão `XX 0000-T` nela.

## Correção (cirúrgica, em `fetch-tracking-aereo/index.ts` linhas 791–840)

### 1. Fallback "varredura total" da timeline serializada
Após o loop atual de campos conhecidos, se `isGroundTransport` ainda for `false` e existir `timeline?.length`, aplicar:

```ts
if (!isGroundTransport && timeline?.length) {
  try {
    const haystack = JSON.stringify(timeline);
    const flights = extractFlightsFromText(haystack);
    if (flights.some(isGroundFlight)) isGroundTransport = true;
    // Reforço final: regex direto sobre o JSON completo
    if (!isGroundTransport && /\b[A-Z0-9]{2,4}\s?\d{2,5}-T\b/i.test(haystack)) {
      isGroundTransport = true;
    }
  } catch (_) {}
}
```

Isso garante que, independentemente de em qual chave o crawler tenha gravado o `LA 5462-T` (`description`, `flight_info.code`, `raw_event`, etc.), o sufixo será detectado.

### 2. Fallback nas descrições agregadas do SQL (`desc0..desc3`)
A query principal já extrai `desc0..desc3` e `code0..code3` da timeline. Aplicar `extractFlightsFromText` + `isGroundFlight` também sobre esses campos diretos da `row`, antes de cair na timeline parseada. Isso pega casos onde `JSON.parse` da `TIMELINE` falha mas os `desc*` vieram corretamente.

```ts
if (!isGroundTransport) {
  for (const f of ['desc0','desc1','desc2','desc3']) {
    const txt = String((row as any)[f] || '');
    if (!txt) continue;
    const flights = extractFlightsFromText(txt);
    if (flights.some(isGroundFlight) || /\b[A-Z0-9]{2,4}\s?\d{2,5}-T\b/i.test(txt)) {
      isGroundTransport = true;
      break;
    }
  }
}
```

### 3. Memória
Atualizar `mem://air/tracking/aereo-monitoring-spec` com a regra:
> "Detecção de RFS deve usar varredura total: (a) `LAST_FLIGHT` cru, (b) campos conhecidos da timeline, (c) `desc0..desc3` do SQL, (d) `JSON.stringify(timeline)` completo. O crawler frequentemente grava `LAST_FLIGHT` sem sufixo (ex.: `LA 5462`) enquanto a timeline mantém `LA 5462-T` — a detecção precisa do fallback total."

## Arquivos alterados
- `supabase/functions/fetch-tracking-aereo/index.ts` — adicionar dois fallbacks (~15 linhas) entre as linhas 840 e 842.
- `mem://air/tracking/aereo-monitoring-spec` — regra persistente.

## Validação
1. Recarregar `/air/tracking-aereo`.
2. Localizar o processo com `LA 5462-T`.
3. Confirmar ícone 🚚 e badge **RFS** na coluna Rastreio.
4. Verificar nos logs do `fetch-tracking-aereo` que não há regressão para AWBs aéreas puras (icone de avião continua para `LH 8284`, `AF 447`, etc.).
5. Spot-check em 2-3 outros processos terrestres já conhecidos.

## Riscos
- **Falso positivo via JSON serializado**: minimizado porque `isGroundFlight` exige sufixo `-T` ou `X/D` específico após dígitos. Códigos comuns (`LH8284`) não disparam.
- **Performance**: `JSON.stringify` por linha em até ~750 rows → custo desprezível (sub-ms cada).
- **Sem alteração de schema** nem de SQL — apenas pós-processamento no Edge Function.

