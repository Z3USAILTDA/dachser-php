// Estilos padronizados DACHSER
export const DACHSER_STYLES = {
  // Card principal
  card: {
    background: 'rgba(5,6,18,.9)',
    border: '1px solid rgba(255,255,255,.12)',
    boxShadow: '0 18px 40px rgba(0,0,0,.85)',
  },
  
  // Cores
  colors: {
    gold: '#ffc800',
    goldGlow: 'rgba(255,200,0,.9)',
    text: '#f5f5f5',
    textMuted: '#aaaaaa',
    background: 'rgba(5,6,18,0.9)',
    backgroundDark: 'rgba(0,0,0,.70)',
    border: 'rgba(255,255,255,.12)',
    borderLight: 'rgba(255,255,255,.18)',
  },
  
  // Classes para inputs
  input: "h-9 w-full pl-10 pr-4 rounded-full border border-[rgba(255,255,255,.14)] bg-[#13141a] text-[#f5f5f5] text-[0.78rem] placeholder:text-[#666] focus:outline-none focus:border-[#ffc800] focus:shadow-[0_0_0_1px_rgba(255,200,0,.8)]",
  
  // Classes para botão primário
  buttonPrimary: "h-8 px-4 rounded-full bg-[#ffc800] text-[#000] text-[0.75rem] font-medium flex items-center gap-1.5 hover:bg-[#ffdc50] transition shadow-[0_0_20px_rgba(255,200,0,.3)]",
  
  // Classes para botão voltar
  buttonBack: "w-8 h-8 rounded-full border border-[rgba(255,255,255,.12)] bg-[rgba(5,6,18,0.9)] text-[#aaaaaa] flex items-center justify-center backdrop-blur-sm hover:bg-[rgba(5,6,18,1)] hover:text-white transition-all",
  
  // Classes para pill de filtro
  filterPill: "flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(0,0,0,.5)] border border-[rgba(255,255,255,.22)]",
  filterLabel: "text-[0.68rem] tracking-[0.1em] uppercase text-[#aaaaaa]",
  
  // Classes para select
  selectTrigger: "h-8 w-[140px] rounded-full bg-[#13141a] border border-[rgba(255,255,255,.14)] text-[0.78rem]",
  selectContent: "bg-[#13141a] border border-[rgba(255,255,255,.14)] rounded-xl",
  
  // Classes para tabela
  tableHeader: "px-[10px] py-[10px] text-left text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] font-medium sticky top-0 bg-[#14151c] z-[5] border-b border-[rgba(255,255,255,.09)]",
  tableCell: "px-[10px] py-[9px] whitespace-nowrap text-[0.82rem]",
  tableRow: "border-b border-[rgba(255,255,255,.06)] hover:bg-[rgba(255,255,255,.03)] transition-colors",
  
  // Classes para user pill
  userPill: "px-[14px] py-1.5 rounded-full bg-[rgba(0,0,0,.70)] border border-[rgba(255,255,255,.18)] text-[#aaaaaa] max-w-[220px] truncate",
  
  // Classes para badge
  badge: {
    success: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    warning: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    error: "bg-rose-500/20 text-rose-400 border-rose-500/30",
    info: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    default: "bg-[rgba(255,255,255,.08)] text-[#aaaaaa] border-[rgba(255,255,255,.12)]",
  },
} as const;

// CSS style objects para uso inline
export const cardStyle = DACHSER_STYLES.card;
export const inputClass = DACHSER_STYLES.input;
export const buttonPrimaryClass = DACHSER_STYLES.buttonPrimary;
export const buttonBackClass = DACHSER_STYLES.buttonBack;