import { describe, expect, it } from "vitest";

import {
  findMockOkxAgent,
  listMockOkxAgents,
  mockOkxImportDescriptor,
} from "./agent-import.ts";

describe("mock OKX agent catalog", () => {
  it("exposes the deterministic Market Scout catalog entry", () => {
    expect(listMockOkxAgents()).toEqual([
      expect.objectContaining({
        id: "okx-market-scout-v1",
        name: "Market Scout",
        provider: "OKX.ai",
        capabilities: ["chat", "market-intelligence"],
        status: "available",
      }),
    ]);
  });

  it("finds one agent by opaque external id and does not invent unknown agents", () => {
    expect(findMockOkxAgent("okx-market-scout-v1")?.name).toBe("Market Scout");
    expect(findMockOkxAgent("not-an-okx-agent")).toBeUndefined();
  });

  it("copies the catalog capability list into an explicit safe import descriptor", () => {
    const agent = findMockOkxAgent("okx-market-scout-v1")!;
    const descriptor = mockOkxImportDescriptor(agent);
    expect(descriptor).toEqual({
      kind: "okx-mock",
      externalAgentId: "okx-market-scout-v1",
      provider: "OKX.ai",
      capabilities: ["chat", "market-intelligence"],
    });
    expect(descriptor.capabilities).not.toBe(agent.capabilities);
  });
});
