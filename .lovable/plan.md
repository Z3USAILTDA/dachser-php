## Problema

No card "Último Registro" em `/olimpo/cobranca` aparece `09/06/2026, 21:00:00` quando o `MAX(datavalidade)` da base é `10/06/2026`.

Causa: o valor `data.lastUpdate` chega como `2026-06-10T00:00:00Z` (a coluna `datavalidade` é DATE; o driver/serializador adiciona `Z`). O código atual faz:

```ts
new Date(data.lastUpdate).toLocaleString("pt-BR")
```

Isso interpreta a string como UTC e converte para São Paulo (UTC-3), gerando `09/06/2026 21:00:00`.

## Correção (cirúrgica, somente UI)

Arquivo: `src/pages/olimpo/OlimpoCobranca.tsx`, linha 698.

Trocar:

```tsx
value={data?.lastUpdate ? new Date(data.lastUpdate).toLocaleString("pt-BR") : "—"}
```

por uma formatação date-only que extrai apenas `YYYY-MM-DD` antes de formatar (igual à abordagem já usada em `ReguaCobranca.tsx`):

```tsx
value={
  data?.lastUpdate
    ? (() => {
        const ymd = String(data.lastUpdate).slice(0, 10); // "YYYY-MM-DD"
        const [y, m, d] = ymd.split("-");
        return d && m && y ? `${d}/${m}/${y}` : "—";
      })()
    : "—"
}
```

Resultado: exibirá `10/06/2026` (sem hora), refletindo exatamente a `datavalidade` mais recente retornada pelo backend.

## Fora de escopo

- Não alterar backend, `mariadb-proxy`, views, RLS, banco ou autenticação.
- Não alterar outras telas (Régua já formata corretamente como data).
- Sem mudanças em tipos, fluxo de voucher ou esteira.

## Validação

1. Abrir `/olimpo/cobranca`.
2. Conferir card "Último Registro" → `10/06/2026` (sem hora).
3. Conferir que os demais cards/tabelas continuam carregando normalmente (nenhuma outra linha foi tocada).
