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
  icon: string;
  isAction?: boolean;
}

// Cobertura ampla — telas e eventos principais. Ordem importa: regex mais específica primeiro.
const ENTRIES: EndpointEntry[] = [
  // ===== Auth / Dashboard =====
  { match: "/", label: "Login", module: "Auth", icon: "🔐" },
  { match: "/dashboard", label: "Dashboard principal", module: "Geral", icon: "🏠" },
  { match: "/change-password", label: "Trocar senha", module: "Auth", icon: "🔑" },

  // ===== AIR =====
  { match: "/air/tracking-aereo", label: "Tracking Aéreo", module: "Aéreo", icon: "✈️" },
  { match: "/air/tracking", label: "Monitor Aéreo", module: "Aéreo", icon: "✈️" },
  { match: "/air/cct", label: "CCT (Comprovação de Carga)", module: "Aéreo", icon: "📋" },
  { match: "/air/awb", label: "Consulta AWB", module: "Aéreo", icon: "📄" },
  { match: "/air/submeter", label: "Submeter AWB ao CCT", module: "Aéreo", icon: "📤" },
  { match: "/air/cadastro", label: "Cadastro de processo aéreo", module: "Aéreo", icon: "➕" },
  { match: /^event:air\.refresh/, label: "Atualizou tracking aéreo", module: "Aéreo", icon: "🔄", isAction: true },
  { match: /^event:air\.timeline\.open/, label: "Abriu timeline aérea", module: "Aéreo", icon: "📊", isAction: true },
  { match: /^event:air\.airline\.click/, label: "Abriu site da cia aérea", module: "Aéreo", icon: "🔗", isAction: true },
  { match: /^event:air\.export/, label: "Exportou tracking aéreo", module: "Aéreo", icon: "⬇️", isAction: true },
  { match: /^event:cct\./, label: "Ação CCT", module: "Aéreo", icon: "📋", isAction: true },

  // ===== SEA / Marítimo =====
  { match: "/sea/tracking", label: "Monitor Marítimo", module: "Marítimo", icon: "🚢" },
  { match: "/sea/cadastro", label: "Cadastro BL Marítimo", module: "Marítimo", icon: "➕" },
  { match: "/sea/draft", label: "Draft de Exportação", module: "Marítimo", icon: "📝" },
  { match: "/sea/analise", label: "Análise Manifesto vs HBL", module: "Marítimo", icon: "🔍" },
  { match: "/sea/local-charges", label: "Local Charges", module: "Marítimo", icon: "💰" },
  { match: "/sea/demurrage/monitor", label: "Demurrage — Monitor", module: "Demurrage", icon: "⏱️" },
  { match: "/sea/demurrage/rates", label: "Demurrage — Tarifas", module: "Demurrage", icon: "💲" },
  { match: "/sea/demurrage/freetimes", label: "Demurrage — Free Times", module: "Demurrage", icon: "🕐" },
  { match: "/sea/demurrage/preinvoicing", label: "Demurrage — Pré-faturas", module: "Demurrage", icon: "🧾" },
  { match: "/sea/demurrage/carrier-costs", label: "Demurrage — Custos Armador", module: "Demurrage", icon: "💼" },
  { match: "/sea/demurrage", label: "Demurrage", module: "Demurrage", icon: "⏱️" },
  { match: /^event:sea\.refresh/, label: "Atualizou tracking marítimo", module: "Marítimo", icon: "🔄", isAction: true },
  { match: /^event:sea\.export/, label: "Exportou dados marítimos", module: "Marítimo", icon: "⬇️", isAction: true },
  { match: /^event:demurrage\./, label: "Ação Demurrage", module: "Demurrage", icon: "⏱️", isAction: true },

  // ===== CHB =====
  { match: "/chb/analise", label: "Análise CHB", module: "CHB", icon: "📑" },
  { match: "/chb", label: "CHB", module: "CHB", icon: "📑" },
  { match: /^event:chb\./, label: "Ação CHB", module: "CHB", icon: "📑", isAction: true },

  // ===== Vouchers / Esteira =====
  { match: "/vouchers/esteira", label: "Esteira Vouchers/SPO", module: "Vouchers", icon: "🧾" },
  { match: "/vouchers/processos", label: "Vouchers — Processos", module: "Vouchers", icon: "📂" },
  { match: "/vouchers/pagamentos", label: "Vouchers — Pagamentos", module: "Vouchers", icon: "💳" },
  { match: "/vouchers/historico", label: "Vouchers — Histórico de Baixas", module: "Vouchers", icon: "📜" },
  { match: "/vouchers", label: "Vouchers", module: "Vouchers", icon: "🧾" },
  { match: /^event:vouchers\.approve/, label: "Aprovou voucher", module: "Vouchers", icon: "✅", isAction: true },
  { match: /^event:vouchers\.reject/, label: "Rejeitou voucher", module: "Vouchers", icon: "❌", isAction: true },
  { match: /^event:vouchers\.return/, label: "Devolveu voucher", module: "Vouchers", icon: "↩️", isAction: true },
  { match: /^event:vouchers\./, label: "Ação Vouchers", module: "Vouchers", icon: "🧾", isAction: true },

  // ===== Finance =====
  { match: "/finance/regua", label: "Régua de Cobrança", module: "Financeiro", icon: "📏" },
  { match: "/finance/disputas", label: "Disputas Financeiras", module: "Financeiro", icon: "⚖️" },
  { match: "/finance/othello", label: "Importação Othello/RM", module: "Financeiro", icon: "📊" },
  { match: "/finance", label: "Financeiro", module: "Financeiro", icon: "💼" },
  { match: /^event:regua\./, label: "Ação Régua de Cobrança", module: "Financeiro", icon: "📏", isAction: true },
  { match: /^event:disputas\./, label: "Ação Disputas", module: "Financeiro", icon: "⚖️", isAction: true },

  // ===== Métricas / Olimpo =====
  { match: "/metrics", label: "Métricas de Uso", module: "Métricas", icon: "📈" },
  { match: /^event:metrics\.export\.excel/, label: "Exportou métricas (Excel)", module: "Métricas", icon: "📗", isAction: true },
  { match: /^event:metrics\.export\.pdf/, label: "Exportou métricas (PDF)", module: "Métricas", icon: "📕", isAction: true },
  { match: /^event:metrics\./, label: "Ação Métricas", module: "Métricas", icon: "📈", isAction: true },

  // ===== Admin (não logado, mas mantido para fallback caso apareça) =====
  { match: /^\/admin/, label: "Área administrativa", module: "Admin", icon: "⚙️" },

  // ===== Fallback genérico de eventos =====
  { match: /^event:/, label: "Ação do usuário", module: "Geral", icon: "⚡", isAction: true },
];

const cache = new Map<string, PrettyEndpoint>();

/**
 * Retorna informações amigáveis sobre um endpoint ou evento.
 * Remove sufixos auxiliares (#dur=ms) antes de comparar.
 */
export function prettifyEndpoint(rawEndpoint: string): PrettyEndpoint {
  if (!rawEndpoint) {
    return { label: "—", module: "Geral", icon: "•", isAction: false };
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
        icon: entry.icon,
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
    icon: "•",
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
      return { label: "🟢 Entrou", tone: "in" };
    case "VO":
    case "V_OUT":
    case "VIEW_END":
      return { label: "🔴 Saiu", tone: "out" };
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
