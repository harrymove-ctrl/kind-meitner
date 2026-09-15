# OKX Agent Import — Milestone 1 Contract

**Status:** draft for implementation
**Scope:** mock-first vertical slice; no wallet, live OKX Portal, escrow, or on-chain transaction is required.

## Goal

A first-time user completes onboarding into a usable default room, imports a discoverable mock OKX agent, chats with it in that room, and can inspect a durable activity trail for the import and messages.

This contract models the Radio/Plasma channel flow while preserving Kind Meitner's existing concepts:

- **Room** = a non-DM `GroupRecord`.
- **Imported OKX agent** = a local `BotRecord` created with `seedMessages: false`, marked by an OKX import descriptor.
- **Activity** = an existing room message with `kind: "activity"`; no separate activity database in Milestone 1.

## Mock discovery API

### `GET /api/okx/agents`

Returns a deterministic catalog. It must never contact a live OKX service in Milestone 1.

```json
{
  "source": "mock",
  "agents": [
    {
      "id": "okx-market-scout-v1",
      "name": "Market Scout",
      "description": "Summarizes OKX marketplace demand, pricing and active task categories.",
      "provider": "OKX.ai",
      "avatar": "chart",
      "capabilities": ["chat", "market-intelligence"],
      "status": "available"
    }
  ]
}
```

`id` is stable and opaque. `capabilities` are display-only in this milestone; UI must not offer a control that is not implemented.

## Import API

### `POST /api/okx/agents/import`

```json
{
  "agentId": "okx-market-scout-v1",
  "roomId": "group-id",
  "requestId": "client-generated-idempotency-key"
}
```

Success (`201` for a new import):

```json
{
  "agent": {
    "id": "local-bot-id",
    "name": "Market Scout",
    "source": {
      "kind": "okx-mock",
      "externalAgentId": "okx-market-scout-v1",
      "provider": "OKX.ai",
      "capabilities": ["chat", "market-intelligence"]
    }
  },
  "room": { "id": "group-id" },
  "activityMessageId": "message-id"
}
```

Rules:

1. `roomId` must name an existing non-DM room; otherwise return `404` or `400`.
2. Unknown catalog agents return `404`.
3. Importing the same external agent into the same room is idempotent: return the original local bot, membership, and activity record rather than creating a duplicate.
4. Imported agents start with no greeting, no enabled external tools, no credentials, no autonomous routine, and no approval elevation.
5. On first import, add the local bot to the room and append one room activity message:
   `Market Scout joined #Channel 1 from OKX.ai (mock).`
6. The response and all event payloads contain no token, wallet, API key, secret, or untrusted remote instruction.

## Default room provisioning

### `POST /api/rooms/default`

Idempotently returns the user's initial non-DM room.

- Preferred name: `Channel 1`.
- It is created only once per workspace.
- It includes the workspace's seeded/default local bot when one exists.
- It appends a single welcome activity message on first creation.
- Repeated calls return the same room and do not add duplicate welcome activity.

Onboarding calls this after the welcome flow is completed or skipped. A fixture/demo may call it explicitly to avoid UI timing dependence.

## Chat behavior

Milestone 1 does **not** claim a live remote OKX agent transport. The imported mock agent is a local bot with a deterministic mock reply path.

For a user room message that mentions the imported agent or selects it as responder:

1. Persist the user message in the room thread.
2. Append an activity message indicating the mock agent is working.
3. Append the agent reply through the existing group/room message path, with `from` identifying the imported bot.
4. Append or patch terminal activity: completed or failed.

The mock reply demonstrates one supported capability, e.g. `market-intelligence`, and labels itself `OKX.ai mock` so no user mistakes it for a live marketplace execution.

## Activity feed

Milestone 1 room activity is derived from existing room messages. A unified `/activity` view can be added after the room vertical slice works.

The room must visibly contain, in order:

1. default channel creation/welcome;
2. agent import/join;
3. user message;
4. agent working activity;
5. agent reply/completion.

## Acceptance criteria

1. A clean isolated fixture can create/get exactly one `Channel 1` room.
2. The mock catalog exposes `Market Scout` with its capability list.
3. Import adds Market Scout to Channel 1 exactly once and writes one join activity entry.
4. Repeating the same request id or the same agent/room import cannot duplicate a local bot, room member, or activity entry.
5. A user can send a room message and receives a clearly attributed mock OKX agent reply plus activity state.
6. The existing non-DM group message and room-handoff invariants remain green.
7. Contract-focused tests use an isolated harness/fixture only; no live OKX credential, chain, or wallet is used.
8. The show-off video records the full flow from onboarding/default room through import, message, reply and activity history.

## Deferred to Milestone 2+

- live OKX agent discovery/import credentials;
- `/api/rooms/:roomId/openapi.yaml` registration, long polling and acknowledgement batches;
- remote agent tokens, revoke/leave/rename lifecycle;
- task posting, treasury, delivery watcher, evaluator, payment and chain receipts;
- global activity inbox aggregating rooms, routines and disputes.
