import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, UserPlus, LogIn } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logoZ3us from "@/assets/logo-z3us.png";
import dachserBackground from "@/assets/dachser-background.jpg";

const Register = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username || !formData.email || !formData.password) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos.",
        variant: "destructive",
      });
      return;
    }

    if (formData.password.length < 6) {
      toast({
        title: "Erro",
        description: "A senha deve ter no mínimo 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // 1. Register user in MariaDB
      const { data: registerData, error: registerError } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'register_user',
          username: formData.username,
          email: formData.email,
          password: formData.password
        }
      });

      if (registerError || !registerData?.success) {
        const errorMsg = registerData?.error || registerError?.message || 'Erro ao cadastrar usuário';
        toast({
          title: "Erro",
          description: errorMsg,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // 2. Send welcome email with credentials
      const { data: emailData, error: emailError } = await supabase.functions.invoke('send-welcome-email', {
        body: {
          email: formData.email,
          username: formData.username,
          password: formData.password
        }
      });

      if (emailError || !emailData?.success) {
        console.warn('Email sending failed:', emailError || emailData?.error);
        // Still show success but warn about email
        toast({
          title: "Usuário cadastrado",
          description: "Usuário criado, mas houve um problema ao enviar o e-mail de boas-vindas.",
        });
      } else {
        toast({
          title: "Sucesso",
          description: "Usuário cadastrado e e-mail de boas-vindas enviado!",
        });
      }

      setFormData({ username: "", email: "", password: "" });
    } catch (error) {
      console.error('Registration error:', error);
      toast({
        title: "Erro",
        description: "Erro ao cadastrar usuário.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden">
      {/* Background with image and gradient overlay */}
      <div className="absolute inset-0 z-0">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${dachserBackground})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div 
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(120deg, rgba(4, 17, 45, 0.92), rgba(26, 93, 173, 0.55))',
          }}
        />
        
        {/* Radial gradient overlay */}
        <div 
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse at 20% 20%, rgba(245, 184, 67, 0.12) 0%, transparent 50%),
              radial-gradient(ellipse at 80% 80%, rgba(245, 184, 67, 0.08) 0%, transparent 50%)
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

      {/* Back Button */}
      <div className="fixed top-[18px] left-[18px] z-50">
        <button
          onClick={() => navigate("/dashboard")}
          className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.12)] bg-[rgba(5,6,18,0.9)] text-[#aaaaaa] flex items-center justify-center backdrop-blur-sm hover:bg-[rgba(5,6,18,1)] hover:text-white transition-all"
        >
          <ArrowLeft size={16} />
        </button>
      </div>

      {/* Register Card */}
      <div 
        className="relative z-10 w-full max-w-[480px] mx-4 p-[30px] rounded-[22px] text-left animate-in fade-in slide-in-from-bottom-4 duration-700 overflow-hidden"
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
          className="w-[170px] mx-auto mb-[18px] drop-shadow-[0_0_6px_rgba(0,0,0,0.6)]"
        />

        {/* Header */}
        <h1 
          className="font-semibold mb-1"
          style={{ 
            fontSize: 'clamp(1.2rem, 2.4vw, 1.5rem)',
            color: '#f5f7ff',
          }}
        >
          Cadastro de Usuário
        </h1>
        <p 
          className="text-[0.78rem] mb-[14px]"
          style={{ color: '#b9c4e0' }}
        >
          Crie um novo acesso para o time DACHSER.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-[14px] mt-1">
          {/* Username Field */}
          <div className="flex flex-col gap-[6px]">
            <label 
              htmlFor="username"
              className="text-[0.78rem] uppercase tracking-[0.14em]"
              style={{ color: '#b9c4e0' }}
            >
              Usuário
            </label>
            <input
              id="username"
              type="text"
              placeholder="ex.: joao.silva"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full px-3 py-[10px] rounded-[12px] text-[0.9rem] outline-none transition-all"
              style={{
                background: 'rgba(2, 8, 26, 0.75)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#f5f7ff',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#ffc800';
                e.target.style.boxShadow = '0 0 0 1px rgba(255, 200, 0, 0.9), 0 0 20px rgba(255, 200, 0, 0.35)';
                e.target.style.background = 'rgba(2, 8, 26, 0.95)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.target.style.boxShadow = 'none';
                e.target.style.background = 'rgba(2, 8, 26, 0.75)';
              }}
            />
          </div>

          {/* Email Field */}
          <div className="flex flex-col gap-[6px]">
            <label 
              htmlFor="email"
              className="text-[0.78rem] uppercase tracking-[0.14em]"
              style={{ color: '#b9c4e0' }}
            >
              E-mail
            </label>
            <input
              id="email"
              type="email"
              placeholder="nome@empresa.com.br"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-[10px] rounded-[12px] text-[0.9rem] outline-none transition-all"
              style={{
                background: 'rgba(2, 8, 26, 0.75)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#f5f7ff',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#ffc800';
                e.target.style.boxShadow = '0 0 0 1px rgba(255, 200, 0, 0.9), 0 0 20px rgba(255, 200, 0, 0.35)';
                e.target.style.background = 'rgba(2, 8, 26, 0.95)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.target.style.boxShadow = 'none';
                e.target.style.background = 'rgba(2, 8, 26, 0.75)';
              }}
            />
          </div>

          {/* Password Field */}
          <div className="flex flex-col gap-[6px]">
            <label 
              htmlFor="password"
              className="text-[0.78rem] uppercase tracking-[0.14em]"
              style={{ color: '#b9c4e0' }}
            >
              Senha Inicial
            </label>
            <input
              id="password"
              type="password"
              placeholder="mín. 6 caracteres"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-3 py-[10px] rounded-[12px] text-[0.9rem] outline-none transition-all"
              style={{
                background: 'rgba(2, 8, 26, 0.75)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#f5f7ff',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#ffc800';
                e.target.style.boxShadow = '0 0 0 1px rgba(255, 200, 0, 0.9), 0 0 20px rgba(255, 200, 0, 0.35)';
                e.target.style.background = 'rgba(2, 8, 26, 0.95)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.target.style.boxShadow = 'none';
                e.target.style.background = 'rgba(2, 8, 26, 0.75)';
              }}
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-[11px] px-[14px] rounded-full font-semibold text-[0.9rem] uppercase tracking-[0.08em] mt-1 inline-flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            style={{
              color: '#041021',
              background: 'linear-gradient(135deg, #ffc800, #ffe680)',
              boxShadow: '0 10px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(255, 200, 0, 0.7)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 14px 30px rgba(0, 0, 0, 0.8), 0 0 22px rgba(255, 200, 0, 0.95)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(255, 200, 0, 0.7)';
            }}
          >
            <UserPlus className="w-4 h-4" />
            {isLoading ? "Cadastrando..." : "Cadastrar Usuário"}
          </button>

          {/* Secondary Button */}
          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-full py-[10px] px-[14px] rounded-full text-[0.84rem] inline-flex items-center justify-center gap-2 transition-all mt-2"
            style={{
              background: 'rgba(4, 10, 30, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              color: '#f5f7ff',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(4, 10, 30, 0.9)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(4, 10, 30, 0.7)';
            }}
          >
            <LogIn className="w-4 h-4" />
            Ir para tela de login
          </button>

          {/* Meta Info */}
          <p 
            className="text-[0.72rem] mt-[10px]"
            style={{ color: '#b9c4e0' }}
          >
            Após o cadastro, o usuário receberá um e-mail com orientações de primeiro acesso.
          </p>

          {/* Copyright */}
          <div 
            className="text-[0.7rem] text-right mt-[14px]"
            style={{ color: '#b9c4e0' }}
          >
            powered by <span className="font-semibold" style={{ color: '#ffc800' }}>Z3US.AI</span>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
