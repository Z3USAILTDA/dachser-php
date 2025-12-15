import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logoZ3us from "@/assets/logo-z3us.png";
import dachserBg from "@/assets/dachser-background.jpg";
import { Eye, EyeOff, Lock } from "lucide-react";

const ChangePassword = () => {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) {
      navigate("/login");
      return;
    }
    const userData = JSON.parse(storedUser);
    if (!userData.must_change_password) {
      navigate("/dashboard");
      return;
    }
    setUser(userData);
  }, [navigate]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Erro",
        description: "A senha deve ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "change_password", userId: user.id, password: newPassword },
      });

      if (error) throw new Error(error.message || "Erro ao conectar");

      if (data.error) {
        toast({
          title: "Erro",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      if (data.success) {
        // Update local storage to remove must_change_password flag
        const updatedUser = { ...user, must_change_password: 0 };
        localStorage.setItem("user", JSON.stringify(updatedUser));

        toast({
          title: "Senha alterada com sucesso!",
          description: "Você será redirecionado...",
        });

        setTimeout(() => {
          if (user.olimpo_only === 1) {
            navigate("/olimpo");
          } else if (user.metrics_only === 1) {
            navigate("/admin/metrics");
          } else {
            navigate("/dashboard");
          }
        }, 1500);
      }
    } catch (error) {
      console.error("Change password error:", error);
      toast({
        title: "Erro",
        description: "Não foi possível alterar a senha.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background Image */}
      <div className="fixed inset-0">
        <img
          src={dachserBg}
          alt="DACHSER Logistics"
          className="w-full h-full object-cover"
          style={{ filter: "saturate(0.8)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(120deg, rgba(4, 17, 45, 0.92), rgba(26, 93, 173, 0.55)),
              linear-gradient(180deg, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.82))
            `,
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

      {/* Change Password Card */}
      <div
        className="relative z-10 w-full max-w-[420px] mx-4 p-8 rounded-[22px] text-center animate-in fade-in slide-in-from-bottom-4 duration-700 overflow-hidden"
        style={{
          background: "rgba(4, 10, 30, 0.75)",
          boxShadow: "0 22px 60px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.03)",
          backdropFilter: "blur(18px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        {/* Animated Border Glow */}
        <div
          className="absolute inset-[-2px] rounded-[24px] opacity-35 blur-[8px] animate-spin pointer-events-none"
          style={{
            background:
              "conic-gradient(from 180deg, rgba(26, 93, 173, 0), rgba(26, 93, 173, 0.7), rgba(255, 200, 0, 0.6), rgba(26, 93, 173, 0.7), rgba(26, 93, 173, 0))",
            animationDuration: "18s",
            zIndex: -1,
          }}
        />

        {/* Logo */}
        <img
          src={logoZ3us}
          alt="Z3US.AI"
          className="w-[180px] mx-auto mb-4 drop-shadow-[0_0_6px_rgba(0,0,0,0.6)]"
        />

        {/* Icon & Title */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <Lock className="w-5 h-5 text-[#ffc800]" />
          <h1 className="text-xl font-semibold text-white">Alterar Senha</h1>
        </div>
        <p className="text-[#b9c4e0] text-sm mb-6">
          Olá, <span className="text-[#ffc800] font-medium">{user.username}</span>! Por segurança, altere sua senha no primeiro acesso.
        </p>

        {/* Form */}
        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 text-left">
            <Label htmlFor="newPassword" className="text-[0.78rem] uppercase tracking-[0.14em] text-[#b9c4e0]">
              Nova Senha
            </Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full py-2.5 px-3 pr-10 rounded-xl border border-white/[0.08] outline-none bg-[rgba(2,8,26,0.75)] text-[#f5f7ff] text-[0.9rem] transition-all duration-200 focus:border-[#ffc800] focus:shadow-[0_0_0_1px_rgba(255,200,0,0.9),0_0_20px_rgba(255,200,0,0.35)] focus:bg-[rgba(2,8,26,0.95)]"
              />
              {newPassword.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#b9c4e0] hover:text-[#f5f7ff] transition-opacity opacity-80 hover:opacity-100"
                >
                  {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
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

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 mt-2 rounded-full border-none cursor-pointer font-semibold text-[0.92rem] tracking-[0.08em] uppercase text-[#041021] transition-all duration-150 hover:-translate-y-0.5"
            style={{
              background: "linear-gradient(135deg, #ffc800, #ffe680)",
              boxShadow: "0 10px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(255, 200, 0, 0.7)",
            }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-[#041021]/30 border-t-[#041021] rounded-full animate-spin" />
                Salvando...
              </div>
            ) : (
              "Salvar Nova Senha"
            )}
          </Button>

          <p className="mt-3 text-[0.7rem] text-[#b9c4e0] text-right">
            powered by <span className="text-[#ffc800] font-semibold">Z3US.AI</span>
          </p>
        </form>
      </div>
    </div>
  );
};

export default ChangePassword;
