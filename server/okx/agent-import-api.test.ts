import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, openSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

import { launchVerificationServer } from "../../scripts/control-kind-meitner.ts";
import { waitForExit } from "../testing/cleanup.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SERVER = fileURLToPath(new URL("../index.ts", import.meta.url));

type ApiResponse = { response: Response; body: any };

async function api(baseUrl: string, path: string, method = "GET", body?: unknown): Promise<ApiResponse> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5_000),
  });
  return { response, body: await response.json() };
}

/** Restart with the verification fixture's deliberately hermetic environment.
 * The only provider is the repository fake CLI; no wallet, live OKX service,
 * or user credentials can reach this test. */
async function restartVerificationServer(baseUrl: string, dataDir: string, logPath: string): Promise<ChildProcess> {
  const port = new URL(baseUrl).port;
  const env: NodeJS.ProcessEnv = {
    HOME: dataDir,
    USERPROFILE: dataDir,
    APPDATA: join(dataDir, "AppData", "Roaming"),
    LOCALAPPDATA: join(dataDir, "AppData", "Local"),
    XDG_CONFIG_HOME: join(dataDir, ".config"),
    XDG_CACHE_HOME: join(dataDir, ".cache"),
    XDG_DATA_HOME: join(dataDir, ".local", "share"),
    TEMP: join(dataDir, "tmp"),
    TMP: join(dataDir, "tmp"),
    TMPDIR: join(dataDir, "tmp"),
    HERMES_HOME: join(dataDir, ".hermes"),
    KIND_MEITNER_DATA_DIR: dataDir,
    KIND_MEITNER_PORT: port,
    KIND_MEITNER_WEBHOOK_PORT: String(Number(port) + 1),
    FAKE_CLAUDE_MODE: "happy",
    PATH: dirname(process.execPath),
  };
  const log = openSync(logPath, "a", 0o600);
  const child = spawn(process.execPath, ["--experimental-strip-types", SERVER], {
    cwd: ROOT,
    env,
    stdio: ["ignore", log, log],
  });
  closeSync(log);
  await expect.poll(async () => {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1_000) });
      return response.ok;
    } catch {
      return false;
    }
  }, { timeout: 20_000, interval: 150 }).toBe(true);
  return child;
}

it("serves only the mock catalog and provisions/imports Market Scout exactly once across restart", async () => {
  const fixture = await launchVerificationServer();
  const { url, dataDir, logPath } = fixture.info;
  let restarted: ChildProcess | undefined;
  try {
    const catalog = await api(url, "/api/okx/agents");
    expect(catalog.response.status).toBe(200);
    expect(catalog.body).toEqual({
      source: "mock",
      agents: [expect.objectContaining({
        id: "okx-market-scout-v1",
        name: "Market Scout",
        provider: "OKX.ai",
        capabilities: ["chat", "market-intelligence"],
        status: "available",
      })],
    });

    const local = await api(url, "/api/bots", "POST", { name: "Local seed" });
    expect(local.response.status).toBe(201);
    const seedId = local.body.bot.id as string;

    const firstDefault = await api(url, "/api/rooms/default", "POST", {});
    const secondDefault = await api(url, "/api/rooms/default", "POST", {});
    expect(firstDefault.response.status).toBe(200);
    expect(secondDefault.response.status).toBe(200);
    expect(secondDefault.body.room).toMatchObject({ id: firstDefault.body.room.id, name: "Channel 1" });
    expect(secondDefault.body.room.dm).toBeUndefined();
    expect(secondDefault.body.room.memberIds).toContain(seedId);
    expect(secondDefault.body.activityMessageId).toBe(firstDefault.body.activityMessageId);
    expect(secondDefault.body.room.messages.filter((message: { kind: string; tool?: { name?: string } }) =>
      message.kind === "activity" && message.tool?.name === "Welcome to #Channel 1.",
    )).toHaveLength(1);

    const payload = {
      agentId: "okx-market-scout-v1",
      roomId: firstDefault.body.room.id,
      requestId: "market-scout-import-1",
    };
    const firstImport = await api(url, "/api/okx/agents/import", "POST", payload);
    const duplicateByRequest = await api(url, "/api/okx/agents/import", "POST", payload);
    const duplicateByAgentRoom = await api(url, "/api/okx/agents/import", "POST", { ...payload, requestId: "market-scout-import-2" });
    expect(firstImport.response.status).toBe(201);
    expect(duplicateByRequest.response.status).toBe(200);
    expect(duplicateByAgentRoom.response.status).toBe(200);
    expect(duplicateByRequest.body).toEqual(firstImport.body);
    expect(duplicateByAgentRoom.body).toEqual(firstImport.body);

    const beforeRestart = await api(url, "/api/bots?messages=20");
    const scout = beforeRestart.body.bots.find((bot: { id: string }) => bot.id === firstImport.body.agent.id);
    const room = beforeRestart.body.groups.find((group: { id: string }) => group.id === firstDefault.body.room.id);
    expect(scout).toMatchObject({
      name: "Market Scout",
      okxImport: {
        kind: "okx-mock",
        externalAgentId: "okx-market-scout-v1",
        provider: "OKX.ai",
        capabilities: ["chat", "market-intelligence"],
      },
      composio: false,
      approvalMode: "ask",
      autoApprove: false,
      alwaysAllow: [],
      mcpServers: [],
      browser: false,
      computer: "off",
      peers: [],
      messages: [],
    });
    expect(room.memberIds.filter((id: string) => id === scout.id)).toHaveLength(1);
    expect(room.messages.filter((message: { kind: string; tool?: { name?: string; system?: boolean } }) =>
      message.kind === "activity" && message.tool?.name === "Market Scout joined #Channel 1 from OKX.ai (mock)." && message.tool.system === true,
    )).toHaveLength(1);

    await waitForExit(fixture.child, { signal: "SIGTERM" });
    restarted = await restartVerificationServer(url, dataDir, logPath);
    const afterRestart = await api(url, "/api/okx/agents/import", "POST", { ...payload, requestId: "market-scout-import-after-restart" });
    expect(afterRestart.response.status).toBe(200);
    expect(afterRestart.body).toEqual(firstImport.body);

    const persisted = JSON.parse(readFileSync(join(dataDir, "bots.json"), "utf8"));
    expect(persisted.filter((bot: { okxImport?: { externalAgentId?: string } }) =>
      bot.okxImport?.externalAgentId === "okx-market-scout-v1",
    )).toHaveLength(1);
  } finally {
    await waitForExit(restarted, { signal: "SIGTERM" });
    await fixture.close();
  }
}, 45_000);
