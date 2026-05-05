import type { Voucher } from "@/types/voucher";

export interface SiblingVoucherSummary {
  id: string;
  numeroSPO: string;
  cobrancaEmNomeDe: string;       // raw DB value: DACHSER | CLIENTE
  contabilizaFiscal: "SIM" | "NAO"; // mapped for UI
  etapaAtual: string;
  isCurrent: boolean;
  compativelComEtapa: boolean;     // compatible with FISCAL stage
}

export interface VoucherDivergence {
  divergent: boolean;
  rule: "FISCAL_COM_NAO_CONTABILIZA" | "NONE";
  titulo: string;
  descricao: string;
  spoBase: string | null;
  siblings: SiblingVoucherSummary[];
  etapaSugerida: "AJUSTE_OPERACAO";
}

const NONE: VoucherDivergence = {
  divergent: false,
  rule: "NONE",
  titulo: "",
  descricao: "",
  spoBase: null,
  siblings: [],
  etapaSugerida: "AJUSTE_OPERACAO",
};

/** Extracts base SPO (e.g. "101-292930" from "101-292930 DIM-BY"). */
export const getSpoBase = (numeroSPO?: string | null): string | null => {
  if (!numeroSPO) return null;
  const trimmed = String(numeroSPO).trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] || trimmed;
};

const mapContabiliza = (cobranca?: string | null): "SIM" | "NAO" =>
  (cobranca || "").toUpperCase() === "CLIENTE" ? "NAO" : "SIM";

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
  const isFiscal = etapa === "FISCAL" || etapa === "AJUSTE_FISCAL";
  const contabiliza = mapContabiliza(voucher.cobrancaEmNomeDe);

  // Divergência: voucher está no Fiscal mas foi marcado como NÃO contabiliza com o fiscal
  if (!isFiscal || contabiliza !== "NAO") return NONE;

  const spoBase = getSpoBase(voucher.numeroSPO);
  const normalized: SiblingVoucherSummary[] = (rawSiblings || [])
    .map((s) => {
      const numeroSPO = (s.numeroSPO ?? s.numero_spo ?? "").toString();
      const cob = ((s.cobrancaEmNomeDe ?? s.cobranca_em_nome_de ?? "") as string).toUpperCase() || "DACHSER";
      const et = (s.etapaAtual ?? s.etapa_atual ?? "") as string;
      const isCurrent = s.id === voucher.id;
      const cont = mapContabiliza(cob);
      return {
        id: s.id,
        numeroSPO,
        cobrancaEmNomeDe: cob,
        contabilizaFiscal: cont,
        etapaAtual: et,
        isCurrent,
        compativelComEtapa: cont === "SIM",
      };
    })
    .filter((s) => {
      if (!spoBase) return true;
      return getSpoBase(s.numeroSPO) === spoBase;
    });

  // Garantir que o voucher atual sempre apareça na lista
  if (!normalized.some((s) => s.isCurrent)) {
    normalized.unshift({
      id: voucher.id,
      numeroSPO: voucher.numeroSPO,
      cobrancaEmNomeDe: (voucher.cobrancaEmNomeDe || "CLIENTE").toUpperCase(),
      contabilizaFiscal: "NAO",
      etapaAtual: etapa,
      isCurrent: true,
      compativelComEtapa: false,
    });
  }

  const titulo = "Atenção à divergência no preenchimento do SPO Master";
  const descricao =
    `Este voucher apresenta uma configuração diferente dos demais itens do mesmo grupo. ` +
    `Enquanto os outros estão marcados para passar pelo Fiscal ("Sim"), este está marcado como "Não" (envio direto ao Financeiro). ` +
    `Como o sistema exige que todos os vouchers de um SPO Master sigam o mesmo fluxo, solicite a revisão do preenchimento.`;

  return {
    divergent: true,
    rule: "FISCAL_COM_NAO_CONTABILIZA",
    titulo,
    descricao,
    spoBase,
    siblings: normalized,
    etapaSugerida: "AJUSTE_OPERACAO",
  };
};
