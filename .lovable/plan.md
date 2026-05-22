## Objetivo
Exibir os e-mails cadastrados (de `t_dados_financeiro_contatos`) dentro do detalhamento por CNPJ no painel "Detalhamento por CNPJ" da página `/olimpo/cobranca`.

## Mudanças

### 1. Backend — `supabase/functions/mariadb-proxy/index.ts`
Na action `get_client_cnpj_detail_cr` (linha ~17367), após obter os CNPJs, fazer uma query adicional em `dados_dachser.t_dados_financeiro_contatos` para buscar contatos por CNPJ (match pelo CNPJ limpo — sem `.`, `/`, `-`):

```sql
SELECT
  REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') AS cnpj_clean,
  nome_contato,
  email_contato
FROM dados_dachser.t_dados_financeiro_contatos
WHERE REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') IN (?, ?, ...)
  AND email_contato IS NOT NULL AND email_contato <> ''
```

Retornar `contatos: [{ cnpjClean, nome_contato, email_contato }]` no response, ao lado de `data` e `observacoes`. Um CNPJ pode ter múltiplos contatos — retornar todos.

### 2. Frontend — `src/components/olimpo/ClientDetailSheet.tsx`
- Adicionar tipo `Contato { cnpj: string; nome_contato: string|null; email_contato: string }`.
- Novo state `contatos: Record<string, Contato[]>` (mapa cnpjClean → lista).
- Em `fetchDetail`, popular `contatos` a partir de `data.contatos` (agrupando por `cnpjClean`).
- No card de cada CNPJ, abaixo de "Cond. Pagamento / Vendedor" e acima de "Observação", renderizar uma seção "E-mails cadastrados":
  - Se houver contatos: lista com ícone `Mail`, mostrando `nome_contato — email_contato` (cada um como `mailto:` link, estilo `text-xs`).
  - Se vazio: texto sutil "Nenhum e-mail cadastrado".

## Fora de escopo
- Edição/cadastro de contatos.
- Mudanças no envio de e-mail automático ou no Excel de aging.
