import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Loader2, Save, Search, User, Calendar, Anchor } from "lucide-react";
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
  bl_number: string;
  shipper_name: string;
  shipper_address: string;
  consignee_nome: string;
  consignee_cnpj: string;
  consignee_customer_number: string;
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
  clerk: string;
  clerk_email: string;
  etd: string;
  eta: string;
}

const emptyForm: FormData = {
  bl_number: "", shipper_name: "", shipper_address: "",
  consignee_nome: "", consignee_cnpj: "", consignee_customer_number: "",
  notify_party: "", delivery_agent: "",
  port_loading: "", port_discharge: "", vessel_voyage: "", place_receipt: "", place_delivery: "",
  container_numbers: "", seal_numbers: "", marks_numbers: "",
  nature_of_goods: "", hs_code: "", gross_weight_kg: "", volume_cbm: "", pieces: "", packaging: "",
  freight_charges: "", freight_payment: "", service_type: "", total_prepaid: "", total_collect: "",
  num_original_bls: "", shipped_on_board_date: "", place_date_issue: "", issued_by: "",
  clerk: "", clerk_email: "", etd: "", eta: "",
};

const CadastroBl = () => {
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

  // === Clerk autocomplete (modal SEA) ===
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
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-bl-cadastro`,
        { method: "POST", headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` }, body: fd }
      );
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || "Erro na extração");
      const d = result.data;
      setForm(prev => ({
        ...prev,
        bl_number: d.bl_number || "",
        shipper_name: d.shipper_name || "",
        shipper_address: d.shipper_address || "",
        notify_party: d.notify_party || "",
        delivery_agent: d.delivery_agent || "",
        port_loading: d.port_loading || "",
        port_discharge: d.port_discharge || "",
        vessel_voyage: d.vessel_voyage || "",
        place_receipt: d.place_receipt || "",
        place_delivery: d.place_delivery || "",
        container_numbers: d.container_numbers || "",
        seal_numbers: d.seal_numbers || "",
        marks_numbers: d.marks_numbers || "",
        nature_of_goods: d.nature_of_goods || "",
        hs_code: d.hs_code || "",
        gross_weight_kg: d.gross_weight_kg != null ? String(d.gross_weight_kg) : "",
        volume_cbm: d.volume_cbm != null ? String(d.volume_cbm) : "",
        pieces: d.pieces != null ? String(d.pieces) : "",
        packaging: d.packaging || "",
        freight_charges: d.freight_charges || "",
        freight_payment: d.freight_payment || "",
        service_type: d.service_type || "",
        total_prepaid: d.total_prepaid != null ? String(d.total_prepaid) : "",
        total_collect: d.total_collect != null ? String(d.total_collect) : "",
        num_original_bls: d.num_original_bls != null ? String(d.num_original_bls) : "",
        shipped_on_board_date: d.shipped_on_board_date || "",
        place_date_issue: d.place_date_issue || "",
        issued_by: d.issued_by || "",
      }));
      // Pre-fill consignee from extraction (user can override with autocomplete)
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleSave = async () => {
    if (!form.bl_number) { toast.error("BL Number é obrigatório"); return; }
    if (!form.consignee_nome) { toast.error("Consignee é obrigatório"); return; }
    if (!form.clerk) { toast.error("Clerk é obrigatório"); return; }

    setIsSaving(true);
    try {
      const now = new Date();
      const cadastroId = `BL-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      
      const payload = {
        action: "create_cadastro_maritimo",
        cadastro_id: cadastroId,
        ...form,
        pieces: form.pieces ? parseInt(form.pieces) : null,
        gross_weight_kg: form.gross_weight_kg ? parseFloat(form.gross_weight_kg) : null,
        volume_cbm: form.volume_cbm ? parseFloat(form.volume_cbm) : null,
        total_prepaid: form.total_prepaid ? parseFloat(form.total_prepaid) : null,
        total_collect: form.total_collect ? parseFloat(form.total_collect) : null,
        num_original_bls: form.num_original_bls ? parseInt(form.num_original_bls) : null,
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
      
      toast.success("Cadastro BL salvo!", { description: `ID: ${cadastroId}` });
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
    <PageLayout title="DACHSER" subtitle="Cadastro BL" backTo="/dashboard">
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
              <p className="text-sm text-muted-foreground">Extraindo dados do BL...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-primary/60" />
              <p className="text-sm text-muted-foreground">
                {fileName ? `Arquivo: ${fileName}` : "Arraste um PDF de Bill of Lading ou clique para selecionar"}
              </p>
            </div>
          )}
        </div>

        {/* Manual Fields: Consignee, Clerk, ETD, ETA */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
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
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
            <Anchor className="h-4 w-4" /> BL & Shipper
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="BL Number *" field="bl_number" />
            <Field label="Shipper Name" field="shipper_name" />
            <Field label="Shipper Address" field="shipper_address" span2 />
            <Field label="Notify Party" field="notify_party" span2 />
            <Field label="Delivery Agent" field="delivery_agent" span2 />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <h3 className="text-sm font-semibold text-primary">Vessel & Routing</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Vessel / Voyage" field="vessel_voyage" />
            <Field label="Port of Loading" field="port_loading" />
            <Field label="Port of Discharge" field="port_discharge" />
            <Field label="Place of Receipt" field="place_receipt" />
            <Field label="Place of Delivery" field="place_delivery" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <h3 className="text-sm font-semibold text-primary">Containers</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Container Numbers" field="container_numbers" span2 />
            <Field label="Seal Numbers" field="seal_numbers" span2 />
            <Field label="Marks and Numbers" field="marks_numbers" span2 />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <h3 className="text-sm font-semibold text-primary">Charges & Freight</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Freight Charges" field="freight_charges" span2 />
            <Field label="Freight Payment (Prepaid/Collect)" field="freight_payment" />
            <Field label="Service Type (LCL/FCL)" field="service_type" />
            <Field label="Total Prepaid" field="total_prepaid" type="number" />
            <Field label="Total Collect" field="total_collect" type="number" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <h3 className="text-sm font-semibold text-primary">Goods & Packaging</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Nature of Goods" field="nature_of_goods" span2 />
            <Field label="HS Code / NCM" field="hs_code" />
            <Field label="Gross Weight (kg)" field="gross_weight_kg" type="number" />
            <Field label="Volume (CBM)" field="volume_cbm" type="number" />
            <Field label="Pieces" field="pieces" type="number" />
            <Field label="Packaging" field="packaging" span2 />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <h3 className="text-sm font-semibold text-primary">Issuance</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Shipped on Board Date" field="shipped_on_board_date" />
            <Field label="Place and Date of Issue" field="place_date_issue" />
            <Field label="Issued By" field="issued_by" />
            <Field label="No. of Original BLs" field="num_original_bls" type="number" />
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Cadastro BL
          </Button>
        </div>
      </div>
    </PageLayout>
  );
};

export default CadastroBl;
