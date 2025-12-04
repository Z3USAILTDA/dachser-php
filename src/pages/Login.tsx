import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import logoZ3us from "@/assets/logo-z3us.png";
import { Eye, EyeOff, LogIn } from "lucide-react";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulação de login - substituir por autenticação real
    setTimeout(() => {
      if (email && password) {
        localStorage.setItem("user", JSON.stringify({ email, username: email.split("@")[0] }));
        toast({
          title: "Login realizado com sucesso!",
          description: "Bem-vindo ao sistema DACHSER.",
        });
        navigate("/dashboard");
      } else {
        toast({
          title: "Erro no login",
          description: "Preencha todos os campos.",
          variant: "destructive",
        });
      }
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Gradient Overlay */}
        <div 
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(circle at 10% 0%, hsl(var(--primary) / 0.18), transparent 55%),
              radial-gradient(circle at 90% 100%, hsl(var(--primary) / 0.12), transparent 55%),
              linear-gradient(180deg, rgba(0, 0, 0, 0.84), rgba(0, 0, 0, 0.95))
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

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div 
          className="bg-card/90 backdrop-blur-xl border border-border/50 rounded-2xl p-8 shadow-2xl"
          style={{
            boxShadow: `
              0 25px 50px -12px rgba(0, 0, 0, 0.9),
              0 0 40px hsl(var(--primary) / 0.15)
            `
          }}
        >
          {/* Logo & Branding */}
          <div className="text-center mb-8">
            <img 
              src={logoZ3us} 
              alt="Z3US.AI" 
              className="h-12 mx-auto mb-4 drop-shadow-[0_0_10px_rgba(245,184,67,0.5)]"
            />
            <h1 className="text-3xl font-bold tracking-[0.2em] text-foreground mb-1">DACHSER</h1>
            <p className="text-muted-foreground text-sm tracking-widest">Intelligent Logistics</p>
            <div className="flex justify-center gap-2 mt-4">
              <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
              <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
              <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-muted-foreground text-sm uppercase tracking-wider">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="seu.email@dachser.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-input border-border/50 focus:border-primary focus:ring-primary/30 h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-muted-foreground text-sm uppercase tracking-wider">
                Senha
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-input border-border/50 focus:border-primary focus:ring-primary/30 h-12 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold tracking-wider uppercase text-sm transition-all duration-300 hover:shadow-[0_0_20px_hsl(var(--primary)/0.5)]"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Entrando...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <LogIn size={18} />
                  Entrar
                </div>
              )}
            </Button>
          </form>

          {/* Footer */}
          <p className="text-center text-muted-foreground text-xs mt-8 tracking-wider">
            FOR LOGISTICS | Z3US.AI
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
