
Objetivo: fazer o envio de Aging realmente consolidar todos os CNPJs do mesmo cliente/grupo na tela `/fin/regua`, em vez de limitar o anexo ao CNPJ escolhido.

Diagnóstico
- Hoje o frontend envia apenas `cnpj`/`cnpjs` para a função `regua-send-aging`.
- No backend, a expansão é feita pela raiz do CNPJ (`substring(0, 8)` + `LIKE`), então o agrupamento está fiscal, não comercial.
- A busca de clientes da régua, porém, já trabalha com `razao_base` (`SUBSTRING_INDEX(razao_social, ' - ', 1)`), e a própria UI promete “incluindo todos os CNPJs do mesmo grupo”.
- Resultado: se os CNPJs do mesmo cliente não caem na mesma raiz de 8 dígitos, o anexo vem incompleto.

Plano de ajuste

1. Alinhar a regra de agrupamento com a busca da tela
- Tratar “grupo” como `razao_base`, que é o agrupamento já usado na régua.
- Parar de depender da raiz de 8 dígitos como critério principal de consolidação.

2. Ajustar o payload enviado pela tela
- Arquivo: `src/pages/ReguaCobranca.tsx`
- No envio individual, mandar também a `razao_base` do cliente selecionado.
- No envio agrupado, mandar a lista dos grupos selecionados (ou mapear os CNPJs selecionados para seus respectivos `razao_base` antes do envio).
- Manter `cnpj/cnpjs` apenas como apoio/fallback, não como única chave de agrupamento.

3. Corrigir a resolução dos CNPJs na edge function
- Arquivo: `supabase/functions/regua-send-aging/index.ts`
- Trocar a etapa que hoje monta `allCnpjs` por raiz de CNPJ por uma resolução baseada em `SUBSTRING_INDEX(t.razao_social, ' - ', 1)`.
- Buscar todos os CNPJs em atraso pertencentes ao mesmo `razao_base` recebido.
- Deduplicar a lista final antes de consultar as faturas e montar a planilha.

4. Preservar o restante do fluxo atual
- Não mexer no SELECT principal de faturas nem na geração da planilha/e-mail além do necessário.
- A mudança fica concentrada na definição de quais CNPJs entram no anexo.

5. Ajustar a experiência da modal
- Atualizar o texto padrão/preview para refletir o agrupamento real.
- Se fizer sentido, exibir na modal os CNPJs efetivamente incluídos no envio para evitar dúvida do usuário.

Validação esperada
- Ao enviar Aging a partir de um cliente da busca, o anexo deve incluir todas as faturas em atraso de todos os CNPJs do mesmo `razao_base`.
- No envio agrupado, selecionar mais de um cliente/grupo deve consolidar todos os CNPJs de todos os grupos escolhidos.
- O retorno da função deve continuar informando `cnpjsIncluded`, agora coerente com o agrupamento mostrado na UI.

Arquivos envolvidos
- `src/pages/ReguaCobranca.tsx`
- `supabase/functions/regua-send-aging/index.ts`
