## Aviso de divergência mais claro sobre a relação entre vouchers

O texto atual do alerta fala apenas sobre "este voucher", sem deixar claro que o problema é uma divergência **entre os vouchers do mesmo SPO master**. Vou reescrever título e descrição para enfatizar a comparação entre vouchers.

### Edit
**`src/utils/voucherDivergence.ts`** — substituir o bloco de `titulo`/`descricao` (linhas 105-121) por uma única mensagem unificada que sempre fala em "vouchers do SPO master":

- **Título:** "Atenção: divergência no preenchimento dos vouchers deste SPO master"
- **Descrição (caso geral, com irmãos):** "Os vouchers deste SPO master foram preenchidos de forma diferente: X marcado(s) como Sim e Y como Não (em N vouchers no total). O campo 'É necessário contabilização com o fiscal?' precisa ter a mesma resposta para todos os vouchers do mesmo SPO master. Quando a resposta é Não, o voucher pula a etapa Fiscal e vai direto para o Financeiro; quando é Sim, passa pelo Fiscal antes. Confira o preenchimento e, se houve engano, devolva para a Operação corrigir."
- **Descrição (caso sem irmãos carregados):** mantém a mesma ideia — "Este voucher faz parte de um SPO master, mas os demais vouchers parecem ter sido preenchidos como Sim — por isso este, marcado como Não, caiu no Fiscal." + mesmo restante explicativo.

A regra (`rule`), `siblings`, `spoBase` e `etapaSugerida` permanecem inalterados. Sem mudanças em outras telas, backend ou memória.

### Resultado
Usuário lê o aviso e entende imediatamente que o problema é a inconsistência **entre os vouchers do mesmo SPO master**, não algo isolado deste voucher.