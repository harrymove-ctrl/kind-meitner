import { useCallback, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { Group } from "@/state/store";

export interface OkxCatalogAgent {
  id: string;
  name: string;
  description: string;
  provider: string;
  avatar: string;
  capabilities: string[];
  status: string;
}

type OkxCatalogResponse = { agents: OkxCatalogAgent[] };

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function asAgent(value: unknown): OkxCatalogAgent | null {
  const record = asRecord(value);
  if (!record) return null;
  const { id, name, description, provider, avatar, capabilities, status } = record;
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof description !== "string" ||
    typeof provider !== "string" ||
    typeof avatar !== "string" ||
    typeof status !== "string" ||
    !Array.isArray(capabilities) ||
    !capabilities.every((capability) => typeof capability === "string")
  ) return null;
  return { id, name, description, provider, avatar, capabilities, status };
}

/** Accept only the display-only catalog fields the client actually uses. */
export function parseOkxCatalog(value: unknown): OkxCatalogResponse | null {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.agents)) return null;
  const agents = record.agents.map(asAgent);
  return agents.every((agent): agent is OkxCatalogAgent => agent !== null) ? { agents } : null;
}

export function canInviteOkxAgent(group: Pick<Group, "dm">, remoteClient: boolean): boolean {
  return !remoteClient && !group.dm;
}

function errorMessage(response: Response, body: unknown): string {
  const record = asRecord(body);
  return typeof record?.error === "string" ? record.error : `${response.status} ${response.statusText}`;
}

function importRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `okx-import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function OkxAgentInvite({
  roomId,
  importedExternalAgentIds = new Set<string>(),
}: {
  roomId: string;
  importedExternalAgentIds?: ReadonlySet<string>;
}) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<OkxCatalogAgent[] | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [requestedId, setRequestedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setError(null);
    try {
      const response = await fetch("/api/okx/agents", { credentials: "same-origin" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(response, body));
      const parsed = parseOkxCatalog(body);
      if (!parsed) throw new Error("The OKX agent catalog returned an invalid response.");
      setCatalog(parsed.agents);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load OKX agents.");
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  const toggleOpen = useCallback(() => {
    if (!open && catalog === null && !loadingCatalog) void loadCatalog();
    setOpen((wasOpen) => !wasOpen);
  }, [catalog, loadCatalog, loadingCatalog, open]);

  const importAgent = useCallback(async (agent: OkxCatalogAgent) => {
    setImportingId(agent.id);
    setError(null);
    try {
      const response = await fetch("/api/okx/agents/import", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, roomId, requestId: importRequestId() }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(response, body));
      // Do not patch the room or bot list here. The normal group/bot stream
      // owns membership and activity updates, including an idempotent import.
      setRequestedId(agent.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Could not invite ${agent.name}.`);
    } finally {
      setImportingId(null);
    }
  }, [roomId]);

  return (
    <div className="relative" data-testid="okx-agent-invite">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-controls="okx-agent-invite-panel"
        className="rounded-md border border-hairline/50 px-2.5 py-1.5 text-[12px] font-medium text-ink-secondary hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        Invite OKX agent
      </button>
      {open ? (
        <section
          id="okx-agent-invite-panel"
          aria-label="Invite an OKX agent"
          className="absolute right-0 top-full z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-hairline/60 bg-card p-3 shadow-xl"
        >
          <p className="text-[12px] leading-relaxed text-ink-secondary">Add a local OKX.ai mock agent to this room.</p>
          {loadingCatalog ? (
            <p role="status" aria-live="polite" className="mt-3 flex items-center gap-2 text-[12px] text-ink-secondary">
              <Loader2 size={14} className="animate-spin" /> Loading OKX agents…
            </p>
          ) : null}
          {error ? <p role="alert" className="mt-3 text-[12px] text-danger">{error}</p> : null}
          {catalog?.map((agent) => {
            const inRoom = importedExternalAgentIds.has(agent.id);
            const requested = requestedId === agent.id;
            const importing = importingId === agent.id;
            return (
              <article key={agent.id} className="mt-3 rounded-lg border border-hairline/40 bg-panel p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[13px] font-semibold text-ink">{agent.name}</h2>
                    <p className="mt-1 text-[12px] leading-relaxed text-ink-secondary">{agent.description}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-ink-secondary">{agent.provider}</span>
                </div>
                <p className="mt-2 text-[11px] text-ink-secondary">Capabilities: {agent.capabilities.join(", ") || "None"}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  {inRoom ? <span role="status" className="flex items-center gap-1 text-[12px] text-success"><Check size={13} /> In this room</span> : requested ? <span role="status" aria-live="polite" className="text-[12px] text-ink-secondary">Waiting for room update…</span> : <span />}
                  <button
                    type="button"
                    onClick={() => void importAgent(agent)}
                    disabled={inRoom || requested || importing || agent.status !== "available"}
                    className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-[12px] font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {importing ? <Loader2 size={13} className="animate-spin" /> : null}
                    {importing ? "Inviting…" : inRoom ? "Added" : requested ? "Invited" : "Invite"}
                  </button>
                </div>
              </article>
            );
          })}
          {catalog && catalog.length === 0 ? <p role="status" className="mt-3 text-[12px] text-ink-secondary">No OKX agents are available.</p> : null}
          {error && catalog === null ? <button type="button" onClick={() => void loadCatalog()} className="mt-3 text-[12px] font-medium text-accent hover:underline">Try again</button> : null}
        </section>
      ) : null}
    </div>
  );
}
