import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logoZ3us from "@/assets/logo-z3us.png";
import dachserBg from "@/assets/dachser-background.jpg";

const VerifyResetCode = () => {
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const email = location.state?.email;

  useEffect(() => {
    if (!email) {
      navigate("/forgot-password");
    }
  }, [email, navigate]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").trim();
    
    if (/^\d{6}$/.test(pastedData)) {
      const newCode = pastedData.split("");
      setCode(newCode);
      inputRefs.current[5]?.focus();
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;

    setIsResending(true);

    try {
      const { data, error } = await supabase.functions.invoke("send-password-reset-code", {
        body: { email },
      });

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      toast({
        title: "Código reenviado",
        description: "Verifique sua caixa de entrada e spam.",
      });

      setResendCooldown(60);
    } catch (err: unknown) {
      console.error("Error resending code:", err);
      toast({
        title: "Erro",
        description: "Erro ao reenviar código. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const fullCode = code.join("");

    if (fullCode.length !== 6) {
      toast({
        title: "Código incompleto",
        description: "Por favor, digite o código de 6 dígitos.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "verify_reset_code", email, code: fullCode },
      });

      if (error) throw new Error(error.message);

      if (data.error) {
        throw new Error(data.error);
      }

      if (!data.success || !data.user) {
        throw new Error("Código inválido ou expirado");
      }

      toast({
        title: "Código verificado",
        description: "Agora você pode definir sua nova senha.",
      });

      navigate("/reset-password", { 
        state: { 
          email, 
          username: data.user.username,
          userId: data.user.id 
        } 
      });
    } catch (err: unknown) {
      console.error("Error verifying code:", err);
      toast({
        title: "Código inválido",
        description: err instanceof Error ? err.message : "O código digitado é inválido ou expirou.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!email) return null;

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background Image - Same as Login */}
      <div className="fixed inset-0">
        <img 
          src={dachserBg} 
          alt="DACHSER Logistics" 
          className="w-full h-full object-cover"
          style={{ filter: 'saturate(0.8)' }}
        />
        <div 
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(120deg, rgba(4, 17, 45, 0.92), rgba(26, 93, 173, 0.55)),
              linear-gradient(180deg, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.82))
            `
          }}
        />
        
        {/* Animated Lines */}
        <div className="absolute inset-0 opacity-20">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute h-full w-px bg-gradient-to-b from-primary/70 to-primary/10"
              style={{
                left: `${15 + i * 14}%`,
                transform: `skewX(${-20 + i * 8}deg)`,
              }}
            />
          ))}
        </div>

        {/* Floating Particles */}
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-primary/40 animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${4 + Math.random() * 4}s`,
            }}
          />
        ))}
      </div>

      {/* Card */}
      <div 
        className="relative z-10 w-full max-w-[420px] mx-4 p-8 rounded-[22px] text-center animate-in fade-in slide-in-from-bottom-4 duration-700 overflow-hidden"
        style={{
          background: 'rgba(4, 10, 30, 0.75)',
          boxShadow: '0 22px 60px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(18px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Animated Border Glow */}
        <div 
          className="absolute inset-[-2px] rounded-[24px] opacity-35 blur-[8px] animate-spin pointer-events-none"
          style={{
            background: 'conic-gradient(from 180deg, rgba(26, 93, 173, 0), rgba(26, 93, 173, 0.7), rgba(255, 200, 0, 0.6), rgba(26, 93, 173, 0.7), rgba(26, 93, 173, 0))',
            animationDuration: '18s',
            zIndex: -1,
          }}
        />

        {/* Logo */}
        <img 
          src={logoZ3us} 
          alt="Z3US.AI" 
          className="w-[180px] mx-auto mb-6 drop-shadow-[0_0_6px_rgba(0,0,0,0.6)]"
        />

        {/* Title */}
        <h1 className="text-[1.4rem] font-semibold text-[#f5f7ff] mb-2">
          Verificar Código
        </h1>
        <p className="text-[0.85rem] text-[#b9c4e0] mb-1">
          Digite o código de 6 dígitos enviado para
        </p>
        <p className="text-[0.85rem] text-[#ffc800] font-medium mb-6">
          {email}
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[0.78rem] uppercase tracking-[0.14em] text-[#b9c4e0] text-left">
              Código de Verificação
            </Label>
            <div className="flex justify-center gap-2" onPaste={handlePaste}>
              {code.map((digit, index) => (
                <Input
                  key={index}
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  disabled={isLoading}
                  className="w-11 h-14 text-center text-xl font-semibold rounded-xl border border-white/[0.08] outline-none bg-[rgba(2,8,26,0.75)] text-[#f5f7ff] transition-all duration-200 focus:border-[#ffc800] focus:shadow-[0_0_0_1px_rgba(255,200,0,0.9),0_0_20px_rgba(255,200,0,0.35)] focus:bg-[rgba(2,8,26,0.95)]"
                />
              ))}
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 mt-2 rounded-full border-none cursor-pointer font-semibold text-[0.92rem] tracking-[0.08em] uppercase text-[#041021] transition-all duration-150 hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(135deg, #ffc800, #ffe680)',
              boxShadow: '0 10px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(255, 200, 0, 0.7)',
            }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Verificando...
              </div>
            ) : (
              "Verificar código"
            )}
          </Button>

          {/* Resend code */}
          <button
            type="button"
            onClick={handleResendCode}
            disabled={isResending || resendCooldown > 0}
            className="flex items-center justify-center gap-1.5 text-[0.78rem] text-[#b9c4e0] hover:text-[#ffc800] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isResending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {resendCooldown > 0 
              ? `Reenviar em ${resendCooldown}s` 
              : "Reenviar código"
            }
          </button>

          <Link
            to="/login"
            className="mt-2 flex items-center justify-center gap-1.5 text-[0.78rem] text-[#b9c4e0] hover:text-[#ffc800] transition-colors"
          >
            <ArrowLeft size={14} />
            Voltar para o login
          </Link>

          <p className="mt-3 text-[0.7rem] text-[#b9c4e0] text-right">
            powered by <span className="text-[#ffc800] font-semibold">Z3US.AI</span>
          </p>
        </form>
      </div>
    </div>
  );
};

export default VerifyResetCode;
