import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SeaThemeGuard } from "@/components/SeaThemeGuard";
import { InactivityGuard } from "@/components/InactivityGuard";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";
import NotFound from "./pages/NotFound";

// ── ADMIN ──────────────────────────────────────────────────────────────────
const Login                = lazy(() => import("./pages/admin/Login"));
const ChangePassword       = lazy(() => import("./pages/admin/ChangePassword"));
const ForgotPassword       = lazy(() => import("./pages/admin/ForgotPassword"));
const VerifyResetCode      = lazy(() => import("./pages/admin/VerifyResetCode"));
const ResetPassword        = lazy(() => import("./pages/admin/ResetPassword"));
const Dashboard            = lazy(() => import("./pages/admin/Dashboard"));
const MetricsUsage         = lazy(() => import("./pages/admin/MetricsUsage"));
const Register             = lazy(() => import("./pages/admin/Register"));
const Logs                 = lazy(() => import("./pages/admin/Logs"));
const SystemLogs           = lazy(() => import("./pages/admin/SystemLogs"));
const AdminUserManagement  = lazy(() => import("./pages/admin/UserManagement"));
const DatabaseMonitor      = lazy(() => import("./pages/admin/DatabaseMonitor"));
const UploadMaster         = lazy(() => import("./pages/admin/UploadMaster"));
const ManualAdmin          = lazy(() => import("./pages/admin/ManualAdmin"));
const ApiKeyTest           = lazy(() => import("./pages/admin/ApiKeyTest"));
const CronManager          = lazy(() => import("./pages/admin/CronManager"));

// ── AIR ───────────────────────────────────────────────────────────────────
const Index              = lazy(() => import("./pages/air/Index"));
const CheckAwb           = lazy(() => import("./pages/air/CheckAwb"));
const AWBList            = lazy(() => import("./pages/air/AWBList"));
const CadastroNova       = lazy(() => import("./pages/air/CadastroNova"));
const TrackingAereo      = lazy(() => import("./pages/air/TrackingAereo"));
const ManualTracking     = lazy(() => import("./pages/air/ManualTracking"));
const ManualCheckAwb     = lazy(() => import("./pages/air/ManualCheckAwb"));
const ManualAwbList      = lazy(() => import("./pages/air/ManualAwbList"));
const ManualStatusAereo  = lazy(() => import("./pages/air/ManualStatusAereo"));

// ── CCT ───────────────────────────────────────────────────────────────────
const CCTDashboard        = lazy(() => import("./pages/cct/CCTDashboard"));
const ExcecoesPage        = lazy(() => import("./pages/cct/ExcecoesPage"));
const ManualUsuario       = lazy(() => import("./pages/cct/ManualUsuario"));
const ConsoleTecnico      = lazy(() => import("./pages/cct/ConsoleTecnico"));
const RegrasNotificacao   = lazy(() => import("./pages/cct/RegrasNotificacao"));
const AnalyticsDashboard  = lazy(() => import("./pages/cct/AnalyticsDashboard"));
const ProcessoTimeline    = lazy(() => import("./pages/cct/ProcessoTimeline"));
const LeadcomexLogsPage   = lazy(() => import("./pages/cct/LeadcomexLogsPage"));

// ── SEA / MARÍTIMO ────────────────────────────────────────────────────────
const SeaAnalysis              = lazy(() => import("./pages/sea/SeaAnalysis"));
const ContainerTracking        = lazy(() => import("./pages/sea/ContainerTracking"));
const CadastroHbl              = lazy(() => import("./pages/sea/CadastroHbl"));
const CadastroManifest         = lazy(() => import("./pages/sea/CadastroManifest"));
const SubmeterHblMbl           = lazy(() => import("./pages/sea/SubmeterHblMbl"));
const SubmeterManifestHbl      = lazy(() => import("./pages/sea/SubmeterManifestHbl"));
const InvoicesDraftHbl         = lazy(() => import("./pages/sea/InvoicesDraftHbl"));
const LocalCharges             = lazy(() => import("./pages/sea/LocalCharges"));
const DraftExportacao          = lazy(() => import("./pages/sea/DraftExportacao"));
const CadastroBl               = lazy(() => import("./pages/sea/CadastroBl"));
const SeaRegrasNotificacao     = lazy(() => import("./pages/sea/SeaRegrasNotificacao"));
const ManualSeaAnalysis        = lazy(() => import("./pages/sea/ManualSeaAnalysis"));
const ManualContainerTracking  = lazy(() => import("./pages/sea/ManualContainerTracking"));
const ManualCadastroHbl        = lazy(() => import("./pages/sea/ManualCadastroHbl"));
const ManualCadastroManifest   = lazy(() => import("./pages/sea/ManualCadastroManifest"));
const ManualSubmeterHblMbl     = lazy(() => import("./pages/sea/ManualSubmeterHblMbl"));
const ManualSubmeterManifestHbl = lazy(() => import("./pages/sea/ManualSubmeterManifestHbl"));
const ManualInvoicesDraft      = lazy(() => import("./pages/sea/ManualInvoicesDraft"));
const ManualDraftExportacao    = lazy(() => import("./pages/sea/ManualDraftExportacao"));

