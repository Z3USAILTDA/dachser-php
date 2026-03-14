

## Plano: Integrar campos do Cadastro BL no modal CadastroMaritimoModal

O modal atual (`CadastroMaritimoModal.tsx`) tem apenas os campos manuais (Impo/Expo) mas falta toda a parte de dados do BL que existia na tela `CadastroBl.tsx`. A ideia é replicar a mesma lógica do aéreo: o modal absorve tudo que tinha na página dedicada.

### Campos faltantes (vindos do CadastroBl)

O modal já tem: clerk, consignee, ETD, ETA, e os campos manuais impo/expo. Faltam:

1. **Upload de PDF com extração automática** — zona de drag-and-drop que chama `parse-bl-cadastro` e preenche os campos
2. **BL & Shipper** — BL Number, Shipper Name, Shipper Address, Notify Party, Delivery Agent
3. **Vessel & Routing** — Vessel/Voyage, Port of Loading, Port of Discharge, Place of Receipt, Place of Delivery
4. **Containers** — Container Numbers, Seal Numbers, Marks and Numbers
5. **Charges & Freight** — Freight Charges, Freight Payment, Service Type, Total Prepaid, Total Collect
6. **Goods & Packaging** — Nature of Goods, HS Code, Gross Weight, Volume CBM, Pieces, Packaging
7. **Issuance** — Shipped on Board Date, Place/Date of Issue, Issued By, No. of Original BLs

### Implementação

1. **Expandir `SeaFormData`** no modal para incluir todos os 28 campos do BL que estão no `CadastroBl.tsx` (bl_number, shipper_name, shipper_address, notify_party, delivery_agent, port_loading, port_discharge, vessel_voyage, place_receipt, place_delivery, container_numbers, seal_numbers, marks_numbers, nature_of_goods, hs_code, gross_weight_kg, volume_cbm, pieces, packaging, freight_charges, freight_payment, service_type, total_prepaid, total_collect, num_original_bls, shipped_on_board_date, place_date_issue, issued_by)

2. **Adicionar zona de upload PDF** no topo do modal (antes da seção Identificação), com a mesma lógica de extração via `parse-bl-cadastro`

3. **Adicionar as seções colapsáveis** (como no aéreo) com contador de preenchimento:
   - BL & Shipper (x/5)
   - Vessel & Routing (x/5)
   - Containers (x/3)
   - Charges & Freight (x/5)
   - Goods & Packaging (x/6)
   - Issuance (x/4)

4. **Atualizar o payload do `handleSave`** para enviar todos os campos extras ao backend

5. **Arquivo editado**: `src/components/sea/CadastroMaritimoModal.tsx`

