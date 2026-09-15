import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { launchVerificationServer, type VerificationServer } from "../../scripts/control-kind-meitner.ts";
import {
  OkxMarketplaceIntelligence,
  verifyEip3009Payment,
  calculateHhi,
  type AspProfile,
} from "./intelligence.ts";
import { OkxGateway } from "./gateway.ts";

const dirs: string[] = [];

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "omb-mcp-adv-"));
  dirs.push(dir);
  return dir;
}

const parseJson = async (res: Response): Promise<any> => res.json();

afterEach(() => {
  for (const d of dirs) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
  dirs.length = 0;
});

describe("A2MCP Tool Server (/api/okx/mcp) HTTP Integration Stress Harness", () => {
  let fixture: VerificationServer;
  let baseUrl: string;

  const validAddress = "0x1111222233334444555566667777888899990000";
  const validSignature = "0x" + "bb".repeat(65); // 130 hex chars + 0x = 132 chars

  beforeAll(async () => {
    fixture = await launchVerificationServer({ OKX_LEGACY_EIP3009_ENABLED: "true" });
    baseUrl = fixture.info.url;
  }, 30_000);

  afterAll(async () => {
    if (fixture) {
      await fixture.close();
    }
  });

  it("free discovery methods (tools/list, ping, initialize) return 200 without payment", async () => {
    // 1. tools/list
    const resList = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "disco-1",
        method: "tools/list",
      }),
    });
    expect(resList.status).toBe(200);
    expect(resList.headers.get("x-connect-id")).toBeTruthy();
    expect(resList.headers.get("x-time-to-session")).toBeTruthy();
    const jsonList = await parseJson(resList);
    expect(jsonList.jsonrpc).toBe("2.0");
    expect(jsonList.id).toBe("disco-1");
    expect(jsonList.result.tools.length).toBeGreaterThanOrEqual(3);

    // 2. ping
    const resPing = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "ping-1",
        method: "ping",
      }),
    });
    expect(resPing.status).toBe(200);

    // 3. initialize
    const resInit = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "init-1",
        method: "initialize",
      }),
    });
    expect(resInit.status).toBe(200);
    const jsonInit = await parseJson(resInit);
    expect(jsonInit.result.serverInfo.name).toBe("okx-intelligence");
  });

  it("handles malformed JSON body with HTTP 400 and -32700", async () => {
    const res = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ malformed json",
    });
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error.code).toBe(-32700);
    expect(body.error.message).toContain("Parse error");
  });

  it("handles unknown JSON-RPC method with HTTP 400 and -32601", async () => {
    const res = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "unk-1",
        method: "unsupported_method",
      }),
    });
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error.code).toBe(-32601);
    expect(body.error.message).toContain("Method not found");
  });

  it("rejects tools/call with HTTP 402 when EIP-3009 payment headers are missing", async () => {
    // Completely missing payment headers
    const resNone = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "call-no-pay",
        method: "tools/call",
        params: { name: "get_trending_asps", arguments: { limit: 5 } },
      }),
    });
    expect(resNone.status).toBe(402);
    const bodyNone = await parseJson(resNone);
    expect(bodyNone.error.code).toBe(-32002);
    expect(bodyNone.error.message).toContain("Payment required");
    expect(bodyNone.requiredFee).toBe(0.05);
    expect(bodyNone.token).toBe("USDT");

    // Partial headers: missing x-payment-from
    const resNoFrom = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-signature": validSignature,
        "x-payment-nonce": "n1",
        "x-payment-valid-before": String(Math.floor(Date.now() / 1000) + 3600),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "call-no-from",
        method: "tools/call",
        params: { name: "get_trending_asps" },
      }),
    });
    expect(resNoFrom.status).toBe(402);

    // Partial headers: missing x-payment-signature
    const resNoSig = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-from": validAddress,
        "x-payment-nonce": "n1",
        "x-payment-valid-before": String(Math.floor(Date.now() / 1000) + 3600),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "call-no-sig",
        method: "tools/call",
        params: { name: "get_trending_asps" },
      }),
    });
    expect(resNoSig.status).toBe(402);

    // Partial headers: missing x-payment-nonce
    const resNoNonce = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-from": validAddress,
        "x-payment-signature": validSignature,
        "x-payment-valid-before": String(Math.floor(Date.now() / 1000) + 3600),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "call-no-nonce",
        method: "tools/call",
        params: { name: "get_trending_asps" },
      }),
    });
    expect(resNoNonce.status).toBe(402);

    // Partial headers: missing x-payment-valid-before
    const resNoVb = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-from": validAddress,
        "x-payment-signature": validSignature,
        "x-payment-nonce": "n1",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "call-no-vb",
        method: "tools/call",
        params: { name: "get_trending_asps" },
      }),
    });
    expect(resNoVb.status).toBe(402);
  });

  it("rejects tools/call with HTTP 400 when address or signature formats are malformed", async () => {
    const validFuture = String(Math.floor(Date.now() / 1000) + 3600);

    // 1. Malformed address (not starting with 0x)
    const resBadAddrPrefix = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-from": "1111222233334444555566667777888899990000",
        "x-payment-signature": validSignature,
        "x-payment-nonce": "mal-1",
        "x-payment-valid-before": validFuture,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "bad-addr-1",
        method: "tools/call",
        params: { name: "get_trending_asps" },
      }),
    });
    expect(resBadAddrPrefix.status).toBe(400);
    const bodyBadAddr = await parseJson(resBadAddrPrefix);
    expect(bodyBadAddr.error.message).toContain("address format");

    // 2. Malformed address (short length)
    const resBadAddrLen = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-from": "0x1234",
        "x-payment-signature": validSignature,
        "x-payment-nonce": "mal-2",
        "x-payment-valid-before": validFuture,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "bad-addr-2",
        method: "tools/call",
        params: { name: "get_trending_asps" },
      }),
    });
    expect(resBadAddrLen.status).toBe(400);

    // 3. Malformed address (non-hex characters)
    const resBadAddrHex = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-from": "0xZZZZ222233334444555566667777888899990000",
        "x-payment-signature": validSignature,
        "x-payment-nonce": "mal-3",
        "x-payment-valid-before": validFuture,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "bad-addr-3",
        method: "tools/call",
        params: { name: "get_trending_asps" },
      }),
    });
    expect(resBadAddrHex.status).toBe(400);

    // 4. Malformed signature (not starting with 0x)
    const resBadSigPrefix = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-from": validAddress,
        "x-payment-signature": "bb".repeat(65),
        "x-payment-nonce": "mal-4",
        "x-payment-valid-before": validFuture,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "bad-sig-1",
        method: "tools/call",
        params: { name: "get_trending_asps" },
      }),
    });
    expect(resBadSigPrefix.status).toBe(400);
    const bodyBadSig = await parseJson(resBadSigPrefix);
    expect(bodyBadSig.error.message).toContain("signature format");

    // 5. Short signature (< 130 characters)
    const resBadSigShort = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-from": validAddress,
        "x-payment-signature": "0x1234abcd",
        "x-payment-nonce": "mal-5",
        "x-payment-valid-before": validFuture,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "bad-sig-2",
        method: "tools/call",
        params: { name: "get_trending_asps" },
      }),
    });
    expect(resBadSigShort.status).toBe(400);

    // 6. Non-hex characters in signature
    const resBadSigHex = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-from": validAddress,
        "x-payment-signature": "0x" + "gg".repeat(65),
        "x-payment-nonce": "mal-6",
        "x-payment-valid-before": validFuture,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "bad-sig-3",
        method: "tools/call",
        params: { name: "get_trending_asps" },
      }),
    });
    expect(resBadSigHex.status).toBe(400);
  });

  it("rejects tools/call with HTTP 400 when validBefore is expired (validBefore <= now)", async () => {
    const nowSec = Math.floor(Date.now() / 1000);

    // Expired in past
    const resExpiredPast = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-from": validAddress,
        "x-payment-signature": validSignature,
        "x-payment-nonce": "exp-past",
        "x-payment-valid-before": String(nowSec - 100),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "exp-1",
        method: "tools/call",
        params: { name: "get_trending_asps" },
      }),
    });
    expect(resExpiredPast.status).toBe(400);
    const bodyPast = await parseJson(resExpiredPast);
    expect(bodyPast.error.message).toContain("expired (validBefore <= now)");

    // Boundary: validBefore === nowSec
    const resExpiredExact = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-from": validAddress,
        "x-payment-signature": validSignature,
        "x-payment-nonce": "exp-exact",
        "x-payment-valid-before": String(nowSec),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "exp-exact",
        method: "tools/call",
        params: { name: "get_trending_asps" },
      }),
    });
    expect(resExpiredExact.status).toBe(400);
    const bodyExact = await parseJson(resExpiredExact);
    expect(bodyExact.error.message).toContain("expired (validBefore <= now)");

    // Non-numeric validBefore
    const resNonNumeric = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-from": validAddress,
        "x-payment-signature": validSignature,
        "x-payment-nonce": "exp-nan",
        "x-payment-valid-before": "not-a-number",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "exp-nan",
        method: "tools/call",
        params: { name: "get_trending_asps" },
      }),
    });
    expect(resNonNumeric.status).toBe(400);
    const bodyNonNum = await parseJson(resNonNumeric);
    expect(bodyNonNum.error.message).toContain("Invalid x-payment-valid-before timestamp");
  });

  it("rejects tools/call with HTTP 400 when validAfter is in the future (validAfter > now)", async () => {
    const nowSec = Math.floor(Date.now() / 1000);

    const resFuture = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-from": validAddress,
        "x-payment-signature": validSignature,
        "x-payment-nonce": "future-nonce",
        "x-payment-valid-before": String(nowSec + 7200),
        "x-payment-valid-after": String(nowSec + 3600), // 1 hour in future
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "future-call",
        method: "tools/call",
        params: { name: "get_trending_asps" },
      }),
    });
    expect(resFuture.status).toBe(400);
    const body = await parseJson(resFuture);
    expect(body.error.message).toContain("not yet valid (validAfter > now)");
  });

  it("executes valid tools/call, and rejects REPLAY ATTACK with identical nonce with HTTP 400", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const replayNonce = `adversarial-nonce-${Date.now()}-${Math.random()}`;

    // First request: valid headers and nonce -> HTTP 200
    const resFirst = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-from": validAddress,
        "x-payment-signature": validSignature,
        "x-payment-nonce": replayNonce,
        "x-payment-valid-before": String(nowSec + 3600),
        "x-payment-valid-after": String(nowSec - 10),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "first-call",
        method: "tools/call",
        params: { name: "get_trending_asps", arguments: { limit: 2 } },
      }),
    });
    expect(resFirst.status).toBe(200);
    const bodyFirst = await parseJson(resFirst);
    expect(bodyFirst.result).toBeDefined();
    expect(resFirst.headers.get("x-connect-id")).toBeTruthy();
    expect(resFirst.headers.get("x-time-to-session")).toBeTruthy();

    // Second request: REPLAY ATTACK with the EXACT SAME NONCE -> must reject with HTTP 400
    const resReplay = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-from": validAddress,
        "x-payment-signature": validSignature,
        "x-payment-nonce": replayNonce, // REPLAY!
        "x-payment-valid-before": String(nowSec + 3600),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "replay-call",
        method: "tools/call",
        params: { name: "get_trending_asps", arguments: { limit: 2 } },
      }),
    });
    expect(resReplay.status).toBe(400);
    const bodyReplay = await parseJson(resReplay);
    expect(bodyReplay.error.code).toBe(-32602);
    expect(bodyReplay.error.message).toBe("Payment nonce has already been redeemed");

    // Third request: fresh nonce -> HTTP 200
    const freshNonce = `fresh-nonce-${Date.now()}-${Math.random()}`;
    const resThird = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-from": validAddress,
        "x-payment-signature": validSignature,
        "x-payment-nonce": freshNonce,
        "x-payment-valid-before": String(nowSec + 3600),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "fresh-call",
        method: "tools/call",
        params: { name: "get_trending_asps", arguments: { limit: 2 } },
      }),
    });
    expect(resThird.status).toBe(200);
  });

  it("handles concurrent requests with the identical nonce by allowing exactly one and rejecting duplicate with 400", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const concurrentNonce = `concurrent-nonce-${Date.now()}-${Math.random()}`;

    const sendRequest = () =>
      fetch(`${baseUrl}/api/okx/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-payment-from": validAddress,
          "x-payment-signature": validSignature,
          "x-payment-nonce": concurrentNonce,
          "x-payment-valid-before": String(nowSec + 3600),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "concurrent-call",
          method: "tools/call",
          params: { name: "get_trending_asps", arguments: { limit: 1 } },
        }),
      });

    const [resA, resB] = await Promise.all([sendRequest(), sendRequest()]);
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 400]);

    const rejected = resA.status === 400 ? resA : resB;
    const bodyRej = await parseJson(rejected);
    expect(bodyRej.error.code).toBe(-32602);
    expect(bodyRej.error.message).toBe("Payment nonce has already been redeemed");
  });

  it("handles 429 rate limit with Retry-After header and x-time-to-session tracing", async () => {
    const resRate = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-force-rate-limit": "true",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "rate-test",
        method: "tools/list",
      }),
    });
    expect(resRate.status).toBe(429);
    expect(resRate.headers.get("retry-after")).toBeTruthy();
    expect(resRate.headers.get("x-time-to-session")).toBeTruthy();
    const body = await parseJson(resRate);
    expect(body.error.code).toBe(-32000);
    expect(body.error.message).toContain("Rate limit exceeded");
  });

  it("handles timeout cap with HTTP 504 and x-time-to-session tracing", async () => {
    const resTimeout = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-force-timeout": "true",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "timeout-test",
        method: "tools/list",
      }),
    });
    expect(resTimeout.status).toBe(504);
    expect(resTimeout.headers.get("x-time-to-session")).toBeTruthy();
    const body = await parseJson(resTimeout);
    expect(body.error.message).toContain("Gateway Timeout");
  });

  it("preserves caller x-connect-id header for end-to-end tracing", async () => {
    const customConnectId = "tracing-agent-correlation-uuid-999";
    const res = await fetch(`${baseUrl}/api/okx/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-connect-id": customConnectId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "trace-1",
        method: "ping",
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-connect-id")).toBe(customConnectId);
  });
});

describe("EIP-3009 Payment Verification Unit & Boundary Adversarial Tests", () => {
  const validAddressLower = "0x1234567890123456789012345678901234567890";
  const validAddressUpper = "0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD";
  const validSig130 = "0x" + "11".repeat(65);
  const validSig132 = "0x" + "22".repeat(66);

  it("verifies address case insensitivity (supports uppercase, lowercase, mixed-case hex)", () => {
    const resLower = verifyEip3009Payment(
      {
        "x-payment-from": validAddressLower,
        "x-payment-signature": validSig130,
        "x-payment-nonce": "n1",
        "x-payment-valid-before": "2000",
      },
      { nowSec: 1000 },
    );
    expect(resLower.valid).toBe(true);

    const resUpper = verifyEip3009Payment(
      {
        "x-payment-from": validAddressUpper,
        "x-payment-signature": validSig132,
        "x-payment-nonce": "n1",
        "x-payment-valid-before": "2000",
      },
      { nowSec: 1000 },
    );
    expect(resUpper.valid).toBe(true);
  });

  it("handles array-valued headers gracefully", () => {
    const res = verifyEip3009Payment(
      {
        "x-payment-from": [validAddressLower],
        "x-payment-signature": [validSig130],
        "x-payment-nonce": ["n-array-1"],
        "x-payment-valid-before": ["3000"],
      },
      { nowSec: 1000 },
    );
    expect(res.valid).toBe(true);
    expect(res.payment?.nonce).toBe("n-array-1");
  });

  it("enforces strict boundary conditions on expiration and future timestamps", () => {
    const now = 5000;

    // validBefore == now -> expired (validBefore <= now)
    const resEqBefore = verifyEip3009Payment(
      {
        "x-payment-from": validAddressLower,
        "x-payment-signature": validSig130,
        "x-payment-nonce": "n-b1",
        "x-payment-valid-before": String(now),
      },
      { nowSec: now },
    );
    expect(resEqBefore.valid).toBe(false);
    expect(resEqBefore.status).toBe(400);

    // validBefore == now + 1 -> valid
    const resPlusBefore = verifyEip3009Payment(
      {
        "x-payment-from": validAddressLower,
        "x-payment-signature": validSig130,
        "x-payment-nonce": "n-b2",
        "x-payment-valid-before": String(now + 1),
      },
      { nowSec: now },
    );
    expect(resPlusBefore.valid).toBe(true);

    // validAfter == now -> valid (validAfter <= now is allowed)
    const resEqAfter = verifyEip3009Payment(
      {
        "x-payment-from": validAddressLower,
        "x-payment-signature": validSig130,
        "x-payment-nonce": "n-a1",
        "x-payment-valid-before": String(now + 100),
        "x-payment-valid-after": String(now),
      },
      { nowSec: now },
    );
    expect(resEqAfter.valid).toBe(true);

    // validAfter == now + 1 -> invalid (validAfter > now)
    const resFutureAfter = verifyEip3009Payment(
      {
        "x-payment-from": validAddressLower,
        "x-payment-signature": validSig130,
        "x-payment-nonce": "n-a2",
        "x-payment-valid-before": String(now + 100),
        "x-payment-valid-after": String(now + 1),
      },
      { nowSec: now },
    );
    expect(resFutureAfter.valid).toBe(false);
    expect(resFutureAfter.status).toBe(400);
  });

  it("persists nonces across restart and protects against duplicate redemption", () => {
    const dir = tempDir();
    const storageFile = join(dir, "market-intel.json");

    const instance1 = new OkxMarketplaceIntelligence({ storageFile });
    expect(instance1.isNonceRedeemed("cross-proc-nonce-1")).toBe(false);
    expect(instance1.redeemNonce("cross-proc-nonce-1")).toBe(true);
    expect(instance1.isNonceRedeemed("cross-proc-nonce-1")).toBe(true);
    expect(instance1.redeemNonce("cross-proc-nonce-1")).toBe(false);

    // Reboot: initialize a new instance pointing to same file
    const instance2 = new OkxMarketplaceIntelligence({ storageFile });
    expect(instance2.isNonceRedeemed("cross-proc-nonce-1")).toBe(true);
    expect(instance2.redeemNonce("cross-proc-nonce-1")).toBe(false);
    expect(instance2.redeemNonce("cross-proc-nonce-2")).toBe(true);
  });
});

describe("HHI Anti-Sybil Defense Boundary & Clamping Adversarial Tests", () => {
  it("calculates exact mathematical HHI across diverse counterparty distributions", () => {
    // 100% single buyer -> 10000
    expect(calculateHhi({ sole: 100 })).toBe(10000);

    // 50/50 split -> 50^2 + 50^2 = 5000
    expect(calculateHhi({ a: 50, b: 50 })).toBe(5000);

    // 10 equal buyers (10% each) -> 10 * 10^2 = 1000
    const tenBuyers: Record<string, number> = {};
    for (let i = 0; i < 10; i++) tenBuyers[`b${i}`] = 10;
    expect(calculateHhi(tenBuyers)).toBe(1000);

    // Zero volume -> 0
    expect(calculateHhi({})).toBe(0);
    expect(calculateHhi({ a: 0, b: 0 })).toBe(0);
  });

  it("strictly enforces HHI concentration boundary (> 6000 clamps to high_risk, <= 6000 permits elite)", () => {
    const dir = tempDir();
    const storageFile = join(dir, "hhi-test.json");
    const intel = new OkxMarketplaceIntelligence({ storageFile });

    // Provider A: hhiScore exactly 6000 with pristine metrics -> should NOT be clamped to high_risk, can achieve elite
    const providerBorderline: AspProfile = {
      id: "asp-borderline-6000",
      name: "Borderline Provider",
      category: "audit",
      reputationScore: 95,
      medianPrice: 100,
      averageTurnaroundMinutes: 60,
      tasksCompleted: 25,
      disputesCount: 0,
      rejectionsCount: 0,
      disputesWon: 0,
      rejectRate: 0,
      disputeRate: 0,
      recentVolume7d: 20,
      trustTier: "neutral",
      hhiScore: 6000, // Exactly 6000
      updatedAt: Date.now(),
    };

    // Provider B: hhiScore 6001 with pristine metrics -> strictly clamped to high_risk
    const providerBreached: AspProfile = {
      id: "asp-breached-6001",
      name: "Breached Provider",
      category: "audit",
      reputationScore: 95,
      medianPrice: 100,
      averageTurnaroundMinutes: 60,
      tasksCompleted: 25,
      disputesCount: 0,
      rejectionsCount: 0,
      disputesWon: 0,
      rejectRate: 0,
      disputeRate: 0,
      recentVolume7d: 20,
      trustTier: "neutral",
      hhiScore: 6001, // 6001 > 6000
      updatedAt: Date.now(),
    };

    // Provider C: High concentration buyerVolumes (80% from one buyer -> HHI >= 6400)
    const providerWashTraded: AspProfile = {
      id: "asp-wash-sybil",
      name: "Wash Sybil Provider",
      category: "audit",
      reputationScore: 99,
      medianPrice: 150,
      averageTurnaroundMinutes: 45,
      tasksCompleted: 50,
      disputesCount: 0,
      rejectionsCount: 0,
      disputesWon: 0,
      rejectRate: 0,
      disputeRate: 0,
      recentVolume7d: 40,
      trustTier: "neutral",
      buyerVolumes: {
        whale: 800,
        retail1: 100,
        retail2: 100,
      },
      updatedAt: Date.now(),
    };

    intel.indexAsps([providerBorderline, providerBreached, providerWashTraded]);

    const resBorderline = intel.getAsp("asp-borderline-6000");
    expect(resBorderline?.trustTier).toBe("elite"); // Not clamped, meets elite criteria

    const resBreached = intel.getAsp("asp-breached-6001");
    expect(resBreached?.trustTier).toBe("high_risk"); // Clamped!

    const resWash = intel.getAsp("asp-wash-sybil");
    expect(resWash?.hhiScore).toBeGreaterThan(6000);
    expect(resWash?.trustTier).toBe("high_risk"); // Clamped despite 99 rep
  });
});

