# Histórico de envios da régua por e-mail no Olimpo

## Objetivo

No `ClientDetailSheet` (Olimpo › Cobrança › abrir cliente), a seção **"E-mails cadastrados"** mostra hoje apenas a lista de e-mails. Vou expandi-la para mostrar, **por e-mail**, o histórico real de disparos da régua a partir de `ai_agente.t_financeiro_email_log`:

- Estágio (`PRE`, `D1`, `D7`, …) — coluna `stage`
- Data/hora do envio — `sent_at`
- Status — `success = 1` ✓ Enviado, `success = 0` ✗ Falhou (com `error_message` em tooltip)
- Assunto — `subject` (apenas em tooltip, para não poluir)

Filtragem por **CNPJ + e-mail**, ordenado por `sent_at DESC`, **últimos 10 envios** por e-mail (suficiente para ver tendência sem virar lista infinita; se precisar de mais é caso para tela própria).

## UI

Em cada `<li>` da lista de e-mails, abaixo do nome/e-mail, renderizar uma linha de "pílulas" — uma por envio recente — no formato:

```
[PRE · 08/06 21:33 ✓]  [D1 · 09/06 21:34 ✓]  [D7 · 15/06 21:34 ✗]
```

- Verde para `success=1`, vermelho para `success=0`.
- Tooltip do badge com erro mostra `error_message` e `subject`.
- Se não houver envios: texto cinza pequeno "Sem envios registrados".
- Loading: skeleton de 3 pílulas enquanto carrega.

Sem alteração no resto da sheet (faturas, observação, aging continuam iguais).

## Backend — novo endpoint no `mariadb-proxy`

Adicionar `action: "get_olimpo_email_logs_by_cnpj"` em `supabase/functions/mariadb-proxy/index.ts`:

- Input: `{ cnpj: string }` (CNPJ já limpo, só dígitos — frontend hoje envia `cnpjClean`).
- Query (banco financeiro):

```sql
SELECT
  id,
  stage,
  email_to,
  subject,
  sent_at,
  success,
  error_message
FROM ai_agente.t_financeiro_email_log
WHERE REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', '')
      COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
ORDER BY sent_at DESC
LIMIT 200
```

- No handler, agrupar por `email_to` (normalizado em lowercase/trim) e devolver:
  ```json
  {
    "success": true,
    "logsByEmail": {
      "lgasparino@z3us.ai": [
        { "stage": "PRE", "sent_at": "...", "success": 1, "subject": "...", "error_message": null },
        ...
      ]
    }
  }
  ```
  Limitar a 10 entradas por e-mail no servidor (`logsByEmail[email] = arr.slice(0, 10)`).

`stage`, `success`, `error_message` e `subject` saem direto do `t_financeiro_email_log` (conforme print enviado).

## Frontend — `src/components/olimpo/ClientDetailSheet.tsx`

1. Novo estado: `const [emailLogs, setEmailLogs] = useState<Record<string, Record<string, EmailLog[]>>>({})` — chave externa = `cnpjClean`, interna = `email_to`.
2. Carregar logs **junto com os contatos** dentro do `useEffect` existente que já chama `get_client_cnpj_detail_cr` (linhas ~120–140). Para cada CNPJ retornado, disparar `get_olimpo_email_logs_by_cnpj` em paralelo (`Promise.all`) e popular `emailLogs`.
3. Na renderização (linhas ~310–317), abaixo de cada `<a mailto>`, adicionar componente inline que lê `emailLogs[cnpj.cnpjClean]?.[c.email_contato.toLowerCase().trim()]` e renderiza as pílulas.
4. Formatador de data: reusar `Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })`.

Sem novo arquivo — manter o componente das pílulas inline no `ClientDetailSheet.tsx` (são ~25 linhas de JSX).

## Fora do escopo

- Página dedicada de histórico completo (paginado).
- Reenvio manual a partir da sheet.
- Mudanças em `OlimpoCobranca.tsx` (tabela principal).
- Mudanças no contador "ativo/inativo" — o usuário pediu para *substituir* a informação por algo mais rico; o status binário (ativo) deixa de existir nessa seção.

## Validação

1. Abrir Olimpo › Cobrança › clicar num cliente que tem envios no print (ex.: GEMU 77.152.338/0001-93) e conferir as pílulas com `PRE 08/06 21:33 ✓` e `D1 08/06 21:34 ✓`.
2. Verificar tooltip com `subject` no hover.
3. Cliente sem envios mostra "Sem envios registrados".
4. Forçar `success=0` numa linha de teste e conferir badge vermelho + tooltip com `error_message`.
