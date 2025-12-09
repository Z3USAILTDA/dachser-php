import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import MetricsUsage from "./pages/MetricsUsage";
import Register from "./pages/Register";
import CheckAwb from "./pages/CheckAwb";
import Logs from "./pages/Logs";
import Index from "./pages/Index";
import SeaAnalysis from "./pages/SeaAnalysis";
import CadastroHbl from "./pages/CadastroHbl";
import CadastroManifest from "./pages/CadastroManifest";
import SubmeterHblMbl from "./pages/SubmeterHblMbl";
import SubmeterManifestHbl from "./pages/SubmeterManifestHbl";
import InvoicesDraftHbl from "./pages/InvoicesDraftHbl";
import SystemLogs from "./pages/SystemLogs";
import LocalCharges from "./pages/LocalCharges";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/air/tracking" replace />} />
          <Route path="/air/tracking" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admin/metrics" element={<MetricsUsage />} />
          <Route path="/admin/register" element={<Register />} />
          <Route path="/admin/logs" element={<Logs />} />
          <Route path="/air/check" element={<CheckAwb />} />
          <Route path="/sea/analysis" element={<SeaAnalysis />} />
          <Route path="/maritimo" element={<SeaAnalysis />} />
          <Route path="/sea/cadastro-hbl" element={<CadastroHbl />} />
          <Route path="/sea/cadastro-manifest" element={<CadastroManifest />} />
          <Route path="/maritimo/cadastro-hbl" element={<CadastroHbl />} />
          <Route path="/maritimo/cadastro-manifest" element={<CadastroManifest />} />
          <Route path="/maritimo/submeter-hbl-mbl" element={<SubmeterHblMbl />} />
          <Route path="/maritimo/submeter-manifest-hbl" element={<SubmeterManifestHbl />} />
          <Route path="/maritimo/invoices-draft-hbl" element={<InvoicesDraftHbl />} />
          <Route path="/admin/system-logs" element={<SystemLogs />} />
          <Route path="/sea/local-charges" element={<LocalCharges />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
