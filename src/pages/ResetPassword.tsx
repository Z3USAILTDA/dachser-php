import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Lock, Eye, EyeOff, ArrowLeft, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo-z3us.png";

const ResetPassword = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const email = location.state?.email;
  const username = location.state?.username;

  useEffect(() => {
    if (!email || !username) {
      navigate("/forgot-password");
    }
  }, [email, username, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha todos os campos.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Senha muito curta",
        description: "A senha deve ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Senhas não conferem",
        description: "A nova senha e a confirmação devem ser iguais.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "reset_password_by_email", email, password: newPassword },
      });

      if (error) throw new Error(error.message);

      if (data.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Senha alterada com sucesso!",
        description: "Você já pode fazer login com sua nova senha.",
      });

      // Navigate to login
      navigate("/login");
    } catch (err: unknown) {
      console.error("Error resetting password:", err);
      toast({
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro ao alterar senha.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!email || !username) return null;

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
            Nova Senha
          </h1>
          <p className="text-muted-foreground text-center text-sm mb-1">
            Defina a nova senha para
          </p>
          <p className="text-primary text-center text-sm font-medium mb-6">
            {username}
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* New Password */}
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Nova senha"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isLoading}
                className="pl-10 pr-10 h-12 bg-background/50 border-border/50 focus:border-primary/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Confirm Password */}
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirmar nova senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                className="pl-10 pr-10 h-12 bg-background/50 border-border/50 focus:border-primary/50"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Password requirements */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className={`h-4 w-4 ${newPassword.length >= 6 ? 'text-green-500' : 'text-muted-foreground/50'}`} />
              <span className={newPassword.length >= 6 ? 'text-green-500' : ''}>
                Mínimo 6 caracteres
              </span>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg transition-all duration-200"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Alterando...
                </>
              ) : (
                "Alterar senha"
              )}
            </Button>
          </form>

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

export default ResetPassword;
