import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import dachserBackground from "@/assets/dachser-background.jpg";

const SeaAnalysis = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen relative overflow-hidden">
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

      {/* Main Content */}
      <div className="relative z-10 p-6 pt-20">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Z3US</h1>
          <p className="text-muted-foreground">Análises Marítimas</p>
        </div>

        {/* Content Placeholder */}
        <div className="max-w-6xl mx-auto">
          <div 
            className="rounded-2xl p-8"
            style={{
              background: "rgba(5, 6, 18, 0.9)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              boxShadow: "0 18px 40px rgba(0, 0, 0, 0.85)",
              backdropFilter: "blur(18px)",
            }}
          >
            <h2 className="text-2xl font-bold text-foreground mb-6">Análise Comparativa - 3 Cenários</h2>
            <p className="text-muted-foreground">Conteúdo da análise marítima será implementado aqui.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-muted-foreground text-sm">
          © 2024 Z3US Maritime System
        </div>
      </div>
    </div>
  );
};

export default SeaAnalysis;
