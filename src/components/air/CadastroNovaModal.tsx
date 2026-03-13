import { useState, useCallback, useRef, useMemo } from "react";
import { FilePlus, Upload, Loader2, Save, Search, User, Calendar, RefreshCw, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight, Plane, Package, Copy, Check } from "lucide-react";
import { copyToClipboard } from "@/utils/clipboard";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ConsigneeSuggestion {
  nome_cliente: string;
  cnpj: string;
  dchr_customer_number?: string;
  cidade_uf?: string;
}

interface AnalistaSuggestion {
  nome_analista: string;
  email_analista: string;
  modal: string;
}

interface FormData {
  awb_number: string;
  hawb_number: string;
  airport_departure: string;
  shipper_name: string;
  shipper_address: string;
  shipper_account: string;
  consignee_nome: string;
  consignee_cnpj: string;
  consignee_customer_number: string;
  issuing_agent: string;
  agent_city: string;
  agent_iata_code: string;
  agent_account: string;
  nie_code: string;
  nif_code: string;
  routing_destination: string;
  currency: string;
  chgs_wt_val: string;
  declared_value_carriage: string;
  declared_value_customs: string;
  handling_references: string;
  handling_info: string;
  pieces: string;
  gross_weight_kg: string;
  rate_class: string;
  chargeable_weight: string;
  rate: string;
  total_charge: string;
  nature_of_goods: string;
  itn_number: string;
  packaging: string;
  hs_code: string;
  volume_cbm: string;
  dimensions: string;
  other_charges_agent: string;
  other_charges_carrier: string;
  signature_name: string;
  signature_date: string;
  signature_place: string;
  total_prepaid: string;
  total_collect: string;
  clerk: string;
  clerk_email: string;
  etd: string;
  eta: string;
  mode: 'impo' | 'expo';
  po_number: string;
  green_light_date: string;
  pickup_date: string;
  service_level: string;
  cct_transmitido: boolean;
  airport_destination: string;
  wh_treatment: string;
  pre_alert_date: string;
  customer_order: string;
  oea_checklist: boolean;
  d_term: string;
  pre_alert_sent: boolean;
  cargo_departed: boolean;
  pod_dn_available: boolean;
}

const emptyForm: FormData = {
  awb_number: "", hawb_number: "", airport_departure: "", shipper_name: "", shipper_address: "", shipper_account: "",
  consignee_nome: "", consignee_cnpj: "", consignee_customer_number: "",
  issuing_agent: "", agent_city: "", agent_iata_code: "", agent_account: "",
  nie_code: "", nif_code: "", routing_destination: "", currency: "", chgs_wt_val: "",
  declared_value_carriage: "", declared_value_customs: "",
  handling_references: "", handling_info: "",
  pieces: "", gross_weight_kg: "", rate_class: "", chargeable_weight: "", rate: "", total_charge: "",
  nature_of_goods: "", itn_number: "", packaging: "", hs_code: "", volume_cbm: "", dimensions: "",
  other_charges_agent: "", other_charges_carrier: "",
  signature_name: "", signature_date: "", signature_place: "",
  total_prepaid: "", total_collect: "",
  clerk: "", clerk_email: "", etd: "", eta: "",
  mode: 'impo',
  po_number: "", green_light_date: "", pickup_date: "", service_level: "",
  cct_transmitido: false, airport_destination: "", wh_treatment: "",
  pre_alert_date: "", customer_order: "", oea_checklist: false,
  d_term: "", pre_alert_sent: false, cargo_departed: false, pod_dn_available: false,
};

const WH_TREATMENT_OPTIONS = [
  { value: "TC1", label: "TC1 - Liberação Imediata | RECOF" },
  { value: "TC4", label: "TC4 - Remoção Expressa | Recinto Aduaneiro" },
  { value: "PEA", label: "PEA: -18°C a 0 | FRO - Produtos Congelados" },
  { value: "PEB", label: "PEB: 2°C a 8°C | COL - Mercadoria resfriada" },
  { value: "PEC", label: "PEC: 9°C a 15°C | ERT - Temp. ambiente estendida" },
  { value: "PED", label: "PED: 16°C a 22°C | CRT - Controle temp. ambiente" },
];

