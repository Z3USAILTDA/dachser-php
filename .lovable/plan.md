

# Cadastro BL (Bill of Lading) - Tela SEA

## Objetivo
Criar uma nova pagina `/sea/cadastro-bl` para cadastro de Bill of Lading (BL) maritimo, seguindo o mesmo padrao da tela AIR "Cadastro NOVA" (`/air/cadastro-nova`). A tela sera visivel apenas para admins Z3US no menu SEA, posicionada antes de "Analise Documental SEA".

## O que sera criado

### 1. Edge Function: `parse-bl-cadastro`
Nova edge function para extrair dados de PDFs de Bill of Lading usando Gemini Vision. Campos extraidos do BL:

- **BL Number** (numero do BL)
- **Shipper** (nome e endereco)
- **Consignee** (nome, endereco, CNPJ)
- **Notify Party**
- **Delivery Agent**
- **Port of Loading**
- **Port of Discharge**
- **Vessel / Voyage Number**
- **Place of Receipt**
- **Place of Delivery**
- **Container Numbers** (com seal numbers)
- **Marks and Numbers**
- **Goods Description / Nature of Goods**
- **HS Code / NCM**
- **Gross Weight (kg)**
- **Volume (CBM)**
- **Number of Packages**
- **Packaging Type**
- **Freight Charges** (ocean freight, origin charges, BAF, DTHC, etc.)
- **Freight Payment** (Prepaid/Collect)
- **Service Type** (LCL/FCL)
- **Number of Original BLs**
- **Shipped on Board Date**
- **Place and Date of Issue**
- **Issued By**

### 2. Pagina Frontend: `src/pages/sea/CadastroBl.tsx`
Pagina identica em layout ao `CadastroNova.tsx`, com:

- **Upload Zone**: Drag & drop de PDF do BL
- **Campos Manuais**: Consignee (autocomplete via olimpo-proxy), Clerk/Analista (autocomplete modal SEA), ETD, ETA
- **Campos Extraidos** organizados em cards:
  - BL & Shipper (bl_number, shipper_name, shipper_address, notify_party)
  - Vessel & Routing (vessel_voyage, port_loading, port_discharge, place_receipt, place_delivery)
  - Containers (container_numbers, seal_numbers)
  - Charges & Freight (freight_charges, freight_payment, service_type, total_prepaid, total_collect)
  - Goods & Packaging (nature_of_goods, hs_code, gross_weight_kg, volume_cbm, pieces, packaging)
  - Issuance (shipped_on_board_date, place_date_issue, issued_by, num_original_bls)
- **Botao Salvar**: Persiste no MariaDB via `olimpo-proxy`

### 3. Tabela MariaDB: `t_cadastro_maritimo`
Criada via acao `setup_t_cadastro_maritimo` no `olimpo-proxy`, com todos os campos do BL.

### 4. Rota e Menu
- Nova rota `/sea/cadastro-bl` no `App.tsx`
- Novo item "Cadastro BL" no menu SEA do `Dashboard.tsx`, com `z3usOnly: true`, posicionado como primeiro item (antes de "Analise Documental SEA")

## Detalhes Tecnicos

### Arquivos a criar:
- `supabase/functions/parse-bl-cadastro/index.ts` - Edge function de extracao com Gemini 3 Pro Preview
- `src/pages/sea/CadastroBl.tsx` - Pagina frontend

### Arquivos a modificar:
- `src/App.tsx` - Adicionar rota `/sea/cadastro-bl`
- `src/pages/Dashboard.tsx` - Adicionar item de menu no grupo SEA
- `supabase/functions/olimpo-proxy/index.ts` - Adicionar acoes `setup_t_cadastro_maritimo` e `create_cadastro_maritimo`
- `supabase/config.toml` - Registrar nova edge function (verify_jwt = false)

### Fluxo:
1. Usuario faz upload do PDF do BL
2. `parse-bl-cadastro` envia o PDF para Gemini Vision e extrai os campos
3. Campos sao preenchidos automaticamente no formulario
4. Usuario preenche/corrige campos manuais (Consignee, Clerk, ETD, ETA)
5. Ao salvar, `olimpo-proxy` com acao `create_cadastro_maritimo` persiste no MariaDB

### Autocomplete:
- Consignee: `olimpo-proxy?action=search_clientes_base` (mesmo do AIR)
- Clerk: `olimpo-proxy?action=search_analistas&modal=SEA` (filtro modal SEA)

