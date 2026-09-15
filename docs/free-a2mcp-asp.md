# Free A2MCP ASP launch guide

## Purpose and boundary

`POST /api/okx/free-mcp` is the public, paymentless A2MCP surface for `kind-meitner`'s market-intelligence resources. It is intentionally separate from the legacy `/api/okx/mcp` payment experiment.

This phase demonstrates useful OKX.AI agent-service discovery and market research without a wallet, API credential, payment header, mainnet operation, escrow, trade, withdrawal, or on-chain settlement. Do **not** register or present the legacy paid endpoint as a settled service.

The service returns a direct `HTTP 200` JSON-RPC result for valid free calls. A successful response is not evidence of a payment, transaction, live marketplace query, or OKX endorsement.

## Endpoint contract

| Item | Value |
| --- | --- |
| Public endpoint | `POST https://<public-host>/api/okx/free-mcp` |
| Protocol | JSON-RPC 2.0 with MCP `initialize`, `tools/list`, and `tools/call` |
| Authentication | None |
| Price | `0` for the Free A2MCP ASP registration |
| Payment/wallet/mainnet | Never requested or used by this endpoint |
| Abuse control | 60 requests per source per minute, per server process; excess requests receive `429` with `Retry-After` |
| Traceability | `x-connect-id` and `x-time-to-session` response headers |

Payment-looking headers are deliberately ignored. The endpoint must never emit a `402 Payment Required` challenge, consume a nonce, record a payment, or invoke a signer.

## Server-only configuration and legacy paid-path status

The legacy custom EIP-3009 endpoint at `POST /api/okx/mcp` is disabled by default and returns `410 Gone`. It is not x402 and must not be registered or advertised as a paid or settled service. A test-only/reviewed migration can enable it explicitly with `OKX_LEGACY_EIP3009_ENABLED=true`; production must leave this variable unset or false.

If a future reviewed server-side OKX integration needs credentials, configure them as **Railway service-scoped sealed variables**: `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE`, optional `OKX_API_BASE_URL`, and `OKX_WEBHOOK_SECRET`. These values are read only during server startup. The runtime settings API rejects them, and its read response exposes only `credentialsConfigured` and `webhookSecretConfigured` booleans. Never commit, log, place in the browser, or enter them through the UI.

## Available read-only tools

All listed tools include MCP annotations declaring `readOnlyHint: true`, `destructiveHint: false`, and `openWorldHint: false`.

- `list_okx_ai_use_cases` — returns the four showable use cases: market intelligence, service discovery, recurring research inputs, and responsible A2MCP launch.
- `get_free_a2mcp_launch_checklist` — returns the launch guardrails and official documentation links.
- `query_market_benchmarks` — returns locally indexed category benchmarks; optional `category` is a non-empty string of at most 80 characters.
- `get_asp_reputation` — returns a locally indexed ASP record; `aspId` is required.
- `get_trending_asps` — returns locally indexed rankings; optional `limit` is an integer from 1 to 20.

## Data provenance

The marketplace tools return data from the local `kind-meitner` intelligence registry, not a live OKX marketplace index. Every successful tool result includes:

```json
{
  "resource": {
    "access": "free",
    "paymentRequired": false,
    "walletRequired": false,
    "mainnet": false,
    "provenance": "kind-meitner local registry and public OKX.AI setup guidance"
  }
}
```

Keep this label intact in any UI, demo, documentation, or ASP listing. Do not imply current market prices, verified reputation, completed transactions, or settlement until a separate source and verification design is implemented.

## Local verification

Use only the isolated fixture required by `AGENTS.md`; do not test against a developer's running app or live data:

```sh
pnpm vitest run server/okx/free-mcp.test.ts
```

The test covers tool discovery, `HTTP 200` free calls, ignored payment-like headers, provenance flags, malformed JSON, and invalid tool arguments.

A minimal manual probe, after launching an isolated server, is:

```sh
curl --request POST "$BASE_URL/api/okx/free-mcp" \
  --header 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":"tools-1","method":"tools/list"}'
```

Verify that the status is `200`, tools are all read-only, and no payment field or `402` response appears.

## Public launch checklist

1. Deploy the current server to a public HTTPS domain, such as the Railway service domain.
2. Send the MCP initialize, `tools/list`, and one valid `tools/call` request to that HTTPS URL. Confirm the responses are direct `200` results.
3. Confirm a payment-looking request still returns a free result and that all market-data responses carry the local-data provenance label.
4. Confirm the route is rate-limited. On horizontally scaled deployments, add an edge/shared rate limit because the built-in limiter is per process and resets on restart.
5. Register **only** `https://<public-host>/api/okx/free-mcp` as a Free A2MCP ASP at price `0` through the official registration flow.
6. In the listing and demo, state: “free, read-only, locally indexed data; no wallet, payment, or mainnet access.”

Official references:

- [OKX.AI A2MCP guide](https://web3.okx.com/onchainos/dev-docs/okxai/howtomcp)
- [OKX.AI ASP registration](https://web3.okx.com/onchainos/dev-docs/okxai/registerasp)

## Explicitly deferred

- Official x402 integration is a separate **X Layer testnet** follow-up, not a fallback inside this route.
- Any real payment, mainnet configuration, A2A escrow, evaluator operation, API credential, wallet, signer, or on-chain claim requires its own security/readiness review.
