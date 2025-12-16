import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import Dashboard from "./pages/Dashboard";
import MetricsUsage from "./pages/MetricsUsage";
import Register from "./pages/Register";
import CheckAwb from "./pages/CheckAwb";
import Logs from "./pages/Logs";
import Index from "./pages/Index";
import SeaAnalysis from "./pages/SeaAnalysis";
import ContainerTracking from "./pages/ContainerTracking";
import CadastroHbl from "./pages/CadastroHbl";
import CadastroManifest from "./pages/CadastroManifest";
import SubmeterHblMbl from "./pages/SubmeterHblMbl";
import SubmeterManifestHbl from "./pages/SubmeterManifestHbl";
import InvoicesDraftHbl from "./pages/InvoicesDraftHbl";
import SystemLogs from "./pages/SystemLogs";
import LocalCharges from "./pages/LocalCharges";
import AlteracoesFee from "./pages/AlteracoesFee";
import ReguaCobranca from "./pages/ReguaCobranca";
import FinanceiroDisputa from "./pages/FinanceiroDisputa";
import AnaliseDocumental from "./pages/AnaliseDocumental";
import AnaliseDocumentalComparar from "./pages/AnaliseDocumentalComparar";
import EsteiraIndex from "./pages/esteira/EsteiraIndex";
import ComprovanteRobot from "./pages/esteira/ComprovanteRobot";
import EsteiraDashboard from "./pages/esteira/EsteiraDashboard";
import EsteiraManual from "./pages/esteira/EsteiraManual";
import EsteiraReports from "./pages/esteira/EsteiraReports";
import EsteiraUserManagement from "./pages/esteira/EsteiraUserManagement";
import EsteiraVoucherDetails from "./pages/esteira/EsteiraVoucherDetails";
import AccrualManagement from "./pages/esteira/AccrualManagement";
import VoucherRules from "./pages/esteira/VoucherRules";
import Olimpo from "./pages/Olimpo";
import ConferenciaChb from "./pages/ConferenciaChb";
import ChbAnalises from "./pages/ChbAnalises";

// CCT Module
import CCTDashboard from "./pages/cct/CCTDashboard";
import ExcecoesPage from "./pages/cct/ExcecoesPage";
import ManualUsuario from "./pages/cct/ManualUsuario";
import ConsoleTecnico from "./pages/cct/ConsoleTecnico";
import RegrasNotificacao from "./pages/cct/RegrasNotificacao";
import AnalyticsDashboard from "./pages/cct/AnalyticsDashboard";
import ProcessoTimeline from "./pages/cct/ProcessoTimeline";

// AWB Pages
import AWBList from "./pages/AWBList";
import StatusAereoList from "./pages/StatusAereoList";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/air/tracking" element={<Index />} />
          
          <Route path="/login" element={<Login />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admin/metrics" element={<MetricsUsage />} />
          <Route path="/admin/register" element={<Register />} />
          <Route path="/admin/logs" element={<Logs />} />
          <Route path="/air/check" element={<CheckAwb />} />
          <Route path="/sea/analysis" element={<SeaAnalysis />} />
          <Route path="/sea/tracking" element={<ContainerTracking />} />
          <Route path="/maritimo" element={<SeaAnalysis />} />
          <Route path="/sea/cadastro-hbl" element={<CadastroHbl />} />
          <Route path="/sea/cadastro-manifest" element={<CadastroManifest />} />
          <Route path="/sea/submeter-hbl-mbl" element={<SubmeterHblMbl />} />
          <Route path="/sea/submeter-manifest-hbl" element={<SubmeterManifestHbl />} />
          <Route path="/sea/invoices-draft-hbl" element={<InvoicesDraftHbl />} />
          <Route path="/maritimo/cadastro-hbl" element={<CadastroHbl />} />
          <Route path="/maritimo/cadastro-manifest" element={<CadastroManifest />} />
          <Route path="/maritimo/submeter-hbl-mbl" element={<SubmeterHblMbl />} />
          <Route path="/maritimo/submeter-manifest-hbl" element={<SubmeterManifestHbl />} />
          <Route path="/maritimo/invoices-draft-hbl" element={<InvoicesDraftHbl />} />
          <Route path="/admin/system-logs" element={<SystemLogs />} />
          <Route path="/sea/local-charges" element={<LocalCharges />} />
          <Route path="/sea/alteracoes-fee" element={<AlteracoesFee />} />
          <Route path="/fin/regua" element={<ReguaCobranca />} />
          <Route path="/fin/disputa" element={<FinanceiroDisputa />} />
          <Route path="/fin/analise-documental" element={<AnaliseDocumental />} />
          <Route path="/fin/analise-documental/comparar" element={<AnaliseDocumentalComparar />} />
          <Route path="/fin/esteira" element={<EsteiraIndex />} />
          <Route path="/fin/esteira/robot" element={<ComprovanteRobot />} />
          <Route path="/fin/esteira/dashboard" element={<EsteiraDashboard />} />
          <Route path="/fin/esteira/manual" element={<EsteiraManual />} />
          <Route path="/fin/esteira/reports" element={<EsteiraReports />} />
          <Route path="/fin/esteira/users" element={<EsteiraUserManagement />} />
          <Route path="/fin/esteira/voucher/:id" element={<EsteiraVoucherDetails />} />
          <Route path="/fin/esteira/accrual" element={<AccrualManagement />} />
          <Route path="/fin/esteira/rules" element={<VoucherRules />} />
          <Route path="/olimpo" element={<Olimpo />} />
          <Route path="/chb/conferences" element={<ChbAnalises />} />
          <Route path="/chb/conferences/:id" element={<ConferenciaChb />} />
          
          {/* CCT Module Routes */}
          <Route path="/air/cct" element={<CCTDashboard />} />
          <Route path="/air/cct/excecoes" element={<ExcecoesPage />} />
          <Route path="/air/cct/analytics" element={<AnalyticsDashboard />} />
          <Route path="/air/cct/notificacoes" element={<RegrasNotificacao />} />
          <Route path="/air/cct/console" element={<ConsoleTecnico />} />
          <Route path="/air/cct/manual" element={<ManualUsuario />} />
          <Route path="/air/cct/processo/:id" element={<ProcessoTimeline />} />
          
          {/* AWB Tracking Pages */}
          <Route path="/air/awb-list" element={<AWBList />} />
          <Route path="/air/status-aereo" element={<StatusAereoList />} />
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