interface ManifestHawb {
  hawb_number: string;
  shipper: string;
  consignee: string;
  cnpj?: string;
  dep_des?: string;
  pieces?: number;
  weight?: number;
  old_mawb?: string;
}

const CollapsibleCard = ({ title, fields, form, children, defaultOpen = false }: {
  title: string;
  fields: (keyof FormData)[];
  form: FormData;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const filled = fields.filter(f => {
    const v = form[f];
    if (typeof v === 'boolean') return v;
    return !!v;
  }).length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-4 hover:bg-accent/5 transition-colors">
            <h3 className="text-sm font-semibold text-primary">{title}</h3>
            <div className="flex items-center gap-2">
              <Badge variant={filled > 0 ? "default" : "outline"} className="text-xs font-mono">
                {filled}/{fields.length}
              </Badge>
              {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4">
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

interface CadastroNovaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export const CadastroNovaModal = ({ open, onOpenChange, onSuccess }: CadastroNovaModalProps) => {
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fileName, setFileName] = useState("");

  // Swap Master state
  const [swapFile, setSwapFile] = useState<string>("");
  const [isExtractingSwap, setIsExtractingSwap] = useState(false);
  const [swapMawb, setSwapMawb] = useState("");
  const [swapHawbs, setSwapHawbs] = useState<ManifestHawb[]>([]);
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapResult, setSwapResult] = useState<{ updated: string[]; notFound: string[] } | null>(null);

  // Consignee autocomplete state
  const [consigneeSearch, setConsigneeSearch] = useState("");
  const [consigneeSuggestions, setConsigneeSuggestions] = useState<ConsigneeSuggestion[]>([]);
  const [isSearchingConsignee, setIsSearchingConsignee] = useState(false);
  const [consigneeOpen, setConsigneeOpen] = useState(false);
  const consigneeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clerk autocomplete state
  const [clerkSearch, setClerkSearch] = useState("");
  const [clerkSuggestions, setClerkSuggestions] = useState<AnalistaSuggestion[]>([]);
  const [isSearchingClerk, setIsSearchingClerk] = useState(false);
  const [clerkOpen, setClerkOpen] = useState(false);
  const clerkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateField = (field: keyof FormData, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  // === Consignee autocomplete ===
  const searchConsignee = useCallback(async (term: string) => {
    if (term.length < 2) { setConsigneeSuggestions([]); return; }
    setIsSearchingConsignee(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=search_clientes_base&q=${encodeURIComponent(term)}&limit=15`,
        { headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
      );
      const data = await res.json();
      setConsigneeSuggestions(data.clientes || []);
      if ((data.clientes || []).length > 0) setConsigneeOpen(true);
    } catch { setConsigneeSuggestions([]); }
    setIsSearchingConsignee(false);
  }, []);

  const handleConsigneeInput = (value: string) => {
    setConsigneeSearch(value);
    updateField("consignee_nome", value);
    if (consigneeTimerRef.current) clearTimeout(consigneeTimerRef.current);
    consigneeTimerRef.current = setTimeout(() => searchConsignee(value), 300);
  };

  const selectConsignee = (c: ConsigneeSuggestion) => {
    updateField("consignee_nome", c.nome_cliente);
    updateField("consignee_cnpj", c.cnpj || "");
    updateField("consignee_customer_number", c.dchr_customer_number || "");
    setConsigneeSearch(c.nome_cliente);
    setConsigneeOpen(false);
  };

  // === Clerk autocomplete ===
  const searchClerk = useCallback(async (term: string) => {
    if (term.length < 2) { setClerkSuggestions([]); return; }
    setIsSearchingClerk(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=search_analistas&q=${encodeURIComponent(term)}&modal=AIR&limit=15`,
        { headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
      );
      const data = await res.json();
      setClerkSuggestions(data.analistas || []);
      if ((data.analistas || []).length > 0) setClerkOpen(true);
    } catch { setClerkSuggestions([]); }
    setIsSearchingClerk(false);
  }, []);

  const handleClerkInput = (value: string) => {
    setClerkSearch(value);
    updateField("clerk", value);
    if (clerkTimerRef.current) clearTimeout(clerkTimerRef.current);
    clerkTimerRef.current = setTimeout(() => searchClerk(value), 300);
  };

  const selectClerk = (a: AnalistaSuggestion) => {
    updateField("clerk", a.nome_analista);
    updateField("clerk_email", a.email_analista || "");
    setClerkSearch(a.nome_analista);
    setClerkOpen(false);
  };

  // === File upload & extraction ===
  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Apenas arquivos PDF são aceitos.");
      return;
    }
    setFileName(file.name);
    setIsExtracting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-hawb-cadastro`,
        { method: "POST", headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` }, body: fd }
      );
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || "Erro na extração");
      const d = result.data;
      setForm(prev => ({
        ...prev,
        awb_number: d.awb_number || "",
        hawb_number: d.hawb_number || "",
        airport_departure: d.airport_departure || "",
        shipper_name: d.shipper_name || "",
        shipper_address: d.shipper_address || "",
        shipper_account: d.shipper_account || "",
        issuing_agent: d.issuing_agent || "",
        agent_city: d.agent_city || "",
        agent_iata_code: d.agent_iata_code || "",
        agent_account: d.agent_account || "",
        nie_code: d.nie_code || "",
        nif_code: d.nif_code || "",
        routing_destination: d.routing_destination || "",
        currency: d.currency || "",
        chgs_wt_val: d.chgs_wt_val || "",
        declared_value_carriage: d.declared_value_carriage || "",
        declared_value_customs: d.declared_value_customs || "",
        handling_references: d.handling_references || "",
        handling_info: d.handling_info || "",
        pieces: d.pieces != null ? String(d.pieces) : "",
        gross_weight_kg: d.gross_weight_kg != null ? String(d.gross_weight_kg) : "",
        rate_class: d.rate_class || "",
        chargeable_weight: d.chargeable_weight != null ? String(d.chargeable_weight) : "",
        rate: d.rate != null ? String(d.rate) : "",
        total_charge: d.total_charge != null ? String(d.total_charge) : "",
        nature_of_goods: d.nature_of_goods || "",
        itn_number: d.itn_number || "",
        packaging: d.packaging || "",
        hs_code: d.hs_code || "",
        volume_cbm: d.volume_cbm != null ? String(d.volume_cbm) : "",
        dimensions: d.dimensions || "",
        other_charges_agent: d.other_charges_agent != null ? String(d.other_charges_agent) : "",
        other_charges_carrier: d.other_charges_carrier || "",
        signature_name: d.signature_name || "",
        signature_date: d.signature_date || "",
        signature_place: d.signature_place || "",
        total_prepaid: d.total_prepaid != null ? String(d.total_prepaid) : "",
        total_collect: d.total_collect != null ? String(d.total_collect) : "",
      }));
      toast.success(`Dados extraídos de ${file.name}`, { description: `${result.processingTimeMs}ms` });
    } catch (e: any) {
      toast.error("Erro na extração", { description: e.message });
    }
    setIsExtracting(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleSave = async () => {
    if (!form.awb_number) { toast.error("MAWB Number é obrigatório"); return; }
    if (!form.consignee_nome) { toast.error("Consignee é obrigatório"); return; }
    if (!form.clerk) { toast.error("Clerk é obrigatório"); return; }

    setIsSaving(true);
    try {
      const now = new Date();
      const cadastroId = `CAD-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      
      const payload = {
        action: "create_cadastro_aereo",
        cadastro_id: cadastroId,
        ...form,
        pieces: form.pieces ? parseInt(form.pieces) : null,
        gross_weight_kg: form.gross_weight_kg ? parseFloat(form.gross_weight_kg) : null,
        chargeable_weight: form.chargeable_weight ? parseFloat(form.chargeable_weight) : null,
        rate: form.rate ? parseFloat(form.rate) : null,
        total_charge: form.total_charge ? parseFloat(form.total_charge) : null,
        volume_cbm: form.volume_cbm ? parseFloat(form.volume_cbm) : null,
        other_charges_agent: form.other_charges_agent ? parseFloat(form.other_charges_agent) : null,
        total_prepaid: form.total_prepaid ? parseFloat(form.total_prepaid) : null,
        total_collect: form.total_collect ? parseFloat(form.total_collect) : null,
        etd: form.etd || null,
        eta: form.eta || null,
        mode: form.mode,
        po_number: form.po_number || null,
        green_light_date: form.green_light_date || null,
        pickup_date: form.pickup_date || null,
        service_level: form.service_level || null,
        cct_transmitido: form.cct_transmitido,
        airport_destination: form.airport_destination || null,
        wh_treatment: form.wh_treatment || null,
        pre_alert_date: form.pre_alert_date || null,
        customer_order: form.customer_order || null,
        oea_checklist: form.oea_checklist,
        d_term: form.d_term || null,
        pre_alert_sent: form.pre_alert_sent,
        cargo_departed: form.cargo_departed,
        pod_dn_available: form.pod_dn_available,
        created_by: user.username || "unknown",
      };

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy`,
        {
          method: "POST",
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || "Erro ao salvar");
      
      toast.success("Cadastro salvo!", { description: `ID: ${cadastroId}` });
      setForm({ ...emptyForm });
      setFileName("");
      setConsigneeSearch("");
      setClerkSearch("");
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    }
    setIsSaving(false);
  };

  // === Swap Master Functions ===
  const handleSwapFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Apenas arquivos PDF são aceitos.");
      return;
    }
    setSwapFile(file.name);
    setIsExtractingSwap(true);
    setSwapResult(null);
    setSwapHawbs([]);
    setSwapMawb("");
    try {
      const fd = new window.FormData();
      fd.append("file", file);
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-manifest-swap`,
        { method: "POST", headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` }, body: fd }
      );
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || "Erro na extração");

      const data = result.data;
      setSwapMawb(data.mawb || "");
      const hawbList: ManifestHawb[] = (data.hawbs || []).map((h: any) => ({
        hawb_number: h.hawb_number || "",
        shipper: h.shipper || "",
        consignee: h.consignee || "",
        cnpj: h.cnpj || "",
        dep_des: h.dep_des || "",
        pieces: h.pieces || null,
        weight: h.weight || null,
        old_mawb: undefined,
      }));
      setSwapHawbs(hawbList);
      toast.success(`Manifesto extraído: ${hawbList.length} HAWBs`, { description: `MAWB: ${data.mawb} (${result.processingTimeMs}ms)` });
    } catch (e: any) {
      toast.error("Erro ao extrair manifesto", { description: e.message });
    }
    setIsExtractingSwap(false);
  };

  const handleConfirmSwap = async () => {
    if (!swapMawb || swapHawbs.length === 0) return;
    setIsSwapping(true);
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy`,
        {
          method: "POST",
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: "swap_master_cadastro_aereo",
            new_mawb: swapMawb,
            hawbs: swapHawbs.map(h => h.hawb_number),
            user: user.username || "unknown",
          }),
        }
      );
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || "Erro na troca");

      setSwapResult({ updated: result.updated || [], notFound: result.not_found || [] });

      if (result.old_mawbs) {
        setSwapHawbs(prev => prev.map(h => ({
          ...h,
          old_mawb: result.old_mawbs[h.hawb_number] || undefined,
        })));
      }

      if (result.updated_count > 0) {
        toast.success(`${result.updated_count} HAWB(s) atualizados!`, {
          description: result.not_found_count > 0 ? `${result.not_found_count} não encontrado(s)` : undefined,
        });
      } else {
        toast.warning("Nenhum HAWB encontrado no banco.");
      }
    } catch (e: any) {
      toast.error("Erro na troca de master", { description: e.message });
    }
    setIsSwapping(false);
  };

  const resetSwap = () => {
    setSwapFile("");
    setSwapMawb("");
    setSwapHawbs([]);
    setSwapResult(null);
  };

  const Field = ({ label, field, type = "text", span2 = false }: { label: string; field: keyof FormData; type?: string; span2?: boolean }) => (
    <div className={span2 ? "col-span-1 md:col-span-2" : ""}>
      <Label className="text-xs text-muted-foreground mb-1 block">{label}</Label>
      <Input
        type={type}
        value={form[field] as string}
        onChange={e => updateField(field, e.target.value)}
        className="h-8 text-sm rounded-lg"
      />
    </div>
  );

  const awbShipperFields: (keyof FormData)[] = ['awb_number', 'hawb_number', 'airport_departure', 'shipper_name', 'shipper_address', 'shipper_account'];
  const agentRoutingFields: (keyof FormData)[] = ['issuing_agent', 'agent_city', 'agent_iata_code', 'agent_account', 'nie_code', 'nif_code', 'routing_destination'];
  const chargesFields: (keyof FormData)[] = ['currency', 'chgs_wt_val', 'declared_value_carriage', 'declared_value_customs', 'pieces', 'gross_weight_kg', 'rate_class', 'chargeable_weight', 'rate', 'total_charge', 'other_charges_agent', 'other_charges_carrier', 'total_prepaid', 'total_collect'];
  const goodsFields: (keyof FormData)[] = ['nature_of_goods', 'hs_code', 'itn_number', 'packaging', 'volume_cbm', 'dimensions'];
  const handlingFields: (keyof FormData)[] = ['handling_references', 'handling_info', 'signature_name', 'signature_date', 'signature_place'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-[rgba(5,6,18,.97)] border-[rgba(255,255,255,.12)] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FilePlus className="h-5 w-5 text-[#ffc800]" />
            Novo Processo Aéreo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Mode Toggle */}
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1 bg-[rgba(255,255,255,.06)] border border-[rgba(255,255,255,.1)] rounded-full p-1">
              <button
                onClick={() => updateField('mode', 'impo')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  form.mode === 'impo'
                    ? 'bg-[#ffc800] text-black'
                    : 'text-[#aaa] hover:text-white'
                }`}
              >
                <Plane className="h-3.5 w-3.5 rotate-[-45deg]" />
                Importação
              </button>
              <button
                onClick={() => updateField('mode', 'expo')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  form.mode === 'expo'
                    ? 'bg-[#ffc800] text-black'
                    : 'text-[#aaa] hover:text-white'
                }`}
              >
                <Package className="h-3.5 w-3.5" />
                Exportação
              </button>
            </div>
          </div>

          {/* Upload Zone */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-[#ffc800]/40 rounded-xl p-6 text-center hover:border-[#ffc800]/70 transition-colors cursor-pointer"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".pdf";
              input.onchange = e => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleFileUpload(file);
              };
              input.click();
            }}
          >
            {isExtracting ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-7 w-7 animate-spin text-[#ffc800]" />
                <p className="text-sm text-[#aaa]">Extraindo dados do HAWB...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-7 w-7 text-[#ffc800]/60" />
                <p className="text-sm text-[#aaa]">
                  {fileName ? `Arquivo: ${fileName}` : "Arraste um PDF HAWB ou clique para selecionar"}
                </p>
              </div>
            )}
          </div>

          {/* Manual Fields Section */}
          <div className="rounded-xl border border-[rgba(255,255,255,.1)] bg-[rgba(255,255,255,.03)] p-4 space-y-4">
            <h3 className="text-sm font-semibold text-[#ffc800] flex items-center gap-2">
              <User className="h-4 w-4" /> Campos Manuais — {form.mode === 'impo' ? 'Importação' : 'Exportação'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Clerk */}
              <div>
                <Label className="text-xs text-[#aaa] mb-1 block">Clerk (Analista) *</Label>
                <Popover open={clerkOpen} onOpenChange={setClerkOpen}>
                  <PopoverTrigger asChild>
                    <div className="relative">
                      <Input
                        value={clerkSearch || form.clerk}
                        onChange={e => handleClerkInput(e.target.value)}
                        placeholder="Digite para buscar analista..."
                        className="h-8 text-sm rounded-lg pr-8 bg-[rgba(255,255,255,.06)] border-[rgba(255,255,255,.1)] text-white placeholder:text-[#666]"
                      />
                      {isSearchingClerk && <Loader2 className="absolute right-2 top-1.5 h-4 w-4 animate-spin text-[#aaa]" />}
                      {!isSearchingClerk && <Search className="absolute right-2 top-1.5 h-4 w-4 text-[#666]" />}
                    </div>
                  </PopoverTrigger>
                  {clerkSuggestions.length > 0 && (
                    <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
                      <Command>
                        <CommandList>
                          <CommandGroup>
                            {clerkSuggestions.map((a, i) => (
                              <CommandItem key={i} onSelect={() => selectClerk(a)} className="cursor-pointer">
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium">{a.nome_analista}</span>
                                  <span className="text-xs text-muted-foreground">{a.email_analista || "sem email"}</span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  )}
                </Popover>
              </div>

              {/* Consignee */}
              <div>
                <Label className="text-xs text-[#aaa] mb-1 block">Consignee *</Label>
                <Popover open={consigneeOpen} onOpenChange={setConsigneeOpen}>
                  <PopoverTrigger asChild>
                    <div className="relative">
                      <Input
                        value={consigneeSearch || form.consignee_nome}
                        onChange={e => handleConsigneeInput(e.target.value)}
                        placeholder="Digite para buscar cliente..."
                        className="h-8 text-sm rounded-lg pr-8 bg-[rgba(255,255,255,.06)] border-[rgba(255,255,255,.1)] text-white placeholder:text-[#666]"
                      />
                      {isSearchingConsignee && <Loader2 className="absolute right-2 top-1.5 h-4 w-4 animate-spin text-[#aaa]" />}
                      {!isSearchingConsignee && <Search className="absolute right-2 top-1.5 h-4 w-4 text-[#666]" />}
                    </div>
                  </PopoverTrigger>
                  {consigneeSuggestions.length > 0 && (
                    <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
                      <Command>
                        <CommandList>
                          <CommandGroup>
                            {consigneeSuggestions.map((c, i) => (
                              <CommandItem key={i} onSelect={() => selectConsignee(c)} className="cursor-pointer">
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium">{c.nome_cliente}</span>
                                  <span className="text-xs text-muted-foreground">{c.cnpj} {c.cidade_uf ? `• ${c.cidade_uf}` : ""}</span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  )}
                </Popover>
              </div>

              <Field label="Customer No." field="consignee_customer_number" />

              <div>
                <Label className="text-xs text-[#aaa] mb-1 block">P.O.</Label>
                <Input value={form.po_number} onChange={e => updateField('po_number', e.target.value)} className="h-8 text-sm rounded-lg bg-[rgba(255,255,255,.06)] border-[rgba(255,255,255,.1)] text-white" />
              </div>

              <Field label="HAWB No." field="hawb_number" />
              <Field label="Master No. (MAWB) *" field="awb_number" />

              <div>
                <Label className="text-xs text-[#aaa] mb-1 block flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> E.T.D.
                </Label>
                <Input type="datetime-local" value={form.etd} onChange={e => updateField("etd", e.target.value)} className="h-8 text-sm rounded-lg bg-[rgba(255,255,255,.06)] border-[rgba(255,255,255,.1)] text-white" />
              </div>

              <div>
                <Label className="text-xs text-[#aaa] mb-1 block flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> E.T.A. / A.T.A.
                </Label>
                <Input type="datetime-local" value={form.eta} onChange={e => updateField("eta", e.target.value)} className="h-8 text-sm rounded-lg bg-[rgba(255,255,255,.06)] border-[rgba(255,255,255,.1)] text-white" />
              </div>

              {/* IMPO-ONLY FIELDS */}
              {form.mode === 'impo' && (
                <>
                  <Field label="Shipper" field="shipper_name" />
                  <div>
                    <Label className="text-xs text-[#aaa] mb-1 block">Green Light Sent Date</Label>
                    <Input type="date" value={form.green_light_date} onChange={e => updateField('green_light_date', e.target.value)} className="h-8 text-sm rounded-lg bg-[rgba(255,255,255,.06)] border-[rgba(255,255,255,.1)] text-white" />
                  </div>
                  <div>
                    <Label className="text-xs text-[#aaa] mb-1 block">Pickup Date</Label>
                    <Input type="date" value={form.pickup_date} onChange={e => updateField('pickup_date', e.target.value)} className="h-8 text-sm rounded-lg bg-[rgba(255,255,255,.06)] border-[rgba(255,255,255,.1)] text-white" />
                  </div>
                  <div className="col-span-1 md:col-span-2 lg:col-span-3">
                    <Label className="text-xs text-[#aaa] mb-2 block">Service Level</Label>
                    <RadioGroup value={form.service_level} onValueChange={v => updateField('service_level', v)} className="flex flex-wrap gap-4">
                      {['Own Consol', 'Standard', 'Priority', 'Flash/BXO'].map(opt => (
                        <div key={opt} className="flex items-center gap-1.5">
                          <RadioGroupItem value={opt} id={`modal-sl-${opt}`} />
                          <Label htmlFor={`modal-sl-${opt}`} className="text-xs cursor-pointer text-[#ccc]">{opt}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={form.cct_transmitido} onCheckedChange={v => updateField('cct_transmitido', !!v)} id="modal_cct" />
                    <Label htmlFor="modal_cct" className="text-xs cursor-pointer text-[#ccc]">CCT Transmitido</Label>
                  </div>
                  <div>
                    <Label className="text-xs text-[#aaa] mb-1 block">Airport at Destination</Label>
                    <Input value={form.airport_destination} onChange={e => updateField('airport_destination', e.target.value)} className="h-8 text-sm rounded-lg bg-[rgba(255,255,255,.06)] border-[rgba(255,255,255,.1)] text-white" />
                  </div>
                  <div>
                    <Label className="text-xs text-[#aaa] mb-1 block">WH Treatment</Label>
                    <Select value={form.wh_treatment} onValueChange={v => updateField('wh_treatment', v)}>
                      <SelectTrigger className="h-8 text-sm rounded-lg bg-[rgba(255,255,255,.06)] border-[rgba(255,255,255,.1)] text-white">
                        <SelectValue placeholder="Selecionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {WH_TREATMENT_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-[#aaa] mb-1 block">Pre-Alert Date</Label>
                    <Input type="date" value={form.pre_alert_date} onChange={e => updateField('pre_alert_date', e.target.value)} className="h-8 text-sm rounded-lg bg-[rgba(255,255,255,.06)] border-[rgba(255,255,255,.1)] text-white" />
                  </div>
                  <div>
                    <Label className="text-xs text-[#aaa] mb-1 block">Customer Order</Label>
                    <Input value={form.customer_order} onChange={e => updateField('customer_order', e.target.value)} className="h-8 text-sm rounded-lg bg-[rgba(255,255,255,.06)] border-[rgba(255,255,255,.1)] text-white" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={form.oea_checklist} onCheckedChange={v => updateField('oea_checklist', !!v)} id="modal_oea" />
                    <Label htmlFor="modal_oea" className="text-xs cursor-pointer text-[#ccc]">OEA Check List Documental</Label>
                  </div>
                </>
              )}

              {/* EXPO-ONLY FIELDS */}
              {form.mode === 'expo' && (
                <>
                  <div className="col-span-1 md:col-span-2 lg:col-span-3">
                    <Label className="text-xs text-[#aaa] mb-2 block">D-Term</Label>
                    <RadioGroup value={form.d_term} onValueChange={v => updateField('d_term', v)} className="flex flex-wrap gap-4">
                      {['DAP', 'DPU', 'DDP'].map(opt => (
                        <div key={opt} className="flex items-center gap-1.5">
                          <RadioGroupItem value={opt} id={`modal-dt-${opt}`} />
                          <Label htmlFor={`modal-dt-${opt}`} className="text-xs cursor-pointer text-[#ccc]">{opt}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={form.pre_alert_sent} onCheckedChange={v => updateField('pre_alert_sent', !!v)} id="modal_pre_alert" />
                    <Label htmlFor="modal_pre_alert" className="text-xs cursor-pointer text-[#ccc]">Pre-Alert Sent</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={form.cargo_departed} onCheckedChange={v => updateField('cargo_departed', !!v)} id="modal_cargo" />
                    <Label htmlFor="modal_cargo" className="text-xs cursor-pointer text-[#ccc]">Cargo Departed</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={form.pod_dn_available} onCheckedChange={v => updateField('pod_dn_available', !!v)} id="modal_pod" />
                    <Label htmlFor="modal_pod" className="text-xs cursor-pointer text-[#ccc]">POD & DN Available</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={form.oea_checklist} onCheckedChange={v => updateField('oea_checklist', !!v)} id="modal_oea_expo" />
                    <Label htmlFor="modal_oea_expo" className="text-xs cursor-pointer text-[#ccc]">OEA Check List Documental</Label>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Extracted Fields — Collapsible Cards */}
          <CollapsibleCard title="AWB & Shipper" fields={awbShipperFields} form={form}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="MAWB Number *" field="awb_number" />
              <Field label="HAWB Number" field="hawb_number" />
              <Field label="Airport of Departure" field="airport_departure" />
              <Field label="Shipper Name" field="shipper_name" />
              <Field label="Shipper Address" field="shipper_address" span2 />
              <Field label="Shipper Account" field="shipper_account" />
            </div>
          </CollapsibleCard>

          <CollapsibleCard title="Agent & Routing" fields={agentRoutingFields} form={form}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Issuing Agent" field="issuing_agent" />
              <Field label="Agent City" field="agent_city" />
              <Field label="Agent IATA Code" field="agent_iata_code" />
              <Field label="Agent Account" field="agent_account" />
              <Field label="NIE Code" field="nie_code" />
              <Field label="NIF Code" field="nif_code" />
              <Field label="Routing / Destination" field="routing_destination" />
            </div>
          </CollapsibleCard>

          <CollapsibleCard title="Charges & Values" fields={chargesFields} form={form}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Currency" field="currency" />
              <Field label="CHGS WT/VAL" field="chgs_wt_val" />
              <Field label="Declared Value Carriage" field="declared_value_carriage" />
              <Field label="Declared Value Customs" field="declared_value_customs" />
              <Field label="Pieces" field="pieces" type="number" />
              <Field label="Gross Weight (kg)" field="gross_weight_kg" type="number" />
              <Field label="Rate Class" field="rate_class" />
              <Field label="Chargeable Weight" field="chargeable_weight" type="number" />
              <Field label="Rate" field="rate" type="number" />
              <Field label="Total Charge" field="total_charge" type="number" />
              <Field label="Other Charges Agent" field="other_charges_agent" type="number" />
              <Field label="Other Charges Carrier" field="other_charges_carrier" />
              <Field label="Total Prepaid" field="total_prepaid" type="number" />
              <Field label="Total Collect" field="total_collect" type="number" />
            </div>
          </CollapsibleCard>

          <CollapsibleCard title="Goods & Packaging" fields={goodsFields} form={form}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Nature of Goods" field="nature_of_goods" span2 />
              <Field label="HS Code" field="hs_code" />
              <Field label="ITN Number" field="itn_number" />
              <Field label="Packaging" field="packaging" span2 />
              <Field label="Volume (cbm)" field="volume_cbm" type="number" />
              <Field label="Dimensions" field="dimensions" />
            </div>
          </CollapsibleCard>

          <CollapsibleCard title="Handling & Signature" fields={handlingFields} form={form}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Handling References" field="handling_references" span2 />
              <Field label="Handling Info" field="handling_info" span2 />
              <Field label="Signature Name" field="signature_name" />
              <Field label="Signature Date" field="signature_date" />
              <Field label="Signature Place" field="signature_place" />
            </div>
          </CollapsibleCard>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving} className="gap-2 bg-[#ffc800] text-black hover:bg-[#e6b400]">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Cadastro
            </Button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
};
