/**
 * Mapeamento de etapa destino → roles que devem ser notificadas por e-mail.
 *
 * OPERACAO / AJUSTE_OPERACAO / GESTOR_OPERACAO nunca recebem e-mail,
 * pois a Operação é quem inicia o processo.
 */

type EsteiraStage =
  | "OPERACAO"
  | "AJUSTE_OPERACAO"
  | "FISCAL"
  | "AJUSTE_FISCAL"
  | "SUPERVISOR"
  | "FINANCEIRO"
  | "ROBO"
  | "CONCLUIDO";

const STAGE_TO_ROLES: Record<EsteiraStage, string[]> = {
  OPERACAO: [],
  AJUSTE_OPERACAO: ["OPERACAO"], // fixed list handled in edge function
  FISCAL: ["FISCAL", "GESTOR_FISCAL"],
  AJUSTE_FISCAL: ["FISCAL", "GESTOR_FISCAL"],
  SUPERVISOR: ["SUPERVISOR", "GESTOR_SUPERVISOR"],
  FINANCEIRO: ["FINANCEIRO", "GESTOR_FINANCEIRO"],
  ROBO: ["FINANCEIRO", "GESTOR_FINANCEIRO"],
  CONCLUIDO: [],
};

/**
 * Retorna true se a etapa destino deve disparar notificação por e-mail.
 */
export function shouldNotifyStage(toStage: string): boolean {
  const roles = STAGE_TO_ROLES[toStage as EsteiraStage];
  return !!roles && roles.length > 0;
}

/**
 * Retorna as roles que devem ser notificadas para uma etapa destino.
 */
export function getRolesForStage(toStage: string): string[] {
  return STAGE_TO_ROLES[toStage as EsteiraStage] || [];
}
