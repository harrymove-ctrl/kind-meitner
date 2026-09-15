// Mock-first discovery data for the OKX onboarding demo. This module must stay
// free of network, credential and wallet dependencies; a live Portal adapter
// can replace the lookup behind the same shape in a later milestone.

export type MockOkxAgentCapability = "chat" | "market-intelligence";

export interface MockOkxAgent {
  id: string;
  name: string;
  description: string;
  provider: "OKX.ai";
  avatar: "chart";
  capabilities: MockOkxAgentCapability[];
  status: "available";
}

export interface OkxImportDescriptor {
  kind: "okx-mock";
  externalAgentId: string;
  provider: "OKX.ai";
  capabilities: MockOkxAgentCapability[];
}

export const MOCK_OKX_AGENTS: readonly MockOkxAgent[] = [
  {
    id: "okx-market-scout-v1",
    name: "Market Scout",
    description: "Summarizes OKX marketplace demand, pricing and active task categories.",
    provider: "OKX.ai",
    avatar: "chart",
    capabilities: ["chat", "market-intelligence"],
    status: "available",
  },
];

export function listMockOkxAgents(): readonly MockOkxAgent[] {
  return MOCK_OKX_AGENTS;
}

export function findMockOkxAgent(id: string): MockOkxAgent | undefined {
  return MOCK_OKX_AGENTS.find((agent) => agent.id === id);
}

export function mockOkxImportDescriptor(agent: MockOkxAgent): OkxImportDescriptor {
  return {
    kind: "okx-mock",
    externalAgentId: agent.id,
    provider: agent.provider,
    capabilities: [...agent.capabilities],
  };
}
