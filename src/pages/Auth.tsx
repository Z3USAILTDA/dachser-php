import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock, LogIn } from "lucide-react";
import logoZ3us from "@/assets/logo-z3us.png";

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/air/tracking");
      }
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        toast({
          title: "Cadastro realizado",
          description: "Verifique seu email para confirmar o cadastro.",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast({
          title: "Login realizado",
          description: "Bem-vindo!",
        });
        navigate("/air/tracking");
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao processar solicitação",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050608] relative overflow-hidden">
      {/* Background with gradient overlay */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `url('/dachser-background.jpg')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "saturate(0.8)",
        }}
      />
      <div
        className="absolute inset-0 z-0"
        style={{
          background: `
            radial-gradient(circle at 10% 10%, rgba(255, 200, 0, 0.18) 0%, transparent 50%),
            radial-gradient(circle at 90% 90%, rgba(255, 200, 0, 0.12) 0%, transparent 50%),
            linear-gradient(to bottom, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.82))
          `,
        }}
      />

      <Card className="relative z-10 w-full max-w-md p-8 bg-[rgba(5,6,18,0.9)] border border-white/12 backdrop-blur-xl rounded-3xl shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
        <div className="flex flex-col items-center mb-8">
          <img src={logoZ3us} alt="Z3US Logo" className="h-16 mb-4" />
          <h1 className="text-2xl font-bold text-white">
            {isSignUp ? "Criar Conta" : "Entrar"}
          </h1>
          <p className="text-white/60 text-sm mt-2">
            Sistema de Rastreio Aéreo DACHSER
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-11 bg-white/5 border-white/10 text-white placeholder:text-white/40 rounded-xl"
              required
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-11 bg-white/5 border-white/10 text-white placeholder:text-white/40 rounded-xl"
              required
            />
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-xl shadow-[0_0_20px_rgba(245,184,67,0.3)]"
          >
            <LogIn className="h-4 w-4 mr-2" />
            {isLoading ? "Processando..." : isSignUp ? "Cadastrar" : "Entrar"}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-amber-400 hover:text-amber-300 text-sm"
          >
            {isSignUp
              ? "Já tem uma conta? Entrar"
              : "Não tem conta? Cadastrar"}
          </button>
        </div>
      </Card>
    </div>
  );
};

export default Auth;
