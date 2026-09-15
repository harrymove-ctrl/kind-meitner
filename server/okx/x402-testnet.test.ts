import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { launchVerificationServer, type VerificationServer } from "../../scripts/control-kind-meitner.ts";
import {
  X402_TESTNET_NETWORK,
  X402_TESTNET_RESOURCE_PATH,
  X402TestnetResource,
} from "./x402-testnet.ts";

describe("official x402 testnet boundary", () => {
  it("is disabled without configuration and never creates a testnet payment path", () => {
    const resource = new X402TestnetResource({ enabled: false });
    expect(resource.status()).toEqual({
      enabled: false,
      ready: false,
      network: X402_TESTNET_NETWORK,
      resourcePath: X402_TESTNET_RESOURCE_PATH,
      reason: "OKX_X402_TESTNET_ENABLED is not true",
    });
  });

  it("requires all server-only testnet configuration before it can initialize", () => {
    const resource = new X402TestnetResource({ enabled: true, apiKey: "only-a-key" });
    expect(resource.status()).toMatchObject({
      enabled: true,
      ready: false,
      network: "eip155:1952",
      reason: expect.stringContaining("OKX_SECRET_KEY"),
    });
  });

  describe("disabled public route", () => {
    let fixture: VerificationServer;
    let baseUrl: string;

    beforeAll(async () => {
      fixture = await launchVerificationServer();
      baseUrl = fixture.info.url;
    }, 30_000);

    afterAll(async () => {
      await fixture?.close();
    });

    it("returns 404 rather than a 402 payment challenge when the flag is absent", async () => {
      const res = await fetch(`${baseUrl}${X402_TESTNET_RESOURCE_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(404);
      expect(res.headers.get("payment-required")).toBeNull();
      const body = await res.json();
      expect(body).toEqual({ error: "x402 testnet is disabled" });
    });
  });
});
