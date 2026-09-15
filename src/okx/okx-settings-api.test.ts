import { describe, expect, it, vi } from "vitest";

import { saveOkxSettings } from "./okx-settings-api";

const settings = {
  treasuryBalance: 300,
  maxPerRunSpend: 75,
  monthlyBudgetCap: 750,
  token: "USDT",
};

describe("saveOkxSettings", () => {
  it("submits only the runtime settings payload", async () => {
    let requestInit: RequestInit | undefined;
    const fetcher: typeof fetch = async (_input, init) => {
      requestInit = init;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    await saveOkxSettings(settings, fetcher);

    expect(requestInit).toMatchObject({
      method: "POST",
      body: JSON.stringify(settings),
    });
    const body = String(requestInit?.body);
    for (const key of ["apiKey", "secretKey", "passphrase", "webhookSecret", "baseUrl"]) {
      expect(body).not.toContain(key);
    }
  });

  it("throws the server failure instead of treating a rejected save as success", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "OKX credentials are server-only" }), { status: 400 }));
    await expect(saveOkxSettings(settings, fetcher as typeof fetch)).rejects.toThrow("OKX credentials are server-only");
  });
});
