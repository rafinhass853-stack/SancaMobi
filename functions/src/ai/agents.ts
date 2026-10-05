export type AiRole = "PASSENGER" | "DRIVER" | "STORE" | "ADMIN" | "SUPPORT";
export type AiAgent =
  | "PASSENGER_ASSISTANT"
  | "DRIVER_COPILOT"
  | "STORE_MANAGER"
  | "ADMIN_CONTROL_TOWER"
  | "FINANCE_ANALYST"
  | "COMPLIANCE_GUARD"
  | "OPERATIONS_ANALYST"
  | "SUPPORT_TRIAGE";

export type AiActionRisk = "READ_ONLY" | "REVERSIBLE" | "SENSITIVE" | "FINANCIAL";

export interface AiToolDefinition {
  name: string;
  description: string;
  risk: AiActionRisk;
  allowedAgents: AiAgent[];
  requiresConfirmation: boolean;
}

export const AI_TOOLS: AiToolDefinition[] = [
  { name: "getPassengerTrip", description: "Consulta uma corrida ou pedido do passageiro.", risk: "READ_ONLY", allowedAgents: ["PASSENGER_ASSISTANT", "SUPPORT_TRIAGE"], requiresConfirmation: false },
  { name: "createFoodCart", description: "Monta um carrinho a partir do catálogo.", risk: "REVERSIBLE", allowedAgents: ["PASSENGER_ASSISTANT"], requiresConfirmation: false },
  { name: "requestRide", description: "Solicita uma corrida.", risk: "REVERSIBLE", allowedAgents: ["PASSENGER_ASSISTANT"], requiresConfirmation: true },
  { name: "requestFoodOrder", description: "Envia um pedido ao estabelecimento.", risk: "REVERSIBLE", allowedAgents: ["PASSENGER_ASSISTANT"], requiresConfirmation: true },
  { name: "getDriverEarnings", description: "Consulta ganhos e repasses do motorista.", risk: "READ_ONLY", allowedAgents: ["DRIVER_COPILOT"], requiresConfirmation: false },
  { name: "getDemandInsights", description: "Consulta indicadores agregados de demanda.", risk: "READ_ONLY", allowedAgents: ["DRIVER_COPILOT", "ADMIN_CONTROL_TOWER", "OPERATIONS_ANALYST"], requiresConfirmation: false },
  { name: "updateStoreMenu", description: "Cria ou altera itens do cardápio.", risk: "REVERSIBLE", allowedAgents: ["STORE_MANAGER"], requiresConfirmation: true },
  { name: "createStorePromotion", description: "Cria uma promoção aprovada pelo lojista.", risk: "REVERSIBLE", allowedAgents: ["STORE_MANAGER"], requiresConfirmation: true },
  { name: "getFinancialDashboard", description: "Consulta GMV, taxas, repasses, custos e margem.", risk: "READ_ONLY", allowedAgents: ["ADMIN_CONTROL_TOWER", "FINANCE_ANALYST"], requiresConfirmation: false },
  { name: "simulateCommission", description: "Simula impacto de tarifa e comissão sem alterar produção.", risk: "READ_ONLY", allowedAgents: ["ADMIN_CONTROL_TOWER", "FINANCE_ANALYST"], requiresConfirmation: false },
  { name: "flagComplianceIssue", description: "Registra alerta de conformidade para revisão humana.", risk: "SENSITIVE", allowedAgents: ["COMPLIANCE_GUARD", "ADMIN_CONTROL_TOWER"], requiresConfirmation: false },
  { name: "blockServiceEligibility", description: "Impede temporariamente um serviço quando uma regra objetiva de compliance é violada.", risk: "SENSITIVE", allowedAgents: ["COMPLIANCE_GUARD"], requiresConfirmation: true },
  { name: "openHumanSupportCase", description: "Escalona atendimento para uma pessoa.", risk: "REVERSIBLE", allowedAgents: ["SUPPORT_TRIAGE", "PASSENGER_ASSISTANT", "DRIVER_COPILOT", "STORE_MANAGER"], requiresConfirmation: false }
];

export const AI_AGENT_POLICIES: Record<AiAgent, { role: AiRole; canExecuteFinancial: boolean; canChangeCompliance: boolean }> = {
  PASSENGER_ASSISTANT: { role: "PASSENGER", canExecuteFinancial: false, canChangeCompliance: false },
  DRIVER_COPILOT: { role: "DRIVER", canExecuteFinancial: false, canChangeCompliance: false },
  STORE_MANAGER: { role: "STORE", canExecuteFinancial: false, canChangeCompliance: false },
  ADMIN_CONTROL_TOWER: { role: "ADMIN", canExecuteFinancial: false, canChangeCompliance: false },
  FINANCE_ANALYST: { role: "ADMIN", canExecuteFinancial: false, canChangeCompliance: false },
  COMPLIANCE_GUARD: { role: "ADMIN", canExecuteFinancial: false, canChangeCompliance: true },
  OPERATIONS_ANALYST: { role: "ADMIN", canExecuteFinancial: false, canChangeCompliance: false },
  SUPPORT_TRIAGE: { role: "SUPPORT", canExecuteFinancial: false, canChangeCompliance: false }
};