// ── DEMURRAGE ─────────────────────────────────────────────────────────────
const DemurrageIndex        = lazy(() => import("./pages/demurrage/DemurrageIndex"));
const DemurrageMonitor      = lazy(() => import("./pages/demurrage/DemurrageMonitor"));
const DemurrageRates        = lazy(() => import("./pages/demurrage/DemurrageRates"));
const DemurragePreInvoicing = lazy(() => import("./pages/demurrage/DemurragePreInvoicing"));
const DemurrageCarrierCosts = lazy(() => import("./pages/demurrage/DemurrageCarrierCosts"));
const DemurrageDisputes     = lazy(() => import("./pages/demurrage/DemurrageDisputes"));
const DemurrageClients      = lazy(() => import("./pages/demurrage/DemurrageClients"));
const DemurrageAnalytics    = lazy(() => import("./pages/demurrage/DemurrageAnalytics"));
const DemurrageFreeTimes    = lazy(() => import("./pages/demurrage/DemurrageFreeTimes"));
const DemurrageSettings     = lazy(() => import("./pages/demurrage/DemurrageSettings"));
const ManualDemurrage       = lazy(() => import("./pages/demurrage/ManualDemurrage"));

// ── FINANCEIRO / ESTEIRA ──────────────────────────────────────────────────
const ReguaCobranca           = lazy(() => import("./pages/fin/ReguaCobranca"));
const AlteracoesFee           = lazy(() => import("./pages/fin/AlteracoesFee"));
const FinanceiroDisputa       = lazy(() => import("./pages/fin/FinanceiroDisputa"));
const SupervisorConfirmacao   = lazy(() => import("./pages/fin/SupervisorConfirmacao"));
const SupervisorApproveRedirect = lazy(() => import("./pages/fin/SupervisorApproveRedirect"));
const SupervisorRejectRedirect  = lazy(() => import("./pages/fin/SupervisorRejectRedirect"));
const OthelloImport           = lazy(() => import("./pages/fin/OthelloImport"));
const ManualFinanceiro        = lazy(() => import("./pages/fin/ManualFinanceiro"));
const EsteiraIndex            = lazy(() => import("./pages/esteira/EsteiraIndex"));
const ComprovanteRobot        = lazy(() => import("./pages/esteira/ComprovanteRobot"));
const EsteiraDashboard        = lazy(() => import("./pages/esteira/EsteiraDashboard"));
const EsteiraManual           = lazy(() => import("./pages/esteira/EsteiraManual"));
const EsteiraReports          = lazy(() => import("./pages/esteira/EsteiraReports"));
const EsteiraUserManagement   = lazy(() => import("./pages/esteira/EsteiraUserManagement"));
const EsteiraVoucherDetails   = lazy(() => import("./pages/esteira/EsteiraVoucherDetails"));
const AccrualManagement       = lazy(() => import("./pages/esteira/AccrualManagement"));
const VoucherRules            = lazy(() => import("./pages/esteira/VoucherRules"));
const EmailPreview            = lazy(() => import("./pages/esteira/EmailPreview"));

// ── CHB ───────────────────────────────────────────────────────────────────
const ChbAnalises               = lazy(() => import("./pages/chb/ChbAnalises"));
const ConferenciaChb            = lazy(() => import("./pages/chb/ConferenciaChb"));
const AnaliseDocumental         = lazy(() => import("./pages/chb/AnaliseDocumental"));
const AnaliseDocumentalComparar = lazy(() => import("./pages/chb/AnaliseDocumentalComparar"));
const AnaliseDocumentalDetalhes = lazy(() => import("./pages/chb/AnaliseDocumentalDetalhes"));
const ManualChb                 = lazy(() => import("./pages/chb/ManualChb"));

