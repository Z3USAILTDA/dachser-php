import { useState, useCallback, useRef, useMemo } from "react";
import { FilePlus, Loader2, Save, Search, User, Calendar, Ship, Package, Anchor, Copy, Check, Upload, ChevronDown, ChevronRight } from "lucide-react";
import { copyToClipboard } from "@/utils/clipboard";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

interface SeaFormData {
  mode: 'impo' | 'expo';
  clerk: string;
  clerk_email: string;
  consignee_nome: string;
  consignee_cnpj: string;
  consignee_customer_number: string;
  shipper_name: string;
  po_number: string;
  green_light_date: string;
  booking_confirmed: boolean;
  etd: string;
  dep: boolean;
  eta: string;
  eta_ata_confirmed: boolean;
  ec_merchant: string;
  port_destination: string;
  pre_alert_date: string;
  pre_alert_comexpert: string;
  dta: boolean;
  dachser_trucking: boolean;
  master_number: string;
  hbl_number: string;
  customer_order: string;
  accrual: boolean;
  courier: string;
  oea_checklist: boolean;
  remarks_1: string;
  remarks_2: string;
  // expo fields
  consignee_expo: string;
  port_origin: string;
  drafts_available: boolean;
  drafts_sent: boolean;
  deadline_draft_vgm: string;
  deadline_load: string;
  free_time: string;
  cargo_departed: boolean;
  pre_alert_sent: boolean;
  d_term: string;
  pod_available: boolean;
  dn_available: boolean;
  // BL extracted fields
  bl_number: string;
  shipper_address: string;
  notify_party: string;
  delivery_agent: string;
  port_loading: string;
  port_discharge: string;
  vessel_voyage: string;
  place_receipt: string;
  place_delivery: string;
  container_numbers: string;
  seal_numbers: string;
  marks_numbers: string;
  nature_of_goods: string;
  hs_code: string;
  gross_weight_kg: string;
  volume_cbm: string;
  pieces: string;
  packaging: string;
  freight_charges: string;
  freight_payment: string;
  service_type: string;
  total_prepaid: string;
  total_collect: string;
  num_original_bls: string;
  shipped_on_board_date: string;
  place_date_issue: string;
  issued_by: string;
}

const emptySeaForm: SeaFormData = {
  mode: 'impo',
  clerk: '', clerk_email: '',
  consignee_nome: '', consignee_cnpj: '', consignee_customer_number: '',
  shipper_name: '', po_number: '', green_light_date: '',
  booking_confirmed: false, etd: '', dep: false, eta: '',
  eta_ata_confirmed: false, ec_merchant: '', port_destination: '',
  pre_alert_date: '', pre_alert_comexpert: '', dta: false,
  dachser_trucking: false, master_number: '', hbl_number: '',
  customer_order: '', accrual: false, courier: '',
  oea_checklist: false, remarks_1: '', remarks_2: '',
  consignee_expo: '', port_origin: '',
  drafts_available: false, drafts_sent: false,
  deadline_draft_vgm: '', deadline_load: '', free_time: '',
  cargo_departed: false, pre_alert_sent: false, d_term: '',
  pod_available: false, dn_available: false,
  // BL fields
  bl_number: '', shipper_address: '', notify_party: '', delivery_agent: '',
  port_loading: '', port_discharge: '', vessel_voyage: '', place_receipt: '', place_delivery: '',
  container_numbers: '', seal_numbers: '', marks_numbers: '',
  nature_of_goods: '', hs_code: '', gross_weight_kg: '', volume_cbm: '', pieces: '', packaging: '',
  freight_charges: '', freight_payment: '', service_type: '', total_prepaid: '', total_collect: '',
  num_original_bls: '', shipped_on_board_date: '', place_date_issue: '', issued_by: '',
};

interface CadastroMaritimoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

