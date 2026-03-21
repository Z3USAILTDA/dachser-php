

## Plano: Validação Visual com Borda Vermelha e Mensagem Inline

### Alterações em 3 arquivos

**Padrão comum para os 3 arquivos:**

1. Adicionar estado `const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());`

2. Modificar `updateField` para limpar o erro do campo ao digitar:
   ```typescript
   const updateField = (field, value) => {
     setForm(prev => ({ ...prev, [field]: value }));
     setValidationErrors(prev => { const n = new Set(prev); n.delete(field); return n; });
   };
   ```

3. Refatorar `handleSave` para coletar todos os campos obrigatórios vazios, setar no `validationErrors`, mostrar toast consolidado, e bloquear salvamento.

4. Modificar o componente `Field` para aceitar validação:
   - Label fica `text-red-400` se campo no `validationErrors`
   - Input recebe `border-red-500`
   - Mensagem inline `<span className="text-[10px] text-red-400">Campo obrigatório</span>` abaixo do input

5. Aplicar mesma lógica nos campos manuais renderizados inline (Clerk, Consignee, datas, etc.) -- não apenas os que usam `Field`.

---

### Campos obrigatórios (exceto Remarks, Customer Order, e checkboxes)

**Aéreo (`CadastroNovaModal.tsx`)**:
- Ambos modos: `clerk`, `consignee_nome`, `awb_number`, `etd`, `eta`
- IMPO: `shipper_name`, `green_light_date`, `pickup_date`, `service_level`, `airport_destination`, `wh_treatment`, `pre_alert_date`
- EXPO: `d_term`

**Marítimo (`CadastroMaritimoModal.tsx`)**:
- IMPO: `clerk`, `consignee_nome`, `shipper_name`, `po_number`, `green_light_date`, `etd`, `eta`, `ec_merchant`, `port_destination`, `pre_alert_date`, `pre_alert_comexpert`, `master_number`, `hbl_number`, `courier`
- EXPO: `clerk`, `consignee_nome`, `consignee_expo`, `po_number`, `hbl_number`, `master_number`, `port_origin`, `deadline_draft_vgm`, `deadline_load`, `etd`, `eta`, `free_time`, `d_term`

**Legado (`CadastroBl.tsx`)**:
- `bl_number`, `consignee_nome`, `clerk`, `etd`, `eta`

---

### Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/components/air/CadastroNovaModal.tsx` | `validationErrors` state, `updateField` limpa erro, `handleSave` valida todos, `Field` e campos inline com borda vermelha + mensagem |
| `src/components/sea/CadastroMaritimoModal.tsx` | Mesma lógica |
| `src/pages/sea/CadastroBl.tsx` | Mesma lógica |