// ── OLIMPO ────────────────────────────────────────────────────────────────
const Olimpo          = lazy(() => import("./pages/olimpo/Olimpo"));
const OlimpoIndex     = lazy(() => import("./pages/olimpo/OlimpoIndex"));
const OlimpoFaturamento = lazy(() => import("./pages/olimpo/OlimpoFaturamento"));
const OlimpoCobranca  = lazy(() => import("./pages/olimpo/OlimpoCobranca"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 60_000,
      retry: 1,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <SeaThemeGuard />
        <InactivityGuard />
        <ErrorBoundary>
        <Suspense
          fallback={
            <div className="min-h-screen flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />

            {/* ADMIN */}
            <Route path="/login" element={<Login />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/verify-code" element={<VerifyResetCode />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/admin/metrics" element={<MetricsUsage />} />
            <Route path="/admin/register" element={<Register />} />
            <Route path="/admin/users" element={<AdminUserManagement />} />
            <Route path="/admin/database" element={<DatabaseMonitor />} />
            <Route path="/admin/z3us/upload-master" element={<UploadMaster />} />
            <Route path="/admin/logs" element={<Logs />} />
            <Route path="/admin/system-logs" element={<SystemLogs />} />
            <Route path="/admin/manual" element={<ManualAdmin />} />
            <Route path="/admin/api-test" element={<ApiKeyTest />} />
            <Route path="/admin/cron-manager" element={<CronManager />} />

            {/* AIR */}
            <Route path="/air/tracking" element={<Index />} />
            <Route path="/air/check" element={<CheckAwb />} />
            <Route path="/air/awb-list" element={<AWBList />} />
            <Route path="/air/cadastro-nova" element={<CadastroNova />} />
            <Route path="/air/tracking-aereo" element={<TrackingAereo />} />
            <Route path="/air/tracking/manual" element={<ManualTracking />} />
            <Route path="/air/check/manual" element={<ManualCheckAwb />} />
            <Route path="/air/awb-list/manual" element={<ManualAwbList />} />
            <Route path="/air/status-aereo/manual" element={<ManualStatusAereo />} />

            {/* CCT */}
            <Route path="/air/cct" element={<CCTDashboard />} />
            <Route path="/air/cct/excecoes" element={<ExcecoesPage />} />
            <Route path="/air/cct/analytics" element={<AnalyticsDashboard />} />
            <Route path="/air/cct/notificacoes" element={<RegrasNotificacao />} />
            <Route path="/air/cct/console" element={<ConsoleTecnico />} />
            <Route path="/air/cct/manual" element={<ManualUsuario />} />
            <Route path="/air/cct/processo/:id" element={<ProcessoTimeline />} />
            <Route path="/air/cct/leadcomex-logs" element={<LeadcomexLogsPage />} />

            {/* SEA / MARÍTIMO */}
            <Route path="/sea/analysis" element={<SeaAnalysis />} />
            <Route path="/sea/analysis/manual" element={<ManualSeaAnalysis />} />
            <Route path="/sea/tracking" element={<ContainerTracking />} />
            <Route path="/sea/tracking/manual" element={<ManualContainerTracking />} />
            <Route path="/sea/tracking/notificacoes" element={<SeaRegrasNotificacao />} />
            <Route path="/sea/cadastro-bl" element={<CadastroBl />} />
            <Route path="/sea/cadastro-hbl" element={<CadastroHbl />} />
            <Route path="/sea/cadastro-hbl/manual" element={<ManualCadastroHbl />} />
            <Route path="/sea/cadastro-manifest" element={<CadastroManifest />} />
            <Route path="/sea/cadastro-manifest/manual" element={<ManualCadastroManifest />} />
            <Route path="/sea/submeter-hbl-mbl" element={<SubmeterHblMbl />} />
            <Route path="/sea/submeter-hbl-mbl/manual" element={<ManualSubmeterHblMbl />} />
            <Route path="/sea/submeter-manifest-hbl" element={<SubmeterManifestHbl />} />
            <Route path="/sea/submeter-manifest-hbl/manual" element={<ManualSubmeterManifestHbl />} />
            <Route path="/sea/invoices-draft-hbl" element={<InvoicesDraftHbl />} />
            <Route path="/sea/invoices-draft-hbl/manual" element={<ManualInvoicesDraft />} />
            <Route path="/sea/local-charges" element={<LocalCharges />} />
            <Route path="/sea/draft-exportacao" element={<DraftExportacao />} />
            <Route path="/sea/manual-drafts" element={<ManualDraftExportacao />} />
            <Route path="/sea/alteracoes-fee" element={<AlteracoesFee />} />
            {/* aliases /maritimo/* */}
            <Route path="/maritimo" element={<SeaAnalysis />} />
            <Route path="/maritimo/cadastro-hbl" element={<CadastroHbl />} />
            <Route path="/maritimo/cadastro-manifest" element={<CadastroManifest />} />
            <Route path="/maritimo/submeter-hbl-mbl" element={<SubmeterHblMbl />} />
            <Route path="/maritimo/submeter-manifest-hbl" element={<SubmeterManifestHbl />} />
            <Route path="/maritimo/invoices-draft-hbl" element={<InvoicesDraftHbl />} />

            {/* DEMURRAGE */}
            <Route path="/sea/demurrage" element={<DemurrageIndex />} />
            <Route path="/sea/demurrage/monitor" element={<DemurrageMonitor />} />
            <Route path="/sea/demurrage/free-times" element={<DemurrageFreeTimes />} />
            <Route path="/sea/demurrage/rates" element={<DemurrageRates />} />
            <Route path="/sea/demurrage/pre-invoicing" element={<DemurragePreInvoicing />} />
            <Route path="/sea/demurrage/carrier-costs" element={<DemurrageCarrierCosts />} />
            <Route path="/sea/demurrage/disputes" element={<DemurrageDisputes />} />
            <Route path="/sea/demurrage/clients" element={<DemurrageClients />} />
            <Route path="/sea/demurrage/analytics" element={<DemurrageAnalytics />} />
            <Route path="/sea/demurrage/manual" element={<ManualDemurrage />} />
            <Route path="/sea/demurrage/settings" element={<DemurrageSettings />} />

            {/* FINANCEIRO / ESTEIRA */}
            <Route path="/fin/regua" element={<ReguaCobranca />} />
            <Route path="/fin/disputa" element={<FinanceiroDisputa />} />
            <Route path="/fin/analise-documental" element={<AnaliseDocumental />} />
            <Route path="/fin/analise-documental/comparar" element={<AnaliseDocumentalComparar />} />
            <Route path="/fin/analise-documental/detalhes/:id" element={<AnaliseDocumentalDetalhes />} />
            <Route path="/fin/othello-import" element={<OthelloImport />} />
            <Route path="/fin/manual" element={<ManualFinanceiro />} />
            <Route path="/fin/esteira" element={<EsteiraIndex />} />
            <Route path="/fin/esteira/robot" element={<ComprovanteRobot />} />
            <Route path="/fin/esteira/dashboard" element={<EsteiraDashboard />} />
            <Route path="/fin/esteira/manual" element={<EsteiraManual />} />
            <Route path="/fin/esteira/reports" element={<EsteiraReports />} />
            <Route path="/fin/esteira/users" element={<EsteiraUserManagement />} />
            <Route path="/fin/esteira/voucher/:id" element={<EsteiraVoucherDetails />} />
            <Route path="/fin/esteira/accrual" element={<AccrualManagement />} />
            <Route path="/fin/esteira/rules" element={<VoucherRules />} />
            <Route path="/fin/esteira/email-preview" element={<EmailPreview />} />
            <Route path="/supervisor-approve" element={<SupervisorApproveRedirect />} />
            <Route path="/supervisor-reject" element={<SupervisorRejectRedirect />} />
            <Route path="/supervisor-confirmacao" element={<SupervisorConfirmacao />} />

            {/* CHB */}
            <Route path="/chb/conferences" element={<ChbAnalises />} />
            <Route path="/chb/conferences/:id" element={<ConferenciaChb />} />
            <Route path="/chb/manual" element={<ManualChb />} />

            {/* OLIMPO */}
            <Route path="/olimpo" element={<OlimpoIndex />} />
            <Route path="/olimpo/mapa" element={<Olimpo />} />
            <Route path="/olimpo/cobranca" element={<OlimpoCobranca />} />
            <Route path="/olimpo/faturamento" element={<OlimpoFaturamento />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