// Collapsible section with fill counter
const CollapsibleSection = ({ title, icon, fields, form, children }: {
  title: string;
  icon?: React.ReactNode;
  fields: (keyof SeaFormData)[];
  form: SeaFormData;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const filled = fields.filter(f => {
    const v = form[f];
    return v !== '' && v !== false && v !== null && v !== undefined;
  }).length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between rounded-xl border border-[rgba(255,255,255,.1)] bg-[rgba(255,255,255,.03)] px-4 py-3 hover:bg-[rgba(255,255,255,.06)] transition-colors">
          <span className="text-sm font-semibold text-[#ffc800] flex items-center gap-2">
            {icon}
            {title}
          </span>
          <span className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${filled > 0 ? 'bg-[rgba(255,200,0,.2)] text-[#ffc800]' : 'bg-[rgba(255,255,255,.08)] text-[#666]'}`}>
              {filled}/{fields.length}
            </span>
            {open ? <ChevronDown className="h-4 w-4 text-[#aaa]" /> : <ChevronRight className="h-4 w-4 text-[#aaa]" />}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="rounded-b-xl border border-t-0 border-[rgba(255,255,255,.1)] bg-[rgba(255,255,255,.03)] px-4 pb-4 pt-3 -mt-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {children}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export const CadastroMaritimoModal = ({ open, onOpenChange, onSuccess }: CadastroMaritimoModalProps) => {
  const [form, setForm] = useState<SeaFormData>({ ...emptySeaForm });
  const [isSaving, setIsSaving] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [fileName, setFileName] = useState("");

  // Consignee autocomplete
  const [consigneeSearch, setConsigneeSearch] = useState("");
  const [consigneeSuggestions, setConsigneeSuggestions] = useState<ConsigneeSuggestion[]>([]);
  const [isSearchingConsignee, setIsSearchingConsignee] = useState(false);
  const [consigneeOpen, setConsigneeOpen] = useState(false);
  const consigneeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clerk autocomplete
  const [clerkSearch, setClerkSearch] = useState("");
  const [clerkSuggestions, setClerkSuggestions] = useState<AnalistaSuggestion[]>([]);
  const [isSearchingClerk, setIsSearchingClerk] = useState(false);
  const [clerkOpen, setClerkOpen] = useState(false);
  const clerkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());

  const updateField = (field: keyof SeaFormData, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setValidationErrors(prev => { const n = new Set(prev); n.delete(field); return n; });
  };

  // === PDF Upload & Extraction ===
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
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-bl-cadastro`,
        { method: "POST", headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` }, body: fd }
      );
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || "Erro na extração");
      const d = result.data;
      setForm(prev => ({
        ...prev,
        bl_number: d.bl_number || prev.bl_number,
        shipper_name: d.shipper_name || prev.shipper_name,
        shipper_address: d.shipper_address || prev.shipper_address,
        notify_party: d.notify_party || prev.notify_party,
        delivery_agent: d.delivery_agent || prev.delivery_agent,
        port_loading: d.port_loading || prev.port_loading,
        port_discharge: d.port_discharge || prev.port_discharge,
        vessel_voyage: d.vessel_voyage || prev.vessel_voyage,
        place_receipt: d.place_receipt || prev.place_receipt,
        place_delivery: d.place_delivery || prev.place_delivery,
        container_numbers: d.container_numbers || prev.container_numbers,
        seal_numbers: d.seal_numbers || prev.seal_numbers,
        marks_numbers: d.marks_numbers || prev.marks_numbers,
        nature_of_goods: d.nature_of_goods || prev.nature_of_goods,
        hs_code: d.hs_code || prev.hs_code,
        gross_weight_kg: d.gross_weight_kg != null ? String(d.gross_weight_kg) : prev.gross_weight_kg,
        volume_cbm: d.volume_cbm != null ? String(d.volume_cbm) : prev.volume_cbm,
        pieces: d.pieces != null ? String(d.pieces) : prev.pieces,
        packaging: d.packaging || prev.packaging,
        freight_charges: d.freight_charges || prev.freight_charges,
        freight_payment: d.freight_payment || prev.freight_payment,
        service_type: d.service_type || prev.service_type,
        total_prepaid: d.total_prepaid != null ? String(d.total_prepaid) : prev.total_prepaid,
        total_collect: d.total_collect != null ? String(d.total_collect) : prev.total_collect,
        num_original_bls: d.num_original_bls != null ? String(d.num_original_bls) : prev.num_original_bls,
        shipped_on_board_date: d.shipped_on_board_date || prev.shipped_on_board_date,
        place_date_issue: d.place_date_issue || prev.place_date_issue,
        issued_by: d.issued_by || prev.issued_by,
      }));
      if (d.consignee_name) {
        updateField("consignee_nome", d.consignee_name);
        setConsigneeSearch(d.consignee_name);
      }
      if (d.consignee_cnpj) updateField("consignee_cnpj", d.consignee_cnpj);
      toast.success(`Dados extraídos de ${file.name}`, { description: `${result.processingTimeMs}ms` });
    } catch (e: any) {
      toast.error("Erro na extração", { description: e.message });
    }
    setIsExtracting(false);
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
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=search_analistas&q=${encodeURIComponent(term)}&modal=SEA&limit=15`,
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

  const handleSave = async () => {
    const requiredImpo: { field: keyof SeaFormData; label: string }[] = [
      { field: 'clerk', label: 'Clerk' },
      { field: 'consignee_nome', label: 'Consignee' },
      { field: 'shipper_name', label: 'Shipper' },
      { field: 'po_number', label: 'P.O.' },
      { field: 'green_light_date', label: 'Green Light Date' },
      { field: 'etd', label: 'E.T.D.' },
      { field: 'eta', label: 'E.T.A.' },
      { field: 'ec_merchant', label: 'EC Merchant' },
      { field: 'port_destination', label: 'Port at Destination' },
      { field: 'pre_alert_date', label: 'Pre-Alert Date' },
      { field: 'pre_alert_comexpert', label: 'Pre-Alert Comexpert' },
      { field: 'master_number', label: 'Master No.' },
      { field: 'hbl_number', label: 'HBL No.' },
      { field: 'courier', label: 'Courier' },
    ];
    const requiredExpo: { field: keyof SeaFormData; label: string }[] = [
      { field: 'clerk', label: 'Clerk' },
      { field: 'consignee_nome', label: 'Customer No.' },
      { field: 'consignee_expo', label: 'Consignee' },
      { field: 'po_number', label: 'P.O.' },
      { field: 'hbl_number', label: 'HBL No.' },
      { field: 'master_number', label: 'Master No.' },
      { field: 'port_origin', label: 'Port of Origin' },
      { field: 'deadline_draft_vgm', label: 'Deadline Draft + VGM' },
      { field: 'deadline_load', label: 'Deadline Load' },
      { field: 'etd', label: 'E.T.D.' },
      { field: 'eta', label: 'E.T.A.' },
      { field: 'free_time', label: 'Free Time' },
      { field: 'd_term', label: 'D-Term' },
    ];

    const allRequired = form.mode === 'impo' ? requiredImpo : requiredExpo;
    const missing = allRequired.filter(r => !form[r.field]);
    if (missing.length > 0) {
      setValidationErrors(new Set(missing.map(m => m.field)));
      toast.error("Preencha todos os campos obrigatórios", { description: missing.map(m => m.label).join(', ') });
      return;
    }
    setValidationErrors(new Set());

    setIsSaving(true);
    try {
      const now = new Date();
      const cadastroId = `SEA-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
      const user = JSON.parse(localStorage.getItem("user") || "{}");

      const payload = {
        action: "create_cadastro_maritimo",
        cadastro_id: cadastroId,
        mode: form.mode,
        clerk: form.clerk,
        clerk_email: form.clerk_email,
        consignee_nome: form.consignee_nome || null,
        consignee_cnpj: form.consignee_cnpj || null,
        consignee_customer_number: form.consignee_customer_number || null,
        shipper_name: form.shipper_name || null,
        po_number: form.po_number || null,
        green_light_date: form.green_light_date || null,
        booking_confirmed: form.booking_confirmed,
        etd: form.etd || null,
        eta: form.eta || null,
        dep: form.dep,
        eta_ata_confirmed: form.eta_ata_confirmed,
        ec_merchant: form.ec_merchant || null,
        port_destination: form.port_destination || null,
        pre_alert_date: form.pre_alert_date || null,
        pre_alert_comexpert: form.pre_alert_comexpert || null,
        dta: form.dta,
        dachser_trucking: form.dachser_trucking,
        master_number: form.master_number || null,
        hbl_number: form.hbl_number || null,
        customer_order: form.customer_order || null,
        accrual: form.accrual,
        courier: form.courier || null,
        oea_checklist: form.oea_checklist,
        remarks_1: form.remarks_1 || null,
        remarks_2: form.remarks_2 || null,
        consignee_expo: form.consignee_expo || null,
        port_origin: form.port_origin || null,
        drafts_available: form.drafts_available,
        drafts_sent: form.drafts_sent,
        deadline_draft_vgm: form.deadline_draft_vgm || null,
        deadline_load: form.deadline_load || null,
        free_time: form.free_time || null,
        cargo_departed: form.cargo_departed,
        pre_alert_sent: form.pre_alert_sent,
        d_term: form.d_term || null,
        pod_available: form.pod_available,
        dn_available: form.dn_available,
        // BL extracted fields
        bl_number: form.bl_number || null,
        shipper_address: form.shipper_address || null,
        notify_party: form.notify_party || null,
        delivery_agent: form.delivery_agent || null,
        port_loading: form.port_loading || null,
        port_discharge: form.port_discharge || null,
        vessel_voyage: form.vessel_voyage || null,
        place_receipt: form.place_receipt || null,
        place_delivery: form.place_delivery || null,
        container_numbers: form.container_numbers || null,
        seal_numbers: form.seal_numbers || null,
        marks_numbers: form.marks_numbers || null,
        nature_of_goods: form.nature_of_goods || null,
        hs_code: form.hs_code || null,
        gross_weight_kg: form.gross_weight_kg ? parseFloat(form.gross_weight_kg) : null,
        volume_cbm: form.volume_cbm ? parseFloat(form.volume_cbm) : null,
        pieces: form.pieces ? parseInt(form.pieces) : null,
        packaging: form.packaging || null,
        freight_charges: form.freight_charges || null,
        freight_payment: form.freight_payment || null,
        service_type: form.service_type || null,
        total_prepaid: form.total_prepaid ? parseFloat(form.total_prepaid) : null,
        total_collect: form.total_collect ? parseFloat(form.total_collect) : null,
        num_original_bls: form.num_original_bls ? parseInt(form.num_original_bls) : null,
        shipped_on_board_date: form.shipped_on_board_date || null,
        place_date_issue: form.place_date_issue || null,
        issued_by: form.issued_by || null,
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

      await copyToClipboard(preAlertTitle);
      toast.success("Cadastro marítimo salvo! Título Pre-Alert copiado.", { description: `ID: ${cadastroId}` });
      setForm({ ...emptySeaForm });
      setConsigneeSearch("");
      setClerkSearch("");
      setFileName("");
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    }
    setIsSaving(false);
  };

  const [copied, setCopied] = useState(false);

  const formatDateForTitle = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
  };

  const preAlertTitle = useMemo(() => {
    const parts: string[] = ['Dachser Pre-Alert SE'];
    if (form.po_number) parts.push(`PO: ${form.po_number};`);
    if (form.consignee_customer_number) parts.push(form.consignee_customer_number);
    if (form.hbl_number) parts.push(`HBL: ${form.hbl_number}`);
    if (form.master_number) parts.push(`MBL: ${form.master_number}`);
    const consignee = form.mode === 'expo' ? form.consignee_expo : form.consignee_nome;
    if (consignee) parts.push(consignee);
    if (form.mode === 'expo' && form.consignee_expo) parts.push(`Consignee: ${form.consignee_expo}`);
    if (form.mode === 'impo' && form.consignee_nome) parts.push(`Consignee: ${form.consignee_nome}`);
    const port = form.mode === 'impo' ? form.port_destination : form.port_origin;
    if (port) parts.push(port);
    const etdFmt = formatDateForTitle(form.etd);
    if (etdFmt) parts.push(`ETD: ${etdFmt}`);
    const etaFmt = formatDateForTitle(form.eta);
    if (etaFmt) parts.push(`ETA: ${etaFmt}`);
    return parts.join(' - ');
  }, [form.po_number, form.consignee_customer_number, form.hbl_number, form.master_number, form.consignee_nome, form.consignee_expo, form.port_destination, form.port_origin, form.etd, form.eta, form.mode]);

  const handleCopyTitle = async () => {
    const ok = await copyToClipboard(preAlertTitle);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); toast.success("Título copiado!"); }
  };

  const inputCls = "h-8 text-sm rounded-lg bg-[rgba(255,255,255,.06)] border-[rgba(255,255,255,.1)] text-white placeholder:text-[#666]";
  const labelCls = "text-xs text-[#aaa] mb-1 block";
  const checkCls = "text-xs cursor-pointer text-[#ccc]";
  const hasError = (field: string) => validationErrors.has(field);

  const Field = ({ label, field, type = "text", span2 = false }: { label: string; field: keyof SeaFormData; type?: string; span2?: boolean }) => (
    <div className={span2 ? "col-span-1 md:col-span-2" : ""}>
      <Label className={labelCls}>{label}</Label>
      <Input
        type={type}
        value={form[field] as string}
        onChange={e => updateField(field, e.target.value)}
        className={inputCls}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-[rgba(5,6,18,.97)] border-[rgba(255,255,255,.12)] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Anchor className="h-5 w-5 text-[#ffc800]" />
            Novo Processo Marítimo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* PDF Upload Zone */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) handleFileUpload(file);
            }}
            className="border-2 border-dashed border-[rgba(255,200,0,.3)] rounded-xl p-6 text-center hover:border-[rgba(255,200,0,.6)] transition-colors cursor-pointer bg-[rgba(255,200,0,.03)]"
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
                <Loader2 className="h-8 w-8 animate-spin text-[#ffc800]" />
                <p className="text-sm text-[#aaa]">Extraindo dados do BL...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-[rgba(255,200,0,.5)]" />
                <p className="text-sm text-[#aaa]">
                  {fileName ? `Arquivo: ${fileName}` : "Arraste um PDF de Bill of Lading ou clique para selecionar"}
                </p>
                <p className="text-xs text-[#666]">A extração automática preenche os campos abaixo</p>
              </div>
            )}
          </div>

          {/* Mode Toggle */}
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1 bg-[rgba(255,255,255,.06)] border border-[rgba(255,255,255,.1)] rounded-full p-1">
              <button
                onClick={() => updateField('mode', 'impo')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  form.mode === 'impo' ? 'bg-[#ffc800] text-black' : 'text-[#aaa] hover:text-white'
                }`}
              >
                <Ship className="h-3.5 w-3.5" />
                Importação
              </button>
              <button
                onClick={() => updateField('mode', 'expo')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  form.mode === 'expo' ? 'bg-[#ffc800] text-black' : 'text-[#aaa] hover:text-white'
                }`}
              >
                <Package className="h-3.5 w-3.5" />
                Exportação
              </button>
            </div>
          </div>

          {/* Identification */}
          <div className="rounded-xl border border-[rgba(255,255,255,.1)] bg-[rgba(255,255,255,.03)] p-4 space-y-4">
            <h3 className="text-sm font-semibold text-[#ffc800] flex items-center gap-2">
              <User className="h-4 w-4" /> Identificação
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Clerk */}
              <div>
                <Label className={labelCls}>Clerk (Analista) *</Label>
                <Popover open={clerkOpen} onOpenChange={setClerkOpen}>
                  <PopoverTrigger asChild>
                    <div className="relative">
                      <Input
                        value={clerkSearch || form.clerk}
                        onChange={e => handleClerkInput(e.target.value)}
                        placeholder="Digite para buscar analista..."
                        className={`${inputCls} pr-8`}
                      />
                      {isSearchingClerk ? <Loader2 className="absolute right-2 top-1.5 h-4 w-4 animate-spin text-[#aaa]" /> : <Search className="absolute right-2 top-1.5 h-4 w-4 text-[#666]" />}
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

              {/* Customer No / Consignee */}
              <div>
                <Label className={labelCls}>{form.mode === 'impo' ? 'Consignee *' : 'Customer No. *'}</Label>
                <Popover open={consigneeOpen} onOpenChange={setConsigneeOpen}>
                  <PopoverTrigger asChild>
                    <div className="relative">
                      <Input
                        value={consigneeSearch || form.consignee_nome}
                        onChange={e => handleConsigneeInput(e.target.value)}
                        placeholder="Digite para buscar cliente..."
                        className={`${inputCls} pr-8`}
                      />
                      {isSearchingConsignee ? <Loader2 className="absolute right-2 top-1.5 h-4 w-4 animate-spin text-[#aaa]" /> : <Search className="absolute right-2 top-1.5 h-4 w-4 text-[#666]" />}
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

              <div>
                <Label className={labelCls}>Customer No.</Label>
                <Input value={form.consignee_customer_number} onChange={e => updateField('consignee_customer_number', e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          {/* IMPO Fields (manual - first) */}
          {form.mode === 'impo' && (
            <div className="rounded-xl border border-[rgba(255,255,255,.1)] bg-[rgba(255,255,255,.03)] p-4 space-y-4">
              <h3 className="text-sm font-semibold text-[#ffc800] flex items-center gap-2">
                <Ship className="h-4 w-4" /> Campos — Importação
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label className={labelCls}>Shipper</Label>
                  <Input value={form.shipper_name} onChange={e => updateField('shipper_name', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <Label className={labelCls}>P.O. *</Label>
                  <Input value={form.po_number} onChange={e => updateField('po_number', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <Label className={labelCls}>Green Light Sent Date</Label>
                  <Input type="date" value={form.green_light_date} onChange={e => updateField('green_light_date', e.target.value)} className={inputCls} />
                </div>
                <div className="flex items-center gap-2 self-end pb-1">
                  <Checkbox checked={form.booking_confirmed} onCheckedChange={v => updateField('booking_confirmed', !!v)} id="sea_booking" />
                  <Label htmlFor="sea_booking" className={checkCls}>Booking Confirmed</Label>
                </div>
                <div>
                  <Label className={`${labelCls} flex items-center gap-1`}><Calendar className="h-3 w-3" /> E.T.D.</Label>
                  <Input type="datetime-local" value={form.etd} onChange={e => updateField('etd', e.target.value)} className={inputCls} />
                </div>
                <div className="flex items-center gap-2 self-end pb-1">
                  <Checkbox checked={form.dep} onCheckedChange={v => updateField('dep', !!v)} id="sea_dep" />
                  <Label htmlFor="sea_dep" className={checkCls}>DEP</Label>
                </div>
                <div>
                  <Label className={`${labelCls} flex items-center gap-1`}><Calendar className="h-3 w-3" /> E.T.A. / A.T.A.</Label>
                  <Input type="datetime-local" value={form.eta} onChange={e => updateField('eta', e.target.value)} className={inputCls} />
                </div>
                <div className="flex items-center gap-2 self-end pb-1">
                  <Checkbox checked={form.eta_ata_confirmed} onCheckedChange={v => updateField('eta_ata_confirmed', !!v)} id="sea_eta_conf" />
                  <Label htmlFor="sea_eta_conf" className={checkCls}>E.T.A./A.T.A. Confirmed</Label>
                </div>
                <div>
                  <Label className={labelCls}>EC Merchant</Label>
                  <Input value={form.ec_merchant} onChange={e => updateField('ec_merchant', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <Label className={labelCls}>Port at Destination</Label>
                  <Input value={form.port_destination} onChange={e => updateField('port_destination', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <Label className={labelCls}>Pre-Alert Date</Label>
                  <Input type="date" value={form.pre_alert_date} onChange={e => updateField('pre_alert_date', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <Label className={labelCls}>Pre-Alert Comexpert</Label>
                  <Input type="date" value={form.pre_alert_comexpert} onChange={e => updateField('pre_alert_comexpert', e.target.value)} className={inputCls} />
                </div>
                <div className="flex items-center gap-2 self-end pb-1">
                  <Checkbox checked={form.dta} onCheckedChange={v => updateField('dta', !!v)} id="sea_dta" />
                  <Label htmlFor="sea_dta" className={checkCls}>DTA</Label>
                </div>
                <div className="flex items-center gap-2 self-end pb-1">
                  <Checkbox checked={form.dachser_trucking} onCheckedChange={v => updateField('dachser_trucking', !!v)} id="sea_trucking" />
                  <Label htmlFor="sea_trucking" className={checkCls}>Dachser Trucking</Label>
                </div>
                <div>
                  <Label className={labelCls}>Master No.</Label>
                  <Input value={form.master_number} onChange={e => updateField('master_number', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <Label className={labelCls}>HBL No.</Label>
                  <Input value={form.hbl_number} onChange={e => updateField('hbl_number', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <Label className={labelCls}>Customer Order</Label>
                  <Input value={form.customer_order} onChange={e => updateField('customer_order', e.target.value)} className={inputCls} />
                </div>
                <div className="flex items-center gap-2 self-end pb-1">
                  <Checkbox checked={form.accrual} onCheckedChange={v => updateField('accrual', !!v)} id="sea_accrual" />
                  <Label htmlFor="sea_accrual" className={checkCls}>Accrual</Label>
                </div>
                <div>
                  <Label className={labelCls}>Courier</Label>
                  <Input value={form.courier} onChange={e => updateField('courier', e.target.value)} className={inputCls} />
                </div>
                <div className="flex items-center gap-2 self-end pb-1">
                  <Checkbox checked={form.oea_checklist} onCheckedChange={v => updateField('oea_checklist', !!v)} id="sea_oea_impo" />
                  <Label htmlFor="sea_oea_impo" className={checkCls}>OEA Check List Documental</Label>
                </div>
                <div className="col-span-1 md:col-span-2 lg:col-span-3">
                  <Label className={labelCls}>Remarks 1</Label>
                  <Textarea value={form.remarks_1} onChange={e => updateField('remarks_1', e.target.value)} className="text-sm rounded-lg bg-[rgba(255,255,255,.06)] border-[rgba(255,255,255,.1)] text-white min-h-[60px]" />
                </div>
                <div className="col-span-1 md:col-span-2 lg:col-span-3">
                  <Label className={labelCls}>Remarks 2</Label>
                  <Textarea value={form.remarks_2} onChange={e => updateField('remarks_2', e.target.value)} className="text-sm rounded-lg bg-[rgba(255,255,255,.06)] border-[rgba(255,255,255,.1)] text-white min-h-[60px]" />
                </div>
              </div>
            </div>
          )}

          {/* EXPO Fields (manual - first) */}
          {form.mode === 'expo' && (
            <div className="rounded-xl border border-[rgba(255,255,255,.1)] bg-[rgba(255,255,255,.03)] p-4 space-y-4">
              <h3 className="text-sm font-semibold text-[#ffc800] flex items-center gap-2">
                <Package className="h-4 w-4" /> Campos — Exportação
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label className={labelCls}>Consignee</Label>
                  <Input value={form.consignee_expo} onChange={e => updateField('consignee_expo', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <Label className={labelCls}>P.O. *</Label>
                  <Input value={form.po_number} onChange={e => updateField('po_number', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <Label className={labelCls}>Customer Order *</Label>
                  <Input value={form.customer_order} onChange={e => updateField('customer_order', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <Label className={labelCls}>HBL No.</Label>
                  <Input value={form.hbl_number} onChange={e => updateField('hbl_number', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <Label className={labelCls}>Master No.</Label>
                  <Input value={form.master_number} onChange={e => updateField('master_number', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <Label className={labelCls}>Port of Origin</Label>
                  <Input value={form.port_origin} onChange={e => updateField('port_origin', e.target.value)} className={inputCls} />
                </div>
                <div className="flex items-center gap-2 self-end pb-1">
                  <Checkbox checked={form.drafts_available} onCheckedChange={v => updateField('drafts_available', !!v)} id="sea_drafts_avail" />
                  <Label htmlFor="sea_drafts_avail" className={checkCls}>Drafts Available</Label>
                </div>
                <div className="flex items-center gap-2 self-end pb-1">
                  <Checkbox checked={form.drafts_sent} onCheckedChange={v => updateField('drafts_sent', !!v)} id="sea_drafts_sent" />
                  <Label htmlFor="sea_drafts_sent" className={checkCls}>Drafts Sent</Label>
                </div>
                <div>
                  <Label className={`${labelCls} flex items-center gap-1`}><Calendar className="h-3 w-3" /> Deadline REAL Draft + VGM</Label>
                  <Input type="datetime-local" value={form.deadline_draft_vgm} onChange={e => updateField('deadline_draft_vgm', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <Label className={labelCls}>Deadline Load</Label>
                  <Input type="date" value={form.deadline_load} onChange={e => updateField('deadline_load', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <Label className={`${labelCls} flex items-center gap-1`}><Calendar className="h-3 w-3" /> E.T.D.</Label>
                  <Input type="datetime-local" value={form.etd} onChange={e => updateField('etd', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <Label className={`${labelCls} flex items-center gap-1`}><Calendar className="h-3 w-3" /> E.T.A. / A.T.A.</Label>
                  <Input type="datetime-local" value={form.eta} onChange={e => updateField('eta', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <Label className={labelCls}>Free Time</Label>
                  <Input value={form.free_time} onChange={e => updateField('free_time', e.target.value)} className={inputCls} />
                </div>
                <div className="flex items-center gap-2 self-end pb-1">
                  <Checkbox checked={form.cargo_departed} onCheckedChange={v => updateField('cargo_departed', !!v)} id="sea_cargo" />
                  <Label htmlFor="sea_cargo" className={checkCls}>Cargo Departed</Label>
                </div>
                <div className="flex items-center gap-2 self-end pb-1">
                  <Checkbox checked={form.pre_alert_sent} onCheckedChange={v => updateField('pre_alert_sent', !!v)} id="sea_pre_alert" />
                  <Label htmlFor="sea_pre_alert" className={checkCls}>Pre-Alert Sent</Label>
                </div>
                <div className="col-span-1 md:col-span-2 lg:col-span-3">
                  <Label className={`${labelCls} mb-2`}>D-Term</Label>
                  <RadioGroup value={form.d_term} onValueChange={v => updateField('d_term', v)} className="flex flex-wrap gap-4">
                    {['DAP', 'DPU', 'DDP'].map(opt => (
                      <div key={opt} className="flex items-center gap-1.5">
                        <RadioGroupItem value={opt} id={`sea-dt-${opt}`} />
                        <Label htmlFor={`sea-dt-${opt}`} className={checkCls}>{opt}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
                <div className="flex items-center gap-2 self-end pb-1">
                  <Checkbox checked={form.pod_available} onCheckedChange={v => updateField('pod_available', !!v)} id="sea_pod" />
                  <Label htmlFor="sea_pod" className={checkCls}>POD Available</Label>
                </div>
                <div className="flex items-center gap-2 self-end pb-1">
                  <Checkbox checked={form.accrual} onCheckedChange={v => updateField('accrual', !!v)} id="sea_accrual_expo" />
                  <Label htmlFor="sea_accrual_expo" className={checkCls}>Accrual</Label>
                </div>
                <div className="flex items-center gap-2 self-end pb-1">
                  <Checkbox checked={form.dn_available} onCheckedChange={v => updateField('dn_available', !!v)} id="sea_dn" />
                  <Label htmlFor="sea_dn" className={checkCls}>DN Available</Label>
                </div>
                <div className="flex items-center gap-2 self-end pb-1">
                  <Checkbox checked={form.oea_checklist} onCheckedChange={v => updateField('oea_checklist', !!v)} id="sea_oea_expo" />
                  <Label htmlFor="sea_oea_expo" className={checkCls}>OEA Check List Documental</Label>
                </div>
              </div>
            </div>
          )}

          {/* BL Collapsible Sections (auto-filled by PDF) */}
          <CollapsibleSection
            title="BL & Shipper"
            icon={<Anchor className="h-4 w-4" />}
            fields={['bl_number', 'shipper_name', 'shipper_address', 'notify_party', 'delivery_agent']}
            form={form}
          >
            <Field label="BL Number" field="bl_number" />
            <Field label="Shipper Name" field="shipper_name" />
            <Field label="Shipper Address" field="shipper_address" span2 />
            <Field label="Notify Party" field="notify_party" span2 />
            <Field label="Delivery Agent" field="delivery_agent" span2 />
          </CollapsibleSection>

          <CollapsibleSection
            title="Vessel & Routing"
            icon={<Ship className="h-4 w-4" />}
            fields={['vessel_voyage', 'port_loading', 'port_discharge', 'place_receipt', 'place_delivery']}
            form={form}
          >
            <Field label="Vessel / Voyage" field="vessel_voyage" />
            <Field label="Port of Loading" field="port_loading" />
            <Field label="Port of Discharge" field="port_discharge" />
            <Field label="Place of Receipt" field="place_receipt" />
            <Field label="Place of Delivery" field="place_delivery" />
          </CollapsibleSection>

          <CollapsibleSection
            title="Containers"
            icon={<Package className="h-4 w-4" />}
            fields={['container_numbers', 'seal_numbers', 'marks_numbers']}
            form={form}
          >
            <Field label="Container Numbers" field="container_numbers" span2 />
            <Field label="Seal Numbers" field="seal_numbers" span2 />
            <Field label="Marks and Numbers" field="marks_numbers" span2 />
          </CollapsibleSection>

          <CollapsibleSection
            title="Charges & Freight"
            fields={['freight_charges', 'freight_payment', 'service_type', 'total_prepaid', 'total_collect']}
            form={form}
          >
            <Field label="Freight Charges" field="freight_charges" span2 />
            <Field label="Freight Payment (Prepaid/Collect)" field="freight_payment" />
            <Field label="Service Type (LCL/FCL)" field="service_type" />
            <Field label="Total Prepaid" field="total_prepaid" type="number" />
            <Field label="Total Collect" field="total_collect" type="number" />
          </CollapsibleSection>

          <CollapsibleSection
            title="Goods & Packaging"
            fields={['nature_of_goods', 'hs_code', 'gross_weight_kg', 'volume_cbm', 'pieces', 'packaging']}
            form={form}
          >
            <Field label="Nature of Goods" field="nature_of_goods" span2 />
            <Field label="HS Code / NCM" field="hs_code" />
            <Field label="Gross Weight (kg)" field="gross_weight_kg" type="number" />
            <Field label="Volume (CBM)" field="volume_cbm" type="number" />
            <Field label="Pieces" field="pieces" type="number" />
            <Field label="Packaging" field="packaging" span2 />
          </CollapsibleSection>

          <CollapsibleSection
            title="Issuance"
            fields={['shipped_on_board_date', 'place_date_issue', 'issued_by', 'num_original_bls']}
            form={form}
          >
            <Field label="Shipped on Board Date" field="shipped_on_board_date" />
            <Field label="Place and Date of Issue" field="place_date_issue" />
            <Field label="Issued By" field="issued_by" />
            <Field label="No. of Original BLs" field="num_original_bls" type="number" />
          </CollapsibleSection>

          {/* Pre-Alert Title Preview */}
          <div className="rounded-xl border border-[rgba(255,200,0,.25)] bg-[rgba(255,200,0,.06)] p-4 space-y-2">
            <Label className="text-xs text-[#ffc800] font-semibold block">Título Pre-Alert (assunto do e-mail)</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-[rgba(0,0,0,.3)] border border-[rgba(255,255,255,.1)] rounded-lg px-3 py-2 text-sm text-[#ccc] select-all break-all min-h-[36px]">
                {preAlertTitle || <span className="text-[#666] italic">Preencha os campos para gerar o título...</span>}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopyTitle}
                disabled={!preAlertTitle || preAlertTitle === 'Dachser Pre-Alert SE'}
                className="shrink-0 h-9 w-9 border-[rgba(255,255,255,.15)] hover:bg-[rgba(255,200,0,.15)]"
              >
                {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-[#aaa]" />}
              </Button>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={isSaving} className="bg-[#ffc800] text-black hover:bg-[#e6b400] rounded-full px-6 font-semibold">
              {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</> : <><Save className="h-4 w-4 mr-2" /> Salvar Processo</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
