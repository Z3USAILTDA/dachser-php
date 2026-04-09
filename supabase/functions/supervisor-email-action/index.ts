import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const APP_URL = "https://dachser.z3us.app";

async function callProxy(action: string, body: Record<string, any>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/mariadb-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action, ...body }),
  });
  return res.json();
}

function redirect(status: string, msg?: string): Response {
  const params = new URLSearchParams({ status });
  if (msg) params.set("msg", msg);
  return new Response(null, {
    status: 303,
    headers: { "Location": `${APP_URL}/supervisor-confirmacao?${params.toString()}` },
  });
}

const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const action = url.searchParams.get("action");

  if (!token || !action || !["approve", "reject"].includes(action)) {
    return redirect("error", "Link invalido ou parametros ausentes.");
  }

  try {
    const validation = await callProxy("validate_supervisor_token", { token });

    if (!validation.success) {
      const messages: Record<string, string> = {
        NOT_FOUND: "Este link nao e valido ou ja foi removido.",
        ALREADY_USED: "Este link ja foi utilizado anteriormente.",
        EXPIRED: "Este link expirou (validade de 48h). Acesse o sistema para realizar a acao.",
      };
      const msg = messages[validation.code] || validation.error || "Erro ao validar o link.";
      return redirect("error", msg);
    }

    const { voucher_id, action_type } = validation;

    if ((action === "approve" && action_type !== "APPROVE") || (action === "reject" && action_type !== "REJECT")) {
      return redirect("error", "O tipo de acao nao corresponde ao token.");
    }

    if (action === "approve") {
      await callProxy("update_voucher_esteira", {
        voucher_id,
        etapa_atual: "FINANCEIRO",
        status_financeiro: "APROVADO",
        aprovado_por_user_id: "0",
        responsavel_supervisor_user_id: "0",
      });

      await callProxy("save_voucher_log", {
        voucher_id,
        user_id: "0",
        user_name: "Supervisor (via e-mail)",
        acao: "APROVADO_SUPERVISOR",
        detalhe: "Voucher/SPO urgente aprovado via link do e-mail",
      });

      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-voucher-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "apikey": SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            type: "VOUCHER_ENVIADO",
            voucherId: voucher_id,
            voucherNumber: voucher_id,
            toStage: "FINANCEIRO",
            fromStage: "SUPERVISOR",
            senderName: "Supervisor (via e-mail)",
          }),
        });
      } catch (e) {
        console.log("Email notification to FINANCEIRO skipped:", e);
      }

      await callProxy("mark_supervisor_token_used", { token });
      return redirect("approved");
    } else {
      await callProxy("update_voucher_esteira", {
        voucher_id,
        etapa_atual: "OPERACAO",
        status_financeiro: "REJEITADO",
        ajuste_operacao: "REJEITADO PELO SUPERVISOR via e-mail",
        responsavel_supervisor_user_id: "0",
      });

      await callProxy("save_voucher_log", {
        voucher_id,
        user_id: "0",
        user_name: "Supervisor (via e-mail)",
        acao: "REJEITADO_SUPERVISOR",
        detalhe: "Voucher/SPO rejeitado via link do e-mail",
      });

      await callProxy("mark_supervisor_token_used", { token });
      return redirect("rejected");
    }
  } catch (error: any) {
    console.error("Error in supervisor-email-action:", error);
    return redirect("error", "Ocorreu um erro ao processar sua acao. Tente novamente.");
  }
};

serve(handler);
