import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Lock, Eye, EyeOff, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logoZ3us from "@/assets/logo-z3us.png";
import dachserBg from "@/assets/dachser-background.jpg";

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
          Nova Senha
        </h1>
        <p className="text-[0.85rem] text-[#b9c4e0] mb-1">
          Defina a nova senha para
        </p>
        <p className="text-[0.85rem] text-[#ffc800] font-medium mb-6">
          {username}
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 text-left">
            <Label htmlFor="newPassword" className="text-[0.78rem] uppercase tracking-[0.14em] text-[#b9c4e0]">
              Nova Senha
            </Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isLoading}
                className="w-full py-2.5 px-3 pr-10 rounded-xl border border-white/[0.08] outline-none bg-[rgba(2,8,26,0.75)] text-[#f5f7ff] text-[0.9rem] transition-all duration-200 focus:border-[#ffc800] focus:shadow-[0_0_0_1px_rgba(255,200,0,0.9),0_0_20px_rgba(255,200,0,0.35)] focus:bg-[rgba(2,8,26,0.95)]"
              />
              {newPassword.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#b9c4e0] hover:text-[#f5f7ff] transition-opacity opacity-80 hover:opacity-100"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-left">
            <Label htmlFor="confirmPassword" className="text-[0.78rem] uppercase tracking-[0.14em] text-[#b9c4e0]">
              Confirmar Nova Senha
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                className="w-full py-2.5 px-3 pr-10 rounded-xl border border-white/[0.08] outline-none bg-[rgba(2,8,26,0.75)] text-[#f5f7ff] text-[0.9rem] transition-all duration-200 focus:border-[#ffc800] focus:shadow-[0_0_0_1px_rgba(255,200,0,0.9),0_0_20px_rgba(255,200,0,0.35)] focus:bg-[rgba(2,8,26,0.95)]"
              />
              {confirmPassword.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#b9c4e0] hover:text-[#f5f7ff] transition-opacity opacity-80 hover:opacity-100"
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              )}
            </div>
          </div>

          {/* Password requirements */}
          <p className={`text-[0.75rem] text-left ${newPassword.length >= 6 ? 'text-green-400' : 'text-[#b9c4e0]'}`}>
            ✓ Mínimo 6 caracteres
          </p>

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
                Alterando...
              </div>
            ) : (
              "Alterar senha"
            )}
          </Button>

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

export default ResetPassword;
