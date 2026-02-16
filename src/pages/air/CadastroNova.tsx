import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus, Upload, Loader2, Save, Search, User, Calendar } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { PageLayout } from "@/components/layout/PageLayout";

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
}

const emptyForm: FormData = {
  awb_number: "", airport_departure: "", shipper_name: "", shipper_address: "", shipper_account: "",
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
};

const CadastroNova = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fileName, setFileName] = useState("");

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

  // Auth check
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) { navigate("/login"); return; }
    const parsed = JSON.parse(storedUser);
    if (parsed.is_admin !== 1) { navigate("/dashboard"); }
  }, [navigate]);

  const updateField = (field: keyof FormData, value: string) => {
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
    if (!form.awb_number) { toast.error("AWB Number é obrigatório"); return; }
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
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    }
    setIsSaving(false);
  };

  const Field = ({ label, field, type = "text", span2 = false }: { label: string; field: keyof FormData; type?: string; span2?: boolean }) => (
    <div className={span2 ? "col-span-1 md:col-span-2" : ""}>
      <Label className="text-xs text-muted-foreground mb-1 block">{label}</Label>
      <Input
        type={type}
        value={form[field]}
        onChange={e => updateField(field, e.target.value)}
        className="h-8 text-sm rounded-lg"
      />
    </div>
  );

  return (
    <PageLayout title="DACHSER" subtitle="Cadastro NOVA" backTo="/dashboard">
      <div className="space-y-6">
        {/* Upload Zone */}
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-primary/40 rounded-xl p-8 text-center hover:border-primary/70 transition-colors cursor-pointer"
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
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Extraindo dados do HAWB...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-primary/60" />
              <p className="text-sm text-muted-foreground">
                {fileName ? `Arquivo: ${fileName}` : "Arraste um PDF HAWB ou clique para selecionar"}
              </p>
            </div>
          )}
        </div>

        {/* Manual Fields: Consignee, Clerk, ETD, ETA */}
        <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
            <User className="h-4 w-4" /> Campos Manuais
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Consignee */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Consignee *</Label>
              <Popover open={consigneeOpen} onOpenChange={setConsigneeOpen}>
                <PopoverTrigger asChild>
                  <div className="relative">
                    <Input
                      value={consigneeSearch || form.consignee_nome}
                      onChange={e => handleConsigneeInput(e.target.value)}
                      placeholder="Digite para buscar cliente..."
                      className="h-8 text-sm rounded-lg pr-8"
                    />
                    {isSearchingConsignee && <Loader2 className="absolute right-2 top-1.5 h-4 w-4 animate-spin text-muted-foreground" />}
                    {!isSearchingConsignee && <Search className="absolute right-2 top-1.5 h-4 w-4 text-muted-foreground" />}
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

            {/* Clerk */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Clerk (Analista) *</Label>
              <Popover open={clerkOpen} onOpenChange={setClerkOpen}>
                <PopoverTrigger asChild>
                  <div className="relative">
                    <Input
                      value={clerkSearch || form.clerk}
                      onChange={e => handleClerkInput(e.target.value)}
                      placeholder="Digite para buscar analista..."
                      className="h-8 text-sm rounded-lg pr-8"
                    />
                    {isSearchingClerk && <Loader2 className="absolute right-2 top-1.5 h-4 w-4 animate-spin text-muted-foreground" />}
                    {!isSearchingClerk && <Search className="absolute right-2 top-1.5 h-4 w-4 text-muted-foreground" />}
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

            {/* ETD */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                <Calendar className="h-3 w-3" /> ETD
              </Label>
              <Input
                type="datetime-local"
                value={form.etd}
                onChange={e => updateField("etd", e.target.value)}
                className="h-8 text-sm rounded-lg"
              />
            </div>

            {/* ETA */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                <Calendar className="h-3 w-3" /> ETA
              </Label>
              <Input
                type="datetime-local"
                value={form.eta}
                onChange={e => updateField("eta", e.target.value)}
                className="h-8 text-sm rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Extracted Fields */}
        <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-primary">AWB & Shipper</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="AWB Number *" field="awb_number" />
            <Field label="Airport of Departure" field="airport_departure" />
            <Field label="Shipper Name" field="shipper_name" />
            <Field label="Shipper Address" field="shipper_address" span2 />
            <Field label="Shipper Account" field="shipper_account" />
          </div>
        </div>

        <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-primary">Agent & Routing</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Issuing Agent" field="issuing_agent" />
            <Field label="Agent City" field="agent_city" />
            <Field label="Agent IATA Code" field="agent_iata_code" />
            <Field label="Agent Account" field="agent_account" />
            <Field label="NIE Code" field="nie_code" />
            <Field label="NIF Code" field="nif_code" />
            <Field label="Routing / Destination" field="routing_destination" />
          </div>
        </div>

        <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-primary">Charges & Values</h3>
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
        </div>

        <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-primary">Goods & Packaging</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Nature of Goods" field="nature_of_goods" span2 />
            <Field label="HS Code" field="hs_code" />
            <Field label="ITN Number" field="itn_number" />
            <Field label="Packaging" field="packaging" span2 />
            <Field label="Volume (cbm)" field="volume_cbm" type="number" />
            <Field label="Dimensions" field="dimensions" />
          </div>
        </div>

        <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-primary">Handling & Signature</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Handling References" field="handling_references" span2 />
            <Field label="Handling Info" field="handling_info" span2 />
            <Field label="Signature Name" field="signature_name" />
            <Field label="Signature Date" field="signature_date" />
            <Field label="Signature Place" field="signature_place" />
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Cadastro
          </Button>
        </div>
      </div>
    </PageLayout>
  );
};

export default CadastroNova;
