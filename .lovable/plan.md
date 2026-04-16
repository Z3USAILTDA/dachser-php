

## Plano: Campos Adicionais sempre nulos + validação obrigatória

### Problema
1. **cobrancaEmNomeDe** tem default `"DACHSER"` — já vem preenchido sem o operador escolher
2. **origemProcesso** é preenchido automaticamente do RM (linha 270-272) — deve ser escolha manual
3. **filial** é preenchido do RM (linha 240) — deve ser manual
4. Campos obrigatórios devem bloquear envio se vazios

### Alterações em `src/components/esteira/CreateVoucherDialog.tsx`

**1. Schema (L98)** — Mudar `cobrancaEmNomeDe` de `z.enum(["DACHSER", "CLIENTE"])` para `z.string().min(1, { message: "Cobrança em nome de é obrigatória" })` para permitir valor vazio inicial e validar

**2. Default values (L178)** — Mudar `cobrancaEmNomeDe: "DACHSER"` para `cobrancaEmNomeDe: ""`

**3. RM auto-fill (L240)** — Remover `form.setValue("filial", rmData.filial || "")` — filial deve ser manual

**4. RM auto-fill (L270-272)** — Remover o bloco que seta `origemProcesso` do modal RM — operador deve escolher manualmente

**5. Select de Cobrança em nome de (L1201)** — Trocar `defaultValue={field.value}` por `value={field.value || undefined}` e adicionar placeholder "Selecione..."

**6. Validação de origemProcesso** — Já existe (L398-406), mantém como está

### Resultado
- Todos os campos adicionais (Tipo de Documento, Filial, Cobrança em nome de, Forma de Pagamento) começam vazios
- Origem do Processo não é preenchida automaticamente do RM
- Validação bloqueia envio se campos obrigatórios estiverem vazios

