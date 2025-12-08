import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faLock, faArrowRight, faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import dachserBackground from "@/assets/dachser-background.jpg";

const SeaAnalysis = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("sea.analises@dachser.com");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  // Redirect if already logged in
  useEffect(() => {
    if (user && !isLoading) {
      navigate("/maritimo");
    }
  }, [user, isLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      return;
    }

    setSubmitting(true);
    // Simulate login - replace with actual auth logic
    setTimeout(() => {
      setSubmitting(false);
    }, 1000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden">
      {/* Background with gradient overlays */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: `
            radial-gradient(circle at 10% 10%, rgba(255,200,0,0.18) 0%, transparent 35%),
            radial-gradient(circle at 90% 90%, rgba(255,200,0,0.12) 0%, transparent 40%),
            linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.82) 100%),
            url(${dachserBackground})
          `,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "saturate(0.8)",
        }}
      />

      {/* Animated background lines */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <svg className="absolute inset-0 w-full h-full opacity-10">
          <defs>
            <linearGradient id="lineGradientSea" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgb(245, 184, 67)" stopOpacity="0" />
              <stop offset="50%" stopColor="rgb(245, 184, 67)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="rgb(245, 184, 67)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[...Array(5)].map((_, i) => (
            <line
              key={i}
              x1={`${i * 25}%`}
              y1="0"
              x2={`${i * 25 + 50}%`}
              y2="100%"
              stroke="url(#lineGradientSea)"
              strokeWidth="1"
              className="animate-pulse"
              style={{ animationDelay: `${i * 0.5}s` }}
            />
          ))}
        </svg>
      </div>

      {/* Floating particles */}
      <div className="pointer-events-none fixed inset-0 z-0">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-primary/30 rounded-full animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      {/* Back Button */}
      <button
        onClick={() => navigate("/dashboard")}
        className="absolute top-6 left-6 z-20 inline-flex items-center gap-2 px-3.5 py-2.5 rounded-full border border-primary/90 bg-primary/15 text-primary no-underline font-bold text-sm backdrop-blur-sm hover:bg-primary/25 transition-colors"
      >
        <FontAwesomeIcon icon={faArrowLeft} />
        Voltar
      </button>

      <div className="w-full max-w-md relative z-10">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Z3US</h1>
          <p className="text-muted-foreground">Sistema Marítimo</p>
        </div>

        {/* Login Form */}
        <div 
          className="rounded-2xl p-8"
          style={{
            background: "rgba(5, 6, 18, 0.9)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            boxShadow: "0 18px 40px rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(18px)",
          }}
        >
          <h2 className="text-2xl font-bold text-foreground mb-6">Login</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-muted-foreground">
                Email
              </Label>
              <div className="relative">
                <FontAwesomeIcon 
                  icon={faEnvelope} 
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground z-10"
                />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  disabled={submitting}
                  className="pl-12 h-12"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-muted-foreground">
                Senha
              </Label>
              <div className="relative">
                <FontAwesomeIcon 
                  icon={faLock} 
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground z-10"
                />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={submitting}
                  className="pl-12 h-12"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting || !email || !password}
              className="w-full h-12 font-semibold"
            >
              <FontAwesomeIcon icon={faArrowRight} className="mr-2" />
              {submitting ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-muted-foreground text-sm">
          © 2024 Z3US Maritime System
        </div>
      </div>
    </div>
  );
};

export default SeaAnalysis;
