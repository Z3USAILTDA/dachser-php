import { useSearchParams } from "react-router-dom";

const SupervisorConfirmacao = () => {
  const [params] = useSearchParams();
  const status = params.get("status") || "error";
  const msg = params.get("msg") || "";

  const configs: Record<string, { title: string; color: string; glow: string; icon: JSX.Element }> = {
    approved: {
      title: "Voucher Aprovado",
      color: "#22C55E",
      glow: "rgba(34,197,94,.25)",
      icon: (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ),
    },
    rejected: {
      title: "Voucher Rejeitado",
      color: "#DC2626",
      glow: "rgba(220,38,38,.25)",
      icon: (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ),
    },
    error: {
      title: "Ação Não Disponível",
      color: "#F5B843",
      glow: "rgba(245,184,67,.25)",
      icon: (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
    },
  };

  const cfg = configs[status] || configs.error;

  const defaultMessages: Record<string, string> = {
    approved: "O voucher foi aprovado com sucesso e enviado para o Financeiro.",
    rejected: "O voucher foi rejeitado e devolvido para a Operação.",
    error: "Ocorreu um erro ao processar sua ação. Tente novamente ou acesse o sistema.",
  };

  const message = msg ? decodeURIComponent(msg) : defaultMessages[status] || defaultMessages.error;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        background: "linear-gradient(160deg, #050612 0%, #0c0d1a 40%, #111322 100%)",
        color: "#f5f5f5",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "rgba(5,6,18,.92)",
          border: "1px solid rgba(255,255,255,.1)",
          borderRadius: 24,
          boxShadow: "0 20px 60px rgba(0,0,0,.6)",
          padding: "48px 40px",
          textAlign: "center",
          maxWidth: 460,
          width: "100%",
          animation: "fadeUp .5s ease-out",
        }}
      >
        <div style={{ marginBottom: 28 }}>
          <img src="https://i.ibb.co/sJkY7y5/logo-branco.png" alt="Z3US" style={{ height: 32 }} />
        </div>

        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: "50%",
            background: cfg.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 28px",
            boxShadow: `0 0 0 0 ${cfg.glow}`,
            animation: "pulse 2s ease-in-out infinite",
          }}
        >
          {cfg.icon}
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12, letterSpacing: "-.02em", color: "#f5f5f5" }}>
          {cfg.title}
        </h1>

        <p style={{ fontSize: 15, lineHeight: 1.7, color: "#aaa", maxWidth: 360, margin: "0 auto" }}>
          {message}
        </p>

        <div style={{ height: 1, background: "rgba(255,255,255,.08)", margin: "32px 0" }} />

        <p style={{ fontSize: 11, color: "#555", letterSpacing: ".08em", textTransform: "uppercase" as const }}>
          <span style={{ color: "#F5B843" }}>© Z3US</span>.AI — Esteira de Vouchers
        </p>
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0,0,0,.15); }
          50% { box-shadow: 0 0 0 14px transparent; }
        }
      `}</style>
    </div>
  );
};

export default SupervisorConfirmacao;
