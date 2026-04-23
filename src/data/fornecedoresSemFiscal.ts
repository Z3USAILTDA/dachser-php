// Lista de fornecedores que NÃO necessitam de ação fiscal.
// Quando o voucher tiver fornecedor desta lista, o fluxo deve ir direto para o Financeiro.
export interface FornecedorSemFiscal {
  cnpj: string;
  nome: string;
}

export const FORNECEDORES_SEM_FISCAL: FornecedorSemFiscal[] = [
  { cnpj: "10.250.551/0003-29", nome: "LECHMAN TERMINAIS EIRELI" },
  { cnpj: "02.762.121/0009-53", nome: "SANTOS BRASIL PARTICIPACOES S/A" },
  { cnpj: "15.578.569/0001-06", nome: "GRU AIRPORT" },
  { cnpj: "86.846.847/0001-07", nome: "ALLINK TRANSPORTES INTERNACIONAIS LTDA" },
  { cnpj: "02.502.234/0001-62", nome: "COSCO BRASIL" },
  { cnpj: "58.188.756/0001-96", nome: "DEICMAR ARMAZENAGEM E" },
  { cnpj: "30.259.220/0002-86", nome: "MAERSK BRASIL LTDA" },
  { cnpj: "01.777.936/0001-96", nome: "AURORA TERMINAIS E" },
  { cnpj: "60.526.977/0198-64", nome: "MULTILOG" },
  { cnpj: "14.672.378/0001-46", nome: "ATLANTIS GUARUJA" },
  { cnpj: "00.394.460/0001-41", nome: "SRF - SECRETARIA DA RECEITA FEDERAL" },
  { cnpj: "08.017.952/0002-00", nome: "Suntrans Logistica do Brasil LTDA" },
  { cnpj: "52.147.923/0001-74", nome: "GEODIS GERENCIAMENTO" },
  { cnpj: "49.728.108/0001-94", nome: "PANALPINA LTDA" },
  { cnpj: "04.887.625/0001-78", nome: "BRASIL TERMINAL PORTUÁRIO S.A." },
  { cnpj: "58.890.252/0001-13", nome: "DHL EXPRESS (BRASIL) LTDA" },
  { cnpj: "10.228.777/0004-04", nome: "DHL GLOBAL FORWARDING (BRAZIL) LOGÍSTICA LTDA" },
  { cnpj: "12.919.786/0001-24", nome: "TERMINAL PORTUÁRIO MOVIMENTAÇÃO" },
  { cnpj: "21.378.906/0001-14", nome: "AGA ARMAZÉNS GERAIS AGRÍCOLA LTDA" },
  { cnpj: "89.384.895/0001-19", nome: "ASSOCIAÇÃO COMERCIAL E INDUSTRIAL DE URUGUAIANA" },
  { cnpj: "62.226.170/0001-46", nome: "CIESP" },
  { cnpj: "74.182.593/0001-90", nome: "DC LOGISTICS BRASIL LTDA" },
  { cnpj: "00.662.270/0003-20", nome: "INMETRO" },
  { cnpj: "01.317.277/0001-05", nome: "ITAPOÁ TERMINAIS" },
  { cnpj: "03.795.647/0002-26", nome: "LIBRA PORT" },
  { cnpj: "60.526.977/0204-47", nome: "EADI SUL" },
  { cnpj: "02.762.121/0001-04", nome: "SANTOS BRASIL PARTICIPAÇÕES" },
  { cnpj: "14.522.178/0001-07", nome: "AEROPORTOS BRASIL VIRACOPOS S.A." },
  { cnpj: "82.270.711/0008-17", nome: "CARGOLIFT LOGÍSTICA S/A" },
  { cnpj: "19.674.909/0001-53", nome: "CONCESSIONÁRIA D A I D CONFINS S/A" },
  { cnpj: "02.502.234/0002-43", nome: "COSCO BRASIL" },
  { cnpj: "01.831.941/0001-30", nome: "CRAFT" },
  { cnpj: "37.115.342/0031-82", nome: "DEPARTAMENTO FUNDO DE MARINHA MERCANTE" },
  { cnpj: "05.895.924/0001-17", nome: "TK BR DESPACHANTE ADUANEIRO" },
  { cnpj: "24.620.316/0003-06", nome: "PAC LOG" },
  { cnpj: "28.689.596/0001-06", nome: "ONE OCEAN" },
  { cnpj: "02.378.779/0001-09", nome: "MSC MEDITERRANEAN" },
];
