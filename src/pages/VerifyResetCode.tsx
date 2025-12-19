import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo-z3us.png";

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
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").trim();
    
    // If pasted data is 6 digits, fill all inputs
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

      setResendCooldown(60); // 60 seconds cooldown
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

      // Navigate to reset password page with user data
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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-[#0b0b0b] via-[#0d0d12] to-[#1a1a2e]">
      {/* Background effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-primary/[0.02] to-primary/[0.05]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,transparent_45%,rgba(255,165,0,0.03)_50%,transparent_55%)]" />
        
        {/* Animated lines */}
        <svg className="absolute inset-0 w-full h-full opacity-20" preserveAspectRatio="none">
          <defs>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="50%" stopColor="currentColor" className="text-primary/20" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
          <line x1="10%" y1="0" x2="90%" y2="100%" stroke="url(#lineGradient)" strokeWidth="0.5">
            <animate attributeName="x1" values="10%;15%;10%" dur="10s" repeatCount="indefinite" />
          </line>
          <line x1="30%" y1="0" x2="70%" y2="100%" stroke="url(#lineGradient)" strokeWidth="0.5">
            <animate attributeName="x1" values="30%;25%;30%" dur="8s" repeatCount="indefinite" />
          </line>
        </svg>
        
        {/* Floating particles */}
        <div className="absolute top-1/4 left-1/4 w-1 h-1 bg-primary/30 rounded-full animate-pulse" />
        <div className="absolute top-3/4 right-1/3 w-1.5 h-1.5 bg-primary/20 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }} />
        <div className="absolute top-1/2 right-1/4 w-0.5 h-0.5 bg-primary/40 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="w-full max-w-md mx-4 z-10">
        <div className="bg-card/90 backdrop-blur-md border border-border/50 rounded-2xl shadow-2xl shadow-primary/5 p-8">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img src={logo} alt="Z3US Logo" className="h-16 w-auto" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-semibold text-foreground text-center mb-2">
            Verificar Código
          </h1>
          <p className="text-muted-foreground text-center text-sm mb-6">
            Digite o código de 6 dígitos enviado para<br />
            <span className="text-primary font-medium">{email}</span>
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Code inputs */}
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
                  className="w-12 h-14 text-center text-xl font-semibold bg-background/50 border-border/50 focus:border-primary/50"
                />
              ))}
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg transition-all duration-200"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                "Verificar código"
              )}
            </Button>
          </form>

          {/* Resend code */}
          <div className="mt-4 text-center">
            <button
              onClick={handleResendCode}
              disabled={isResending || resendCooldown > 0}
              className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-4 w-4" />
              )}
              {resendCooldown > 0 
                ? `Reenviar em ${resendCooldown}s` 
                : "Reenviar código"
              }
            </button>
          </div>

          {/* Back to login */}
          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Voltar para o login
            </Link>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/50 mt-6">
          Powered by <span className="text-primary/70">Z3US.AI</span>
        </p>
      </div>
    </div>
  );
};

export default VerifyResetCode;
