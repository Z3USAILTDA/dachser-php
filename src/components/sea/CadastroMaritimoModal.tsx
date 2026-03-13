import { useState, useCallback, useRef } from "react";
import { FilePlus, Loader2, Save, Search, User, Calendar, Ship, Package, Anchor } from "lucide-react";
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
};

interface CadastroMaritimoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export const CadastroMaritimoModal = ({ open, onOpenChange, onSuccess }: CadastroMaritimoModalProps) => {
  const [form, setForm] = useState<SeaFormData>({ ...emptySeaForm });
  const [isSaving, setIsSaving] = useState(false);

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

  const updateField = (field: keyof SeaFormData, value: string | boolean) => {
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
    if (!form.clerk) { toast.error("Clerk é obrigatório"); return; }
    if (!form.consignee_nome && form.mode === 'impo') { toast.error("Consignee é obrigatório"); return; }

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

      toast.success("Cadastro marítimo salvo!", { description: `ID: ${cadastroId}` });
      setForm({ ...emptySeaForm });
      setConsigneeSearch("");
      setClerkSearch("");
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    }
    setIsSaving(false);
  };

  const inputCls = "h-8 text-sm rounded-lg bg-[rgba(255,255,255,.06)] border-[rgba(255,255,255,.1)] text-white placeholder:text-[#666]";
  const labelCls = "text-xs text-[#aaa] mb-1 block";
  const checkCls = "text-xs cursor-pointer text-[#ccc]";

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

          {/* IMPO Fields */}
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

          {/* EXPO Fields */}
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
