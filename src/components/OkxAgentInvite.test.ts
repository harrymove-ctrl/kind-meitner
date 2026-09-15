import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OkxAgentInvite, canInviteOkxAgent, parseOkxCatalog } from "./OkxAgentInvite";

const marketScout = {
  id: "okx-market-scout-v1",
  name: "Market Scout",
  description: "Summarizes OKX marketplace demand, pricing and active task categories.",
  provider: "OKX.ai",
  avatar: "chart",
  capabilities: ["chat", "market-intelligence"],
  status: "available",
};

describe("OkxAgentInvite", () => {
  it("only enables the control for local non-DM rooms", () => {
    expect(canInviteOkxAgent({}, false)).toBe(true);
    expect(canInviteOkxAgent({ dm: true }, false)).toBe(false);
    expect(canInviteOkxAgent({}, true)).toBe(false);
  });

  it("accepts only a complete display-safe catalog shape", () => {
    expect(parseOkxCatalog({ source: "mock", agents: [marketScout] })).toEqual({ agents: [marketScout] });
    expect(parseOkxCatalog({ agents: [{ ...marketScout, capabilities: ["chat", 4] }] })).toBeNull();
    expect(parseOkxCatalog({ agents: [{ ...marketScout, description: null }] })).toBeNull();
  });

  it("renders a compact closed control without fetching the catalog", () => {
    const markup = renderToStaticMarkup(createElement(OkxAgentInvite, { roomId: "room-1" }));
    expect(markup).toContain("Invite OKX agent");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("Market Scout");
  });
});
