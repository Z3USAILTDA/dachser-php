A gravação ainda saiu errada porque o ajuste anterior foi aplicado nos fluxos `save_disputa_cr` e `save_disputa_cr_bulk`, mas a importação da planilha usa outro fluxo: `import_disputas_planilha_cr`.

Nesse fluxo da planilha, o código ainda faz o split de `doc_key`:

```text
doc_key = "CR|<chave>"
documento = "CR"
nf = "<chave>"
nd = não grava
```

Por isso a gravação continua saindo com `documento = CR` e sem `nd`.

Plano de correção:

1. Ajustar `check_disputas_planilha_cr`
   - Buscar também `documento`, `numero_nf` e `nd` na `v_fin_regua_contas_receber`.
   - Parar de montar a chave ativa a partir do `doc_key.split('|')`.
   - Conferir disputa existente por:
     - `t_fin_disputas.documento = v_fin_regua_contas_receber.documento`
     - `t_fin_disputas.nf = v_fin_regua_contas_receber.numero_nf`

2. Ajustar `import_disputas_planilha_cr`
   - Buscar também `documento`, `numero_nf` e `nd` na view.
   - Gravar usando o de-para correto:
     - `documento = v.documento`
     - `nf = v.numero_nf`
     - `nd = v.nd`
   - Incluir `nd` no `INSERT`.
   - Incluir `nd = ?` no `UPDATE`, para corrigir/reabrir registros pela importação.

3. Manter fallback seguro
   - Se a view não trouxer `documento`, manter `CR` como fallback.
   - Se a view não trouxer `numero_nf`, manter a parte útil do `doc_key` como fallback.
   - Isso evita quebrar casos antigos ou dados incompletos.

4. Não mexer em outras telas/fluxos
   - Alteração restrita à busca/check e importação da planilha de disputas CR.
   - Não fazer backfill automático dos registros antigos já gravados errado, a menos que você peça.