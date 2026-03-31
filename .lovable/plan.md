

## Alterações na Notificação de Cobrança de Demurrage

### Diagnóstico

Arquivo principal: `supabase/functions/demurrage-send-alert/index.ts`
Hook que monta os dados: `src/hooks/useDemurrageData.ts` (função `useSendTestAlert`)

### Alteração 1: Tarifa Dachser para todos os containers

**Problema**: Linha 161-163 — `calculatePeriods` filtra tarifas por `armador` do container. Deveria sempre usar a tarifa com armador = `'DACHSER'`.

**Correção**: Em `calculatePeriods` (linha 159), ignorar o parâmetro `armador` recebido e sempre filtrar por `'dachser'` na comparação com `r.armador`.

```typescript
// Antes:
r.armador?.toLowerCase() === armador?.toLowerCase()

// Depois:
r.armador?.toLowerCase() === 'dachser'
```

### Alteração 2: Assunto do e-mail

**Problema**: Linha 485 — o subject usa `shipment_master` (MBL). Deveria usar `house_bl` (HBL).

**Correção**:
```typescript
// Antes:
const subject = `${testPrefix}Notificação de Cobrança - ${shipment_master || container_number || 'N/A'}`;

// Depois:
const subject = `${testPrefix}Notificação de sobreestadia BL ${house_bl || shipment_master || container_number || 'N/A'}`;
```

### Alteração 3: Corpo do e-mail

**Problema**: Linhas 74-100 — o texto atual fala de "free time vencido" e "minuta de devolução". Deve ser substituído pelo modelo fornecido, que foca em "custos de D&D – Sobreestadia de Contêineres".

**Correção**: Reescrever `generateNotificationHtml` com o texto exato fornecido. O detalhamento (tabela de containers) continuará no XLSX em anexo, mas o corpo do e-mail mencionará as informações do embarque (MBL, HBL, cliente). A função passará a receber parâmetros para inserir o detalhamento inline.

Novo corpo:
```
Prezados(as),

Identificamos custos de D&D – Sobreestadia de Contêineres referentes ao(s) embarque(s) mencionado(s) abaixo:

[Detalhamento: Cliente, HBL, MBL]

Caso haja alguma divergência, solicitamos que seja sinalizada com a devida evidência no prazo de 48 horas a contar desta data.
Após este período, os custos serão considerados válidos e será emitida Nota de Débito para pagamento.

Atenciosamente,

Time Demurrage & Detention
Air & Sea Logistics Brazil

DACHSER Brasil Logística Ltda.
Santos Office
Rua Amador Bueno, 333 – Sl. 1201/1202, Centro
Santos, SP - 11013-151.
```

### Arquivos alterados

1. **`supabase/functions/demurrage-send-alert/index.ts`**
   - `calculatePeriods`: forçar armador = `'dachser'`
   - `subject`: trocar para `Notificação de sobreestadia BL {house_bl}`
   - `generateNotificationHtml`: reescrever com o texto do modelo, recebendo `client_name`, `house_bl`, `shipment_master` para o detalhamento inline

### O que NÃO muda

- Geração do XLSX (demonstrativo)
- Lógica de envio via Resend
- Hook `useSendTestAlert` no frontend
- Nenhum arquivo frontend

