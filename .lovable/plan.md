

## Plano: Modal de Cadastro Marítimo na Tela de Monitoramento FCL/LCL

Criar um modal "Novo Processo Marítimo" na tela `ContainerTracking.tsx`, seguindo o mesmo padrão do modal aéreo (`CadastroNovaModal.tsx`). O modal terá toggle Impo/Expo com campos distintos conforme os screenshots. Novas colunas devem ser criadas na tabela `t_cadastro_maritimo`.

### 1. Adicionar colunas no MariaDB

Atualizar o `CREATE TABLE IF NOT EXISTS` do `t_cadastro_maritimo` no `olimpo-proxy` e adicionar `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para retrocompatibilidade.

**Novas colunas:**

| Coluna | Tipo | Modo |
|--------|------|------|
| `mode` | VARCHAR(10) | ambos |
| `po_number` | VARCHAR(100) | ambos |
| `green_light_date` | DATE | impo |
| `booking_confirmed` | TINYINT(1) | impo |
| `dep` | TINYINT(1) | impo |
| `eta_ata_confirmed` | TINYINT(1) | impo |
| `ec_merchant` | VARCHAR(255) | impo |
| `port_destination` | VARCHAR(255) | impo |
| `pre_alert_date` | DATE | ambos |
| `pre_alert_comexpert` | DATE | impo |
| `dta` | TINYINT(1) | impo |
| `dachser_trucking` | TINYINT(1) | impo |
| `hbl_number` | VARCHAR(100) | ambos |
| `master_number` | VARCHAR(100) | ambos |
| `customer_order` | VARCHAR(255) | ambos |
| `accrual` | TINYINT(1) | ambos |
| `courier` | VARCHAR(255) | impo |
| `oea_checklist` | TINYINT(1) | ambos |
| `remarks_1` | TEXT | impo |
| `remarks_2` | TEXT | impo |
| `consignee_expo` | VARCHAR(255) | expo |
| `port_origin` | VARCHAR(255) | expo |
| `drafts_available` | TINYINT(1) | expo |
| `drafts_sent` | TINYINT(1) | expo |
| `deadline_draft_vgm` | DATETIME | expo |
| `deadline_load` | DATE | expo |
| `free_time` | VARCHAR(100) | expo |
| `cargo_departed` | TINYINT(1) | expo |
| `pre_alert_sent` | TINYINT(1) | expo |
| `d_term` | VARCHAR(10) | expo |
| `pod_available` | TINYINT(1) | expo |
| `dn_available` | TINYINT(1) | expo |

### 2. Criar `src/components/sea/CadastroMaritimoModal.tsx`

Componente `Dialog` com:
- Toggle Impo/Expo (pill-style, como o aéreo)
- **Seção 1 — Identificação** (ambos): Clerk* (autocomplete analistas SEA), Customer No.* (autocomplete clientes_base)
- **Seção IMPO**: Shipper, P.O.*, Green Light Sent Date, Booking Confirmed ☐, E.T.D. (datetime), DEP ☐, E.T.A./A.T.A. (datetime), E.T.A./A.T.A. Confirmed ☐, EC Merchant, Port at destination, Pre-Alert Date, Pre-Alert Comexpert (date), DTA ☐, Dachser Trucking ☐, Master No., HBL No., Customer Order, Accrual ☐, Courier, OEA Check List Documental ☐, Remarks 1 (textarea), Remarks 2 (textarea)
- **Seção EXPO**: Consignee, P.O.*, Customer Order*, HBL No., Master No., Port of origin, Drafts available ☐, Drafts sent ☐, Deadline REAL Draft + VGM (datetime), Deadline Load (date), E.T.D., E.T.A./A.T.A., Free Time (input), Cargo Departed ☐, Pre-Alert sent ☐, D-Term (radio: DAP/DPU/DDP), POD available ☐, Accrual ☐, DN available ☐, OEA Check List Documental ☐
- Props: `open`, `onOpenChange`, `onSuccess`
- Ao salvar: POST `create_cadastro_maritimo` com todos os campos + fechar modal + callback

### 3. Atualizar `src/pages/ContainerTracking.tsx`

- Importar `CadastroMaritimoModal`
- Estado `cadastroMaritimoOpen`
- Botão "Novo Processo" (verde `#ffc800`) ao lado do botão ADM (~linha 2091), visível para `isAdmin`
- Renderizar `<CadastroMaritimoModal />`

### 4. Atualizar INSERT no `olimpo-proxy`

Incluir todas as novas colunas no INSERT INTO e VALUES do `create_cadastro_maritimo`.

### Resumo de arquivos

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/olimpo-proxy/index.ts` | Novas colunas no CREATE TABLE + ALTER TABLE + INSERT |
| `src/components/sea/CadastroMaritimoModal.tsx` | Novo — modal com formulário Impo/Expo |
| `src/pages/ContainerTracking.tsx` | Botão "Novo Processo" + estado + render do modal |

