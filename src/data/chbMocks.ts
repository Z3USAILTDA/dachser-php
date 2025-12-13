import { ChbStep } from '@/types/chb';

export const initialSteps: ChbStep[] = [
  { id: 1, label: '1 · Pré-Alerta', status: 'current' },
  { id: 2, label: '2 · Instrução', status: 'pending' },
  { id: 3, label: '3 · DI / Fechamento', status: 'pending' },
];

export const stepTitles: Record<number, string> = {
  1: 'Pré-Alerta',
  2: 'Instrução',
  3: 'DI / Fechamento',
};
