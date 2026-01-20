import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FlaskConical, Play, CheckCircle2, XCircle, Clock, Loader2, Calendar } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import dachserBg from "@/assets/dachser-background.jpg";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AttemptTimeline, AttemptLog } from "@/components/cct/AttemptTimeline";

interface TestResult {
  success: boolean;
  hawb: string;
  original_dep_date: string;
  matched_date: string | null;
  offset_days: number;
  total_attempts: number;
  total_time_ms: number;
  attempts: AttemptLog[];
  data?: any;
}

export default function LeadcomexTestPage() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Form state
  const [hawb, setHawb] = useState("");
  const [depDate, setDepDate] = useState("");
  const [maxRetries, setMaxRetries] = useState(7);

  // Test state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [attempts, setAttempts] = useState<AttemptLog[]>([]);

  // Check admin access
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const user = storedUser ? JSON.parse(storedUser) : null;
    const adminStatus = user?.is_admin === 1 || user?.is_admin === "1" || user?.is_admin === true;
    
    if (!adminStatus) {
      toast.error("Acesso restrito a administradores");
      navigate("/air/cct");
      return;
    }
    
    setIsAdmin(true);
    setIsLoading(false);
  }, [navigate]);

  const handleTest = async () => {
    if (!hawb.trim()) {
      toast.error("Informe o HAWB");
      return;
    }
    if (!depDate) {
      toast.error("Informe a data DEP");
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setAttempts([]);

    try {
      const { data, error } = await supabase.functions.invoke('leadcomex-test-reverse', {
        body: {
          hawb: hawb.trim(),
          dep_date: depDate,
          max_retries: maxRetries,
        },
      });

      if (error) throw error;

      setTestResult(data);
      setAttempts(data.attempts || []);

      if (data.success) {
        toast.success(`Encontrado com offset de ${data.offset_days} dia(s)`);
      } else {
        toast.warning("Não encontrado após todas as tentativas");
      }
    } catch (error) {
      console.error('Erro no teste:', error);
      toast.error(error instanceof Error ? error.message : "Erro ao executar teste");
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#04112d]">
        <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      {/* Background */}
      <div className="fixed inset-0 z-0">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${dachserBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div 
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(120deg, rgba(4, 17, 45, 0.95), rgba(26, 93, 173, 0.6))',
          }}
        />
      </div>

      {/* Header */}
      <div className="relative z-10 max-w-[95%] mx-auto px-2 pt-5 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/air/cct")}
            className="w-8 h-8 rounded-full border border-white/12 bg-[rgba(5,6,18,0.9)] text-white/80 flex items-center justify-center backdrop-blur-sm hover:bg-[rgba(5,6,18,1)] hover:text-white transition-all"
          >
            <ArrowLeft size={16} />
          </button>

          <header>
            <h1 className="text-[1.4rem] tracking-[0.2em] uppercase text-[#f5f5f5] flex items-center gap-3">
              <FlaskConical className="h-5 w-5 text-amber-400" />
              Teste LeadComex
            </h1>
            <p className="text-[0.85rem] text-[#aaaaaa] mt-0.5">
              Escada Reversa de Datas — Admin Only
            </p>
          </header>
        </div>

        <span className="px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/40 text-[0.75rem] font-medium">
          🔒 Admin
        </span>
      </div>

      {/* Content */}
      <main className="relative z-10 max-w-4xl mx-auto px-4 pb-8">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Form Card */}
          <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-amber-400" />
                Configuração do Teste
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="hawb" className="text-white/80">HAWB</Label>
                <Input
                  id="hawb"
                  placeholder="Ex: HAJ15863185"
                  value={hawb}
                  onChange={(e) => setHawb(e.target.value.toUpperCase())}
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/40"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dep_date" className="text-white/80">Data DEP (Decolagem)</Label>
                <Input
                  id="dep_date"
                  type="date"
                  value={depDate}
                  onChange={(e) => setDepDate(e.target.value)}
                  className="bg-white/5 border-white/20 text-white"
                />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <Label className="text-white/80">Máximo de Tentativas</Label>
                  <span className="text-amber-400 font-mono text-sm">{maxRetries} dias</span>
                </div>
                <Slider
                  value={[maxRetries]}
                  onValueChange={([value]) => setMaxRetries(value)}
                  min={1}
                  max={15}
                  step={1}
                  className="py-2"
                />
                <p className="text-xs text-white/40">
                  A API LeadComex só permite consultas dos últimos 15 dias
                </p>
              </div>

              <Button
                onClick={handleTest}
                disabled={isTesting}
                className="w-full bg-amber-500 hover:bg-amber-600 text-black font-medium"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Testando...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Iniciar Teste
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Result Summary Card */}
          {testResult && (
            <Card className={`border ${testResult.success ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
              <CardHeader>
                <CardTitle className="text-white text-lg flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <XCircle className="h-5 w-5 text-rose-400" />
                  )}
                  Resultado do Teste
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-white/50 uppercase tracking-wider">HAWB</span>
                    <p className="text-white font-mono text-sm">{testResult.hawb}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-white/50 uppercase tracking-wider">Data Original</span>
                    <p className="text-white font-mono text-sm">
                      {new Date(testResult.original_dep_date).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  {testResult.matched_date && (
                    <>
                      <div className="space-y-1">
                        <span className="text-xs text-white/50 uppercase tracking-wider">Data Match</span>
                        <p className="text-emerald-400 font-mono text-sm">
                          {new Date(testResult.matched_date).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-white/50 uppercase tracking-wider">Offset</span>
                        <p className="text-amber-400 font-mono text-sm font-bold">
                          -{testResult.offset_days} dia(s)
                        </p>
                      </div>
                    </>
                  )}
                  <div className="space-y-1">
                    <span className="text-xs text-white/50 uppercase tracking-wider">Tentativas</span>
                    <p className="text-white font-mono text-sm">{testResult.total_attempts}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-white/50 uppercase tracking-wider">Tempo Total</span>
                    <p className="text-white font-mono text-sm">
                      {(testResult.total_time_ms / 1000).toFixed(2)}s
                    </p>
                  </div>
                </div>

                {/* LeadComex Data Preview */}
                {testResult.data && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <span className="text-xs text-white/50 uppercase tracking-wider mb-2 block">
                      Dados LeadComex
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white/5 rounded p-2">
                        <span className="text-white/50">Situação:</span>
                        <span className="ml-2 text-white">
                          {testResult.data.identificacao?.situacaoLead || 'N/A'}
                        </span>
                      </div>
                      <div className="bg-white/5 rounded p-2">
                        <span className="text-white/50">Peso:</span>
                        <span className="ml-2 text-white">
                          {testResult.data.conhecimentoCargaDetalhada?.pesoBruto || 
                           testResult.data.conhecimentoCargaDetalhada?.pesoBrutoConhecimento || 'N/A'} kg
                        </span>
                      </div>
                      <div className="bg-white/5 rounded p-2">
                        <span className="text-white/50">Volumes:</span>
                        <span className="ml-2 text-white">
                          {testResult.data.conhecimentoCargaDetalhada?.quantidadeVolumes || 
                           testResult.data.conhecimentoCargaDetalhada?.quantidadeVolumesConhecimento || 'N/A'}
                        </span>
                      </div>
                      <div className="bg-white/5 rounded p-2">
                        <span className="text-white/50">Bloqueios:</span>
                        <span className="ml-2 text-white">
                          {testResult.data.conhecimentoCargaDetalhada?.bloqueiosAtivos?.length || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Timeline Section */}
        {(attempts.length > 0 || isTesting) && (
          <Card className="mt-6 bg-[rgba(5,6,18,0.9)] border-white/12">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-400" />
                Timeline de Tentativas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AttemptTimeline attempts={attempts} isProcessing={isTesting} />
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
