/**
 * Mapeamento amigável de endpoints técnicos e eventos para labels legíveis.
 * Usado na tela de Métricas de Uso para apresentação a usuários não-técnicos.
 */

export interface PrettyEndpoint {
  label: string;
  module: string;
  icon: string;
  isAction: boolean;
}

interface EndpointEntry {
  match: RegExp | string;
  label: string;
  module: string;
  icon?: string;
  isAction?: boolean;
}

// Cobertura ampla — telas e eventos principais. Ordem importa: regex mais específica primeiro.
const ENTRIES: EndpointEntry[] = [
  // ===== Auth / Dashboard =====
  { match: "/", label: "Login", module: "Auth" },
  { match: "/dashboard", label: "Dashboard principal", module: "Geral" },
  { match: "/change-password", label: "Trocar senha", module: "Auth" },
  { match: "/forgot-password", label: "Esqueci a senha", module: "Auth" },

  // ===== AIR =====
  { match: "/air/tracking-aereo", label: "Tracking Aéreo", module: "Aéreo" },
  { match: "/air/tracking", label: "Monitor Aéreo", module: "Aéreo" },
  { match: "/air/robo-cct", label: "Robô CCT", module: "Aéreo" },
  { match: "/air/cct/excecoes", label: "CCT — Exceções", module: "Aéreo" },
  { match: "/air/cct/analytics", label: "CCT — Analytics", module: "Aéreo" },
  { match: "/air/cct/notificacoes", label: "CCT — Notificações", module: "Aéreo" },
  { match: "/air/cct/console", label: "CCT — Console Técnico", module: "Aéreo" },
  { match: "/air/cct", label: "CCT (Comprovação de Carga)", module: "Aéreo" },
  { match: "/air/check-awb", label: "Consulta AWB", module: "Aéreo" },
  { match: "/air/awb-list", label: "Lista de AWBs", module: "Aéreo" },
  { match: "/air/cadastro-nova", label: "Cadastro de processo aéreo", module: "Aéreo" },
  { match: /^event:air\.refresh/, label: "Atualizou tracking aéreo", module: "Aéreo", isAction: true },
  { match: /^event:air\.timeline\.open/, label: "Abriu timeline aérea", module: "Aéreo", isAction: true },
  { match: /^event:air\.airline\.click/, label: "Abriu site da cia aérea", module: "Aéreo", isAction: true },
  { match: /^event:air\.export/, label: "Exportou tracking aéreo", module: "Aéreo", isAction: true },
  { match: /^event:cct\./, label: "Ação CCT", module: "Aéreo", isAction: true },

  // ===== SEA / Marítimo =====
  { match: "/maritimo", label: "Análise Manifesto vs HBL", module: "Marítimo" },
  { match: "/maritimo/invoices-draft-hbl", label: "Invoices Draft HBL", module: "Marítimo" },
  { match: "/sea/tracking", label: "Monitor Marítimo", module: "Marítimo" },
  { match: "/sea/cadastro-hbl", label: "Cadastro HBL", module: "Marítimo" },
  { match: "/sea/cadastro-manifest", label: "Cadastro Manifesto", module: "Marítimo" },
  { match: "/sea/cadastro-bl", label: "Cadastro BL", module: "Marítimo" },
  { match: "/sea/submeter-hbl-mbl", label: "Submeter HBL/MBL", module: "Marítimo" },
  { match: "/sea/submeter-manifest-hbl", label: "Submeter Manifesto/HBL", module: "Marítimo" },
  { match: "/sea/invoices-draft-hbl", label: "Invoices Draft HBL", module: "Marítimo" },
  { match: "/sea/draft-exportacao", label: "Draft de Exportação", module: "Marítimo" },
  { match: "/sea/local-charges", label: "Local Charges", module: "Marítimo" },
  { match: "/sea/alteracoes-fee", label: "Alterações de Fee", module: "Marítimo" },
  { match: "/sea/analysis", label: "Análise Manifesto vs HBL", module: "Marítimo" },
  { match: "/sea/demurrage/monitor", label: "Demurrage — Monitor", module: "Demurrage" },
  { match: "/sea/demurrage/rates", label: "Demurrage — Tarifas", module: "Demurrage" },
  { match: "/sea/demurrage/free-times", label: "Demurrage — Free Times", module: "Demurrage" },
  { match: "/sea/demurrage/pre-invoicing", label: "Demurrage — Pré-faturas", module: "Demurrage" },
  { match: "/sea/demurrage/carrier-costs", label: "Demurrage — Custos Armador", module: "Demurrage" },
  { match: "/sea/demurrage/disputes", label: "Demurrage — Disputas", module: "Demurrage" },
  { match: "/sea/demurrage/clients", label: "Demurrage — Clientes", module: "Demurrage" },
  { match: "/sea/demurrage/analytics", label: "Demurrage — Analytics", module: "Demurrage" },
  { match: "/sea/demurrage", label: "Demurrage", module: "Demurrage" },
  { match: /^event:sea\.refresh/, label: "Atualizou tracking marítimo", module: "Marítimo", isAction: true },
  { match: /^event:sea\.export/, label: "Exportou dados marítimos", module: "Marítimo", isAction: true },
  { match: /^event:demurrage\./, label: "Ação Demurrage", module: "Demurrage", isAction: true },

  // ===== CHB =====
  { match: "/chb/conferences", label: "Análises CHB", module: "CHB" },
  { match: "/chb/conferencia", label: "Conferência CHB", module: "CHB" },
  { match: "/fin/analise-documental", label: "Análise Documental", module: "CHB" },
  { match: /^\/chb\/conferences\//, label: "Conferência CHB", module: "CHB" },
  { match: /^\/chb/, label: "CHB", module: "CHB" },
  { match: /^event:chb\./, label: "Ação CHB", module: "CHB", isAction: true },

  // ===== Esteira / Vouchers =====
  { match: "/fin/esteira/robot", label: "Robô Esteira", module: "Esteira" },
  { match: "/fin/esteira/dashboard", label: "Dashboard Esteira", module: "Esteira" },
  { match: "/fin/esteira/reports", label: "Relatórios Esteira", module: "Esteira" },
  { match: "/fin/esteira", label: "Esteira Vouchers/SPO", module: "Esteira" },
  { match: /^event:vouchers\.fiscal\.approve/, label: "Aprovou voucher (fiscal)", module: "Esteira", isAction: true },
  { match: /^event:vouchers\.approve/, label: "Aprovou voucher", module: "Esteira", isAction: true },
  { match: /^event:vouchers\.reject/, label: "Rejeitou voucher", module: "Esteira", isAction: true },
  { match: /^event:vouchers\.return/, label: "Devolveu voucher", module: "Esteira", isAction: true },
  { match: /^event:vouchers\./, label: "Ação Vouchers", module: "Esteira", isAction: true },

  // ===== Financeiro =====
  { match: "/fin/regua-cobranca", label: "Régua de Cobrança", module: "Financeiro" },
  { match: "/fin/disputas", label: "Disputas Financeiras", module: "Financeiro" },
  { match: "/fin/othello-import", label: "Importação Othello/RM", module: "Financeiro" },
  { match: /^\/fin\//, label: "Financeiro", module: "Financeiro" },
  { match: /^event:regua\./, label: "Ação Régua de Cobrança", module: "Financeiro", isAction: true },
  { match: /^event:disputas\./, label: "Ação Disputas", module: "Financeiro", isAction: true },

  // ===== Olimpo =====
  { match: "/olimpo/mapa", label: "Olimpo — Mapa", module: "Olimpo" },
  { match: "/olimpo/cobranca", label: "Olimpo — Cobrança", module: "Olimpo" },
  { match: "/olimpo/faturamento", label: "Olimpo — Faturamento", module: "Olimpo" },
  { match: "/olimpo", label: "Olimpo", module: "Olimpo" },
  { match: /^event:olimpo\./, label: "Ação Olimpo", module: "Olimpo", isAction: true },

  // ===== Métricas / Admin =====
  { match: "/admin/metrics", label: "Métricas de Uso", module: "Métricas" },
  { match: /^event:metrics\.export\.excel/, label: "Exportou métricas (Excel)", module: "Métricas", isAction: true },
  { match: /^event:metrics\.export\.pdf/, label: "Exportou métricas (PDF)", module: "Métricas", isAction: true },
  { match: /^event:metrics\./, label: "Ação Métricas", module: "Métricas", isAction: true },
  { match: /^\/admin/, label: "Área administrativa", module: "Admin" },

  // ===== Fallback genérico de eventos =====
  { match: /^event:/, label: "Ação do usuário", module: "Geral", isAction: true },
];

const cache = new Map<string, PrettyEndpoint>();

/**
 * Retorna informações amigáveis sobre um endpoint ou evento.
 * Remove sufixos auxiliares (#dur=ms) antes de comparar.
 */
export function prettifyEndpoint(rawEndpoint: string): PrettyEndpoint {
  if (!rawEndpoint) {
    return { label: "—", module: "Geral", icon: "", isAction: false };
  }
  const cleaned = rawEndpoint.replace(/#dur=\d+$/, "").trim();

  const cached = cache.get(cleaned);
  if (cached) return cached;

  for (const entry of ENTRIES) {
    const matched =
      typeof entry.match === "string"
        ? cleaned.toLowerCase() === entry.match.toLowerCase()
        : entry.match.test(cleaned);
    if (matched) {
      const result: PrettyEndpoint = {
        label: entry.label,
        module: entry.module,
        icon: "",
        isAction: !!entry.isAction,
      };
      cache.set(cleaned, result);
      return result;
    }
  }

  // Fallback: usa o endpoint como label
  const fallback: PrettyEndpoint = {
    label: cleaned,
    module: "Outro",
    icon: "",
    isAction: false,
  };
  cache.set(cleaned, fallback);
  return fallback;
}

/**
 * Tradução amigável dos métodos usados no log de uso.
 */
export function prettifyMethod(method: string): { label: string; tone: "in" | "out" | "view" | "action" | "delete" } {
  switch (method) {
    case "VI":
    case "V_IN":
      return { label: "Entrou", tone: "in" };
    case "VO":
    case "V_OUT":
    case "VIEW_END":
      return { label: "Saiu", tone: "out" };
    case "GET":
      return { label: "Visualizou", tone: "view" };
    case "POST":
    case "PUT":
      return { label: "Ação", tone: "action" };
    case "DELETE":
      return { label: "Excluiu", tone: "delete" };
    default:
      return { label: method, tone: "view" };
  }
}