describe("OkxGateway Zero-Slow-UX: 429 Retry-After Exponential Backoff & 90s RPC Cap", () => {
  it("increments handshakeErrorCount and retries on 429 until success", async () => {
    let attempts = 0;
    const mockFetch = async () => {
      attempts++;
      if (attempts < 3) {
        return {
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": "0" }),
          text: async () => "Rate limit exceeded",
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, attempts }),
      } as unknown as Response;
    };

    const gateway = new OkxGateway({
      credentials: { apiKey: "k", secretKey: "s", passphrase: "p" },
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const res = await gateway.request<{ success: boolean; attempts: number }>(
      "GET",
      "/api/v5/agent/status",
      undefined,
      { maxRetries: 3 },
    );

    expect(res.success).toBe(true);
    expect(res.attempts).toBe(3);
    expect(gateway.handshakeErrorCount).toBe(2);
  });

  it("throws error when maxRetries exceeded under persistent 429", async () => {
    const mockFetch = async () => {
      return {
        ok: false,
        status: 429,
        headers: new Headers({ "retry-after": "0" }),
        text: async () => "Rate limit exceeded",
      } as unknown as Response;
    };

    const gateway = new OkxGateway({
      credentials: { apiKey: "k", secretKey: "s", passphrase: "p" },
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(
      gateway.request("GET", "/api/v5/agent/status", undefined, { maxRetries: 2 }),
    ).rejects.toThrow(/rate limited \(429\) after 3 retries/);
  });

  it("enforces RPC timeout cap via AbortController and throws RPC timeout exceeded 90s limit", async () => {
    const hangingFetch = async (_url: unknown, options?: { signal?: AbortSignal }) => {
      return new Promise<Response>((_, reject) => {
        options?.signal?.addEventListener("abort", () => {
          reject(new Error("RPC timeout exceeded 90s limit"));
        });
      });
    };

    const gateway = new OkxGateway({
      credentials: { apiKey: "k", secretKey: "s", passphrase: "p" },
      fetchFn: hangingFetch as unknown as typeof fetch,
    });

    await expect(
      gateway.request("GET", "/api/v5/agent/tasks", undefined, { timeoutMs: 30 }),
    ).rejects.toThrow("RPC timeout exceeded 90s limit");
  });

  it("propagates connectId header to remote calls", async () => {
    let capturedConnectId = "";
    const mockFetch = async (_url: unknown, init?: RequestInit) => {
      capturedConnectId = (init?.headers as Record<string, string>)?.["x-connect-id"] ?? "";
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as unknown as Response;
    };

    const gateway = new OkxGateway({
      credentials: { apiKey: "k", secretKey: "s", passphrase: "p" },
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await gateway.request("GET", "/api/v5/agent/info", undefined, {
      connectId: "custom-corr-1234",
    });

    expect(capturedConnectId).toBe("custom-corr-1234");
  });
});
