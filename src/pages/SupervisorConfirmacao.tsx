import { useSearchParams } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";

type Status = "loading" | "approved" | "rejected" | "reject_form" | "error";

const SupervisorConfirmacao = () => {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const action = params.get("action") || "";

  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const callAction = useCallback(async (method: "GET" | "POST", body?: Record<string, any>) => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/supervisor-email-action?token=${encodeURIComponent(token)}&action=${encodeURIComponent(action)}`;
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return res.json();
  }, [token, action]);

  useEffect(() => {
    if (!token || !action) {
      setStatus("error");
      setMessage("Link inválido ou parâmetros ausentes.");
      return;
    }

    if (action === "approve") {
      callAction("GET").then((data) => {
        if (data.status === "approved") {
          setStatus("approved");
          setMessage(data.message);
        } else {
          setStatus("error");
          setMessage(data.message || "Erro ao aprovar o voucher.");
        }
      }).catch(() => {
        setStatus("error");
        setMessage("Erro de conexão. Tente novamente.");
      });
    } else if (action === "reject") {
      callAction("GET").then((data) => {
        if (data.status === "valid") {
          setStatus("reject_form");
        } else if (data.status === "error") {
          setStatus("error");
          setMessage(data.message || "Token inválido.");
        }
      }).catch(() => {
        setStatus("error");
        setMessage("Erro de conexão. Tente novamente.");
      });
    } else {
      setStatus("error");
      setMessage("Ação não reconhecida.");
    }
  }, [token, action, callAction]);

  const handleReject = async () => {
    if (reason.trim().length < 5) return;
    setSubmitting(true);
    try {
      const data = await callAction("POST", { reason: reason.trim() });
      if (data.status === "rejected") {
        setStatus("rejected");
        setMessage(data.message);
      } else {
        setStatus("error");
        setMessage(data.message || "Erro ao rejeitar o voucher.");
      }
    } catch {
      setStatus("error");
      setMessage("Erro de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const configs: Record<string, { title: string; color: string; glow: string; icon: JSX.Element }> = {
    loading: {
      title: "Processando...",
      color: "#F5B843",
      glow: "rgba(245,184,67,.25)",
      icon: (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ),
    },
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
    reject_form: {
      title: "Rejeitar Voucher",
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
    error: "Ocorreu um erro ao processar sua ação.",
  };

  const displayMessage = message || defaultMessages[status] || "";

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
          maxWidth: 480,
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
            animation: status === "loading" ? undefined : "pulse 2s ease-in-out infinite",
          }}
        >
          {cfg.icon}
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12, letterSpacing: "-.02em", color: "#f5f5f5" }}>
          {cfg.title}
        </h1>

        {status === "reject_form" ? (
          <div style={{ textAlign: "left", marginTop: 16 }}>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "#aaa", marginBottom: 16, textAlign: "center" }}>
              Informe o motivo da rejeição antes de confirmar.
            </p>
            <label style={{ display: "block", fontSize: 13, color: "#aaa", marginBottom: 8, fontWeight: 500 }}>
              Motivo da rejeição *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={5}
              maxLength={1000}
              rows={4}
              placeholder="Descreva o motivo da rejeição..."
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "rgba(255,255,255,.06)",
                border: "1px solid rgba(255,255,255,.15)",
                borderRadius: 12,
                color: "#f5f5f5",
                fontSize: 14,
                padding: "12px 16px",
                resize: "vertical",
                fontFamily: "inherit",
                outline: "none",
              }}
            />
            <button
              onClick={handleReject}
              disabled={submitting || reason.trim().length < 5}
              style={{
                marginTop: 16,
                width: "100%",
                padding: 14,
                background: submitting || reason.trim().length < 5 ? "#555" : "linear-gradient(135deg,#DC2626,#991B1B)",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: submitting || reason.trim().length < 5 ? "not-allowed" : "pointer",
                letterSpacing: ".02em",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? "Processando..." : "Confirmar Rejeição"}
            </button>
          </div>
        ) : (
          <p style={{ fontSize: 15, lineHeight: 1.7, color: "#aaa", maxWidth: 360, margin: "0 auto" }}>
            {displayMessage}
          </p>
        )}

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
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default SupervisorConfirmacao;
