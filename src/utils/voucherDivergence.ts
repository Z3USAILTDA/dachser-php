import type { Voucher } from "@/types/voucher";

export interface SiblingVoucherSummary {
  id: string;
  numeroSPO: string;
  cobrancaEmNomeDe: string;
  etapaAtual: string;
  isCurrent: boolean;
  compativelComEtapa: boolean;
}

export interface VoucherDivergence {
  divergent: boolean;
  rule: "FISCAL_COM_CLIENTE" | "NONE";
  titulo: string;
  descricao: string;
  causaProvavel: string;
  spoBase: string | null;
  siblings: SiblingVoucherSummary[];
  etapaSugerida: "AJUSTE_OPERACAO";
  fromStage: "FISCAL" | "AJUSTE_FISCAL";
}

const NONE: VoucherDivergence = {
  divergent: false,
  rule: "NONE",
  titulo: "",
  descricao: "",
  causaProvavel: "",
  spoBase: null,
  siblings: [],
  etapaSugerida: "AJUSTE_OPERACAO",
  fromStage: "FISCAL",
};

/** Extracts base SPO (e.g. "101-292930" from "101-292930 DIM-BY"). */
export const getSpoBase = (numeroSPO?: string | null): string | null => {
  if (!numeroSPO) return null;
  const trimmed = String(numeroSPO).trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] || trimmed;
};

export const detectVoucherEtapaDivergence = (
  voucher: Voucher | null | undefined,
  rawSiblings: Array<{
    id: string;
    numero_spo?: string;
    numeroSPO?: string;
    cobranca_em_nome_de?: string;
    cobrancaEmNomeDe?: string;
    etapa_atual?: string;
    etapaAtual?: string;
  }> = [],
): VoucherDivergence => {
  if (!voucher) return NONE;

  const etapa = voucher.etapaAtual;
  const cobranca = (voucher.cobrancaEmNomeDe || "").toUpperCase();
  const isFiscal = etapa === "FISCAL" || etapa === "AJUSTE_FISCAL";
  const isCliente = cobranca === "CLIENTE";

  if (!isFiscal || !isCliente) return NONE;

  const spoBase = getSpoBase(voucher.numeroSPO);
  const normalized: SiblingVoucherSummary[] = (rawSiblings || [])
    .map((s) => {
      const numeroSPO = (s.numeroSPO ?? s.numero_spo ?? "").toString();
      const cob = ((s.cobrancaEmNomeDe ?? s.cobranca_em_nome_de ?? "") as string).toUpperCase() || "DACHSER";
      const et = (s.etapaAtual ?? s.etapa_atual ?? "") as string;
      const isCurrent = s.id === voucher.id;
      // Compatible with FISCAL stage = DACHSER (Cliente skips Fiscal)
      const compativelComEtapa = cob === "DACHSER";
      return { id: s.id, numeroSPO, cobrancaEmNomeDe: cob, etapaAtual: et, isCurrent, compativelComEtapa };
    })
    .filter((s) => {
      if (!spoBase) return true;
      return getSpoBase(s.numeroSPO) === spoBase;
    });

  // Ensure current voucher is present in the list
  if (!normalized.some((s) => s.isCurrent)) {
    normalized.unshift({
      id: voucher.id,
      numeroSPO: voucher.numeroSPO,
      cobrancaEmNomeDe: cobranca || "CLIENTE",
      etapaAtual: etapa,
      isCurrent: true,
      compativelComEtapa: false,
    });
  }

  const totalIrmaos = normalized.length;
  const dachserCount = normalized.filter((s) => s.cobrancaEmNomeDe === "DACHSER").length;

  const contextoFrase = totalIrmaos > 1
    ? ` Este SPO possui ${totalIrmaos} vouchers — ${dachserCount} em nome da DACHSER (que passam pelo Fiscal) e este, em nome do CLIENTE, que não deveria estar aqui.`
    : "";

  return {
    divergent: true,
    rule: "FISCAL_COM_CLIENTE",
    titulo: "Voucher na etapa Fiscal sem motivo — cobrança em nome do CLIENTE",
    descricao:
      `Este voucher está na etapa Fiscal, mas o campo "Cobrança em nome de" está marcado como CLIENTE. ` +
      `Quando a cobrança é em nome do CLIENTE, o fluxo NÃO passa pelo Fiscal — o voucher deveria seguir direto da Operação para o Financeiro.` +
      contextoFrase,
    causaProvavel:
      `Provavelmente o campo "Cobrança em nome de" foi alterado para CLIENTE depois que o voucher já tinha sido enviado ao Fiscal, ` +
      `ou foi enviado em lote junto com vouchers DACHSER do mesmo SPO sem que o roteamento individual fosse aplicado.`,
    spoBase,
    siblings: normalized,
    etapaSugerida: "AJUSTE_OPERACAO",
    fromStage: etapa as "FISCAL" | "AJUSTE_FISCAL",
  };
};
