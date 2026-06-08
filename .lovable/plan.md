## Objetivo

Eliminar a exceção que faz **`FAT_NF` (à vista)** cair em **D60 a partir de 45 dias**. Após a mudança, **D60 = `dias >= 60`** para todos os tipos de documento, e **D45 = `dias BETWEEN 45 AND 59`** também para todos (inclusive `FAT_NF`).

## Por que existia a exceção

Hoje o código tem dois ramos no `CASE` (`tipo_documento = 'FAT_NF'` vs demais). No ramo do FAT_NF, **D45 é pulado** e D60 começa em 45 dias — partindo da premissa de que faturas à vista deveriam ser tratadas como críticas mais cedo. Você quer remover esse comportamento e usar a régua única (PRE/D1/D7/D15/D30/D45/D60) por janelas fixas de dias, sem distinção por tipo.

## Resultado final (régua única)

| Estágio | Janela (todos os tipos) |
|---|---|
| PRE | `dias <= 0` |
| D1  | `dias = 1` |
| D7  | `7–14` |
| D15 | `15–29` |
| D30 | `30–44` |
| **D45** | **`45–59`** |
| **D60** | **`>= 60`** (cap externo `<= 120`) |

## Arquivos a alterar

Três endpoints/funções têm a mesma lógica duplicada e precisam ser ajustados juntos para não desalinhar tela × e-mails × aging:

### 1. `supabase/functions/mariadb-proxy/index.ts` — `get_regua_counts_cr` (linhas 17760–17801)

Remover o ramo `WHEN t.tipo_documento = 'FAT_NF' THEN ...` e manter **apenas** o ramo padrão (que já tem D45 = 45–59 e D60 ≥ 60). Ajustar também o filtro externo do `WHERE`: trocar
```sql
OR (t.tipo_documento <> 'FAT_NF' AND DATEDIFF(...) >= 61)
OR (t.tipo_documento = 'FAT_NF' AND DATEDIFF(...) >= 45)
```
por uma única cláusula
```sql
OR DATEDIFF(CURDATE(), t.data_vencimento) >= 45
```
(suficiente para cobrir D45 e D60 sem o split).

### 2. `supabase/functions/mariadb-proxy/index.ts` — `get_regua_stage_cr` (linhas 17819–17910)

No `CASE` interno (linhas 17869–17889), remover o ramo `WHEN t.tipo_documento='FAT_NF' THEN ...` e manter só o ramo padrão (D7/D15/D30/D45/D60 já corretos). O filtro externo `(? IN ('PRE',...,'D45') AND ... <= ?) OR ? = 'D60'` continua válido.

### 3. `supabase/functions/regua-send-emails/index.ts` (linhas ~420–436)

Trocar o builder de cláusula `D45`/`D60`:

```ts
case 'D45':
  return "DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 45 AND 59";
case 'D60':
  return "DATEDIFF(CURDATE(), t.data_vencimento) >= 60";
```

Remover também o comentário "FAT_NF antecipa em 15 dias" (linha 420) para refletir a nova regra.

## Impactos a confirmar

- **Faturas FAT_NF com 45–59 dias** que hoje aparecem/recebem e-mail em **D60** passarão a aparecer em **D45** (mesmo template, contagem e e-mail diferentes do que recebem hoje).
- **Faturas FAT_NF com ≥ 60 dias** continuam em D60 normalmente.
- Os **templates de e-mail D45 e D60** (em `regua-send-emails`) já existem e serão usados para FAT_NF também — nada a criar.
- Não há alteração de schema, view nem migration SQL: a mudança é 100% nos endpoints/edge functions.

## Validação após implementar

1. Abrir `/fin/regua` e conferir que os cards D45/D60 mudam de contagem (FAT_NF entre 45–59 saem do D60 e entram no D45).
2. Rodar `get_regua_stage_cr` para `D45` e `D60` e confirmar que nenhuma fatura aparece nos dois.
3. Disparar um envio de teste (`regua-send-emails`) em modo dry-run para D45 e D60 e conferir as faturas listadas.

## Fora do escopo

- Filtro de **disputas** (`t_fin_disputas`) — assunto separado, já discutido.
- Tornar os limites (45, 60, 120) configuráveis em tabela — não vou mexer agora.
