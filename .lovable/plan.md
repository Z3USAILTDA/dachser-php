## Contexto

O voucher `105-293585 DIM-BY` foi concluído pelo Robô porque o comprovante `101-293081D13052026.68.pdf` casou pela **linha digitável** (a sequência `293081` aparece dentro do "nosso número" do boleto do 105-293585). Isso é falso-positivo: a regra precisa ser SPO/ND apenas.

## Regra nova

> **O Robô de Comprovantes NUNCA pode identificar voucher por `linha_digitavel` ou `codigo_barras`.** Match permitido só por: `numero_spo`, `id_rm` (ND), `processo_id`, `t_dados_financeiro_voucher.nd` e relação child→master.

## Mudanças (cirúrgicas)

Arquivo: `supabase/functions/mariadb-proxy/index.ts`

1. **`find_voucher_multi` (linhas 11689–11894)**
   - Em `tryByNd`: **remover** o bloco "linha_digitavel/codigo_barras" (linhas ~11826–11839).
   - **Remover** o passo "linhaDigitavel" da fila de prioridade (linhas ~11873–11877) que faz `tryByNd(linhaDigitavel)`.
   - Manter o parâmetro `linhaDigitavel` no body só por compatibilidade, mas **ignorá-lo** no matching (sem chamada).

2. **`find_voucher_by_nd` (linhas 12006–12143)**
   - **Remover** o passo 6 "Match por linha_digitavel ou codigo_barras" (linhas ~12096–12114).
   - Renumerar comentários (5 → child-to-master, 6 → t_dados_financeiro_voucher).

Arquivo: `src/pages/esteira/ComprovanteRobot.tsx`

3. Linha 218: **remover** `linhaDigitavel: extractedData?.linhaDigitavel || undefined`. O frontend deixa de enviar essa chave (defesa em profundidade — mesmo se algum dia voltar no backend, não chega).

## Memória

Atualizar `mem://vouchers/comprovante-robot-matching-rules` adicionando a proibição explícita: "Nunca casar por `linha_digitavel`/`codigo_barras`. Match exclusivamente por SPO, ND/id_rm, processo_id, `t_dados_financeiro_voucher.nd` e child→master."

## Fora de escopo

- Não mexer em extração da linha digitável (segue sendo extraída e salva no voucher para pagamento — só não serve mais para identificação).
- Não mexer em `save_linha_digitavel`, `update_codigo_barras`, geração de remessa, ou qualquer outro fluxo financeiro.
- Não reverter a conclusão do voucher 105-293585 — isso fica a critério do usuário (manual).

## Risco

Casos que dependiam exclusivamente da linha digitável para casar passarão a não casar e cair na fila de "não identificado". Isso é o comportamento desejado — falso-positivo é pior que falso-negativo.

Posso aplicar?