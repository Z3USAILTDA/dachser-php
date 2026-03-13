

## Plano: Reformular Tela de Cadastro Aéreo (Impo/Expo) + Colunas MariaDB

### 1. Adicionar colunas no MariaDB via edge function

A tabela `t_cadastro_aereo` precisa das novas colunas. Como é MariaDB (não Supabase), o `CREATE TABLE IF NOT EXISTS` no `olimpo-proxy` já garante a estrutura — vamos atualizar o schema inline e adicionar um `ALTER TABLE` condicional para tabelas existentes.

**Novas colunas a adicionar em `t_cadastro_aereo`:**

| Coluna | Tipo | Uso |
|--------|------|-----|
| `mode` | VARCHAR(10) | 'impo' ou 'expo' |
| `po_number` | VARCHAR(100) | P.O. |
| `green_light_date` | DATE | Green Light Sent Date |
| `pickup_date` | DATE | Pickup Date |
| `service_level` | VARCHAR(50) | Own Consol/Standard/Priority/Flash-BXO |
| `cct_transmitido` | TINYINT(1) | Checkbox CCT Transmitido |
| `airport_destination` | VARCHAR(100) | Aeroporto destino |
| `wh_treatment` | VARCHAR(255) | WH Treatment (já existe na t_air_master, criar aqui também) |
| `pre_alert_date` | DATE | Pre-Alert Date |
| `customer_order` | VARCHAR(255) | Customer Order |
| `oea_checklist` | TINYINT(1) | OEA Check List Documental |
| `d_term` | VARCHAR(10) | DAP/DPU/DDP (expo) |
| `pre_alert_sent` | TINYINT(1) | Pre-Alert Sent (expo) |
| `cargo_departed` | TINYINT(1) | Cargo Departed (expo) |
| `pod_dn_available` | TINYINT(1) | POD & DN Available (expo) |

**Arquivo**: `supabase/functions/olimpo-proxy/index.ts` — atualizar o `CREATE TABLE IF NOT EXISTS` (linhas 7914-7972) para incluir as novas colunas, e adicionar blocos `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` logo após o CREATE TABLE para garantir retrocompatibilidade com tabelas já existentes.

### 2. Reformular `CadastroNova.tsx`

**Arquivo**: `src/pages/air/CadastroNova.tsx`

#### 2a. Toggle Impo/Expo
- Adicionar estado `mode: 'impo' | 'expo'` com tabs/botões no topo
- Persistir no payload ao salvar

#### 2b. Expandir FormData
Adicionar os novos campos ao `interface FormData` e `emptyForm`:
- `mode`, `po_number`, `green_light_date`, `pickup_date`, `service_level`, `cct_transmitido`, `airport_destination`, `wh_treatment`, `pre_alert_date`, `customer_order`, `oea_checklist`, `d_term`, `pre_alert_sent`, `cargo_departed`, `pod_dn_available`

#### 2c. Seção "Campos Manuais" condicional
**IMPO** (anexos 1 e 2):
- Clerk (já existe, manter autocomplete)
- Shipper (input texto)
- Customer No. (já existe como `consignee_customer_number`)
- P.O.
- Green Light Sent Date (date picker)
- Pickup Date (date picker)
- Service Level (radio group: Own Consol, Standard, Priority, Flash/BXO)
- E.T.D. (data+hora, já existe)
- CCT Transmitido (checkbox)
- E.T.A./A.T.A. (data+hora, já existe)
- Airport at Destination (input)
- WH Treatment (select dropdown com opções):
  - TC1 - Liberação Imediata | RECOF
  - TC4 - Remoção Expressa | Recinto Aduaneiro
  - PEA: -18°C a 0 | FRO - Produtos Congelados
  - PEB: 2°C a 8°C | COL - Mercadoria resfriada/não congelada
  - PEC: 9°C a 15°C | ERT - Temperatura ambiente estendida +2°C a +25°C
  - PED: 16°C a 22°C | CRT - Controle de temperatura ambiente +15°C a +25°C
- Pre-Alert Date (date picker)
- Master No. (já existe como `awb_number`)
- HAWB No. (já existe)
- Customer Order (input)
- OEA Check List Documental (checkbox)

**EXPO** (anexo 3):
- Clerk (autocomplete, mesmo)
- Customer No.
- P.O.
- D-Term (radio group: DAP, DPU, DDP)
- HAWB No., Master No.
- E.T.D., E.T.A.
- Pre-Alert Sent (checkbox)
- Cargo Departed (checkbox)
- POD & DN Available (checkbox)
- OEA Check List Documental (checkbox)

#### 2d. Cards colapsáveis com contador
Cada seção não-manual (AWB & Shipper, Agent & Routing, Charges & Values, Goods & Packaging, Handling & Signature) será envolvida em um componente colapsável com:
- Header clicável com chevron
- Badge `{preenchidos}/{total}` (ex: "3/6")
- Usa `Collapsible` do Radix já existente no projeto
- Inicia colapsado por padrão

#### 2e. Atualizar `handleSave`
Incluir os novos campos no payload enviado ao `create_cadastro_aereo`.

### 3. Atualizar INSERT no edge function

**Arquivo**: `supabase/functions/olimpo-proxy/index.ts` (linhas 7974-8002)

Adicionar as novas colunas no INSERT INTO e nos VALUES correspondentes.

### Resumo de arquivos

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/olimpo-proxy/index.ts` | Novas colunas no CREATE TABLE + ALTER TABLE + INSERT |
| `src/pages/air/CadastroNova.tsx` | Toggle Impo/Expo, campos manuais, cards colapsáveis com contador |

