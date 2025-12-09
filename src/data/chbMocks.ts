import { ChbDocument, ChbAnalysis, ChbHistoryEntry, ChbNote, ChbStep } from '@/types/chb';

export const initialSteps: ChbStep[] = [
  { id: 1, label: '1 · Pré-Alerta', status: 'completed' },
  { id: 2, label: '2 · Instrução', status: 'current' },
  { id: 3, label: '3 · DI / Fechamento', status: 'pending' },
];

export const documentsByStep: Record<number, ChbDocument[]> = {
  1: [
    { id: 'd1', name: 'HBL_PRE_123456.pdf', type: 'HBL', uploadedAt: '14/10/2025 09:15', size: '245 KB' },
    { id: 'd2', name: 'Invoice_PRE_001.pdf', type: 'Invoice', uploadedAt: '14/10/2025 09:18', size: '128 KB' },
    { id: 'd3', name: 'PackingList_PRE.xlsx', type: 'Packing List', uploadedAt: '14/10/2025 09:20', size: '56 KB' },
  ],
  2: [
    { id: 'd4', name: 'HBL_INST_789012.pdf', type: 'HBL', uploadedAt: '15/10/2025 11:30', size: '312 KB' },
    { id: 'd5', name: 'Invoice_INST_002.pdf', type: 'Invoice', uploadedAt: '15/10/2025 11:35', size: '189 KB' },
    { id: 'd6', name: 'Certificado_Origem.pdf', type: 'Certificado', uploadedAt: '15/10/2025 11:40', size: '78 KB' },
  ],
  3: [
    { id: 'd7', name: 'DI_Final_345678.pdf', type: 'DI', uploadedAt: '16/10/2025 14:00', size: '425 KB' },
    { id: 'd8', name: 'Invoice_DI_003.pdf', type: 'Invoice', uploadedAt: '16/10/2025 14:05', size: '156 KB' },
  ],
};

export const analysisByStep: Record<number, ChbAnalysis> = {
  1: {
    id: 'a1',
    stepId: 1,
    content: `## Análise do Pré-Alerta

A conferência automática identificou os seguintes pontos:

• **Peso bruto declarado:** 1.250,00 kg — OK
• **Volumes declarados:** 45 caixas — OK
• **CNPJ destinatário:** 12.345.678/0001-99 — Validado
• **NCM principal:** 8471.30.19 — Conferido

**Conclusão:** Documentação do pré-alerta está em conformidade. Nenhuma divergência encontrada.`,
    tags: [
      { label: 'Tokens conferidos', variant: 'success' },
      { label: 'Pesos OK', variant: 'success' },
      { label: 'CNPJ validado', variant: 'success' },
    ],
    generatedAt: '15/10/2025 14:30',
  },
  2: {
    id: 'a2',
    stepId: 2,
    content: `## Análise da Instrução

A conferência automática identificou os seguintes pontos:

• **Peso bruto HBL:** 1.250,00 kg
• **Peso bruto Invoice:** 1.248,50 kg — ⚠️ Divergência de 1,5 kg
• **Valor FOB:** USD 45.320,00 — Conferido
• **Incoterm:** CIF — Verificado

**Atenção:** Pequena divergência de peso detectada entre documentos.`,
    tags: [
      { label: 'Divergência de pesos', variant: 'warning' },
      { label: 'Valor conferido', variant: 'success' },
      { label: 'Incoterm OK', variant: 'success' },
    ],
    generatedAt: '15/10/2025 16:45',
  },
  3: {
    id: 'a3',
    stepId: 3,
    content: `## Análise de DI / Fechamento

A conferência automática identificou os seguintes pontos:

• **Número DI:** 25/1234567-8 — Registrada
• **Canal:** Verde — Liberado
• **Impostos calculados:** R$ 12.456,78
• **ICMS:** R$ 3.245,00 — Pendente recolhimento

**Ação necessária:** Aguardando comprovante de recolhimento do ICMS.`,
    tags: [
      { label: 'DI registrada', variant: 'success' },
      { label: 'Canal verde', variant: 'success' },
      { label: 'ICMS pendente', variant: 'warning' },
    ],
    generatedAt: '16/10/2025 10:00',
  },
};

export const historyByStep: Record<number, ChbHistoryEntry[]> = {
  1: [
    {
      id: 'h1',
      stepId: 1,
      date: '15/10/2025 14:32',
      user: '@usuario.chb',
      summary: 'Pré-Alerta aprovado. Tokens conferidos, pesos OK, sem divergências de volumes. Documentação completa para prosseguir.',
    },
    {
      id: 'h2',
      stepId: 1,
      date: '14/10/2025 16:20',
      user: '@supervisor.dachser',
      summary: 'Primeira análise realizada. Solicitada revisão do certificado de origem antes da aprovação final.',
    },
  ],
  2: [
    {
      id: 'h3',
      stepId: 2,
      date: '15/10/2025 17:00',
      user: '@analista.fiscal',
      summary: 'Instrução em análise. Divergência de peso de 1,5 kg identificada. Aguardando retorno do exportador.',
    },
  ],
  3: [],
};

export const notesByStep: Record<number, ChbNote[]> = {
  1: [
    {
      id: 'n1',
      stepId: 1,
      user: '@usuario.chb',
      date: '14/10/2025 10:30',
      content: 'Cliente solicitou prioridade neste processo. Favor agilizar conferência.',
    },
    {
      id: 'n2',
      stepId: 1,
      user: '@supervisor.dachser',
      date: '14/10/2025 11:00',
      content: 'Entendido. Processo marcado como prioritário.',
    },
  ],
  2: [
    {
      id: 'n3',
      stepId: 2,
      user: '@analista.fiscal',
      date: '15/10/2025 15:30',
      content: 'Aguardando retificação de peso do exportador. Email enviado às 15:25.',
    },
  ],
  3: [],
};

export const stepTitles: Record<number, string> = {
  1: 'Pré-Alerta',
  2: 'Instrução',
  3: 'DI / Fechamento',
};
