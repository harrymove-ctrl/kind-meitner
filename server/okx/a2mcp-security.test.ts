import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { launchVerificationServer, type VerificationServer } from "../../scripts/control-kind-meitner.ts";

type JsonResponse = Omit<Response, "json"> & { json(): Promise<any> };

const rpc = (id: string, method: string, params?: Record<string, unknown>) => ({
  jsonrpc: "2.0",
  id,
  method,
  ...(params ? { params } : {}),
});

describe("OKX A2MCP Phase 1.5 security hardening", () => {
  let fixture: VerificationServer;
  let baseUrl: string;

  beforeAll(async () => {
    fixture = await launchVerificationServer({
      OKX_TEST_API_KEY: "fixture-api-key-must-not-leak",
      OKX_TEST_SECRET_KEY: "fixture-secret-key-must-not-leak",
      OKX_TEST_PASSPHRASE: "fixture-passphrase-must-not-leak",
      OKX_TEST_WEBHOOK_SECRET: "fixture-webhook-secret-must-not-leak",
    });
    baseUrl = fixture.info.url;
  }, 30_000);

  afterAll(async () => {
    await fixture?.close();
  });

  async function request(path: string, method: string, body?: unknown): Promise<JsonResponse> {
    return (await fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })) as JsonResponse;
  }

  it("disables the legacy paid EIP-3009 route by default without issuing a payment challenge", async () => {
    const res = await request("/api/okx/mcp", "POST", rpc("legacy-disabled", "tools/call", {
      name: "get_trending_asps",
      arguments: { limit: 1 },
    }));

    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error.code).toBe(-32004);
    expect(body.error.message).toContain("Legacy EIP-3009 paid MCP is disabled");
    expect(body.requiredFee).toBeUndefined();
    expect(body.token).toBeUndefined();
  });

  it("rejects runtime secrets and reports configured state without credential readback", async () => {
    const write = await request("/api/okx/settings", "POST", {
      apiKey: "must-not-be-accepted",
      secretKey: "must-not-be-accepted",
      passphrase: "must-not-be-accepted",
      webhookSecret: "must-not-be-accepted",
    });
    expect(write.status).toBe(400);
    expect((await write.json()).error).toContain("server-only");

    const read = await request("/api/okx/settings", "GET");
    expect(read.status).toBe(200);
    const body = await read.json();
    expect(body).toMatchObject({
      credentialsConfigured: true,
      webhookSecretConfigured: true,
    });
    const serialized = JSON.stringify(body);
    for (const secret of [
      "fixture-api-key-must-not-leak",
      "fixture-secret-key-must-not-leak",
      "fixture-passphrase-must-not-leak",
      "fixture-webhook-secret-must-not-leak",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(body).not.toHaveProperty("apiKey");
    expect(body).not.toHaveProperty("secretKey");
    expect(body).not.toHaveProperty("passphrase");
    expect(body).not.toHaveProperty("webhookSecret");
    expect(body).not.toHaveProperty("baseUrl");
  });
});
