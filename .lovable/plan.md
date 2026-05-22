## Problema
No card "Detalhamento por CNPJ" os e-mails aparecem duplicados (ex.: ANA PAULA CALEGHINI listada 2x, LUANA FERREIRA 2x, etc.). A tabela `dados_dachser.t_dados_financeiro_contatos` tem múltiplas linhas com o mesmo `email_contato` para o mesmo CNPJ, e a query atual retorna todas.

## Correção

### Backend — `supabase/functions/mariadb-proxy/index.ts` (action `get_client_cnpj_detail_cr`)
Alterar a query de contatos para deduplicar por `(cnpj, email_contato)`:

```sql
SELECT
  REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') AS cnpj_clean,
  MAX(nome_contato) AS nome_contato,
  email_contato
FROM dados_dachser.t_dados_financeiro_contatos
WHERE REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') IN (?, ?, ...)
  AND email_contato IS NOT NULL AND email_contato <> ''
GROUP BY cnpj_clean, LOWER(TRIM(email_contato))
ORDER BY cnpj_clean, email_contato
```

Isso garante uma linha por par CNPJ + e-mail (case/whitespace-insensitive), preservando o nome do contato.

### Frontend
Sem mudanças — já agrupa por `cnpjClean` e renderiza a lista que o backend devolver.

## Fora de escopo
- Limpeza dos dados duplicados no MariaDB.
- Mudanças no Excel/e-mail de aging.
