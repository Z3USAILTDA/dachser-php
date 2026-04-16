import { supabase } from "@/integrations/supabase/client";
import { Voucher, isBoleto } from "@/types/voucher";

/**
 * Insere dados do voucher na t_dados_rm ao entrar na etapa FINANCEIRO.
 * Não falha a operação principal — apenas loga erros.
 */
export const insertDadosRmOnFinanceiro = async (voucher: Voucher): Promise<void> => {
  try {
    const { error } = await supabase.functions.invoke("mariadb-proxy", {
      body: {
        action: "insert_dados_rm",
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
        tipo_exec: voucher.tipoExecucaoPagamento || "A_DEFINIR",
      },
    });

    if (error) {
      console.error("[voucherRmSync] Erro ao inserir em t_dados_rm:", error);
    } else {
      console.log("[voucherRmSync] Inserido em t_dados_rm:", voucher.id);
    }
  } catch (err) {
    console.error("[voucherRmSync] Erro inesperado ao inserir em t_dados_rm:", err);
  }
};
