import { Voucher, isBoleto } from "@/types/voucher";

export const insertDadosRmOnFinanceiro = async (voucher: Voucher): Promise<void> => {
  try {
    const resp = await fetch('/api/fin/vouchers/dados-rm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_rm: voucher.idRm || null,
        numero_spo: voucher.numeroSPO,
        voucher_boleto: isBoleto(voucher.formaPagamento)
          ? (voucher.linhaDigitavel || voucher.codigoBarras || null)
          : null,
        chave_pix: voucher.chavePix || null,
        pix_tipo_chave: null,
        forma_pag: voucher.formaPagamento,
        fornecedor: voucher.fornecedor,
        cnpj_fornecedor: voucher.cnpjFornecedor || null,
        tipo_exec: voucher.tipoExecucaoPagamento || 'A_DEFINIR',
      }),
    });
    if (!resp.ok) {
      const d = await resp.json().catch(() => ({}));
      console.error('[voucherRmSync] Erro ao inserir em t_dados_rm:', d.error);
    } else {
      console.log('[voucherRmSync] Inserido em t_dados_rm:', voucher.id);
    }
  } catch (err) {
    console.error('[voucherRmSync] Erro inesperado ao inserir em t_dados_rm:', err);
  }
};
