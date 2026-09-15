import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BloombergView, type AspItem, type CategoryMetric } from "./BloombergView";
import { EvaluatorView, type DisputeCardData } from "./EvaluatorView";
import { OkxSettingsModal, buildOkxSettingsPayload } from "./OkxSettingsModal";

const mockAsps: AspItem[] = [
  {
    id: "asp-dex-auditor",
    name: "DEX Auditor",
    category: "Audit",
    reputationScore: 92,
    medianPrice: 100,
    tasksCompleted: 20,
    rejectRate: 0.05,
    disputeRate: 0.01,
    recentVolume7d: 10,
    trustTier: "elite",
  },
  {
    id: "asp-mev-sentinel",
    name: "MEV Sentinel",
    category: "trading",
    reputationScore: 88,
    medianPrice: 75,
    tasksCompleted: 42,
    rejectRate: 0.02,
    disputeRate: 0.01,
    recentVolume7d: 35,
    trustTier: "verified",
  },
];

const mockBenchmarks: CategoryMetric[] = [
  {
    category: "audit",
    aspCount: 1,
    averagePrice: 100,
    medianPrice: 100,
    minPrice: 80,
    maxPrice: 120,
    averageRejectRate: 0.05,
    totalTasks7d: 20,
  },
  {
    category: "trading",
    aspCount: 1,
    averagePrice: 75,
    medianPrice: 75,
    minPrice: 50,
    maxPrice: 100,
    averageRejectRate: 0.02,
    totalTasks7d: 35,
  },
];

const mockDisputes: DisputeCardData[] = [
  {
    disputeId: "disp-101",
    taskId: "task-202",
    verdict: "PASS",
    rubric: {
      completeness: 30,
      correctnessQuality: 28,
      specAlignment: 19,
      goodFaithEffort: 18,
      totalScore: 95,
    },
    confidence: 0.95,
    safeToVote: true,
    escrowAmount: 150,
    feeEarned: 7.5,
    token: "USDT",
    feeClaimed: false,
    buyerGrievance: "Deliverable lacked stress test suite.",
    rationale: "Seller submitted thorough benchmark results conforming to spec.",
    transcript: "=== DELIBERATION TRANSCRIPT ===\nBuyer Advocate: Arguments verified.\nSeller Advocate: Requirements fulfilled.\nChief Arbiter: Ruling PASS.",
    timestamp: 1726000000000,
  },
];

describe("OKX UI Components", () => {
  it("exports BloombergView, EvaluatorView, and OkxSettingsModal correctly", () => {
    expect(typeof BloombergView).toBe("function");
    expect(typeof EvaluatorView).toBe("function");
    expect(typeof OkxSettingsModal).toBe("function");
    expect(BloombergView.name).toBe("BloombergView");
    expect(EvaluatorView.name).toBe("EvaluatorView");
    expect(OkxSettingsModal.name).toBe("OkxSettingsModal");
  });

  describe("BloombergView", () => {
    it("renders metric cards, table rows, and filters with mock data", () => {
      const html = renderToStaticMarkup(
        createElement(BloombergView, {
          asps: mockAsps,
          benchmarks: mockBenchmarks,
          totalVolume24h: 55000,
          activeAsps24h: 24,
          overallRejectRate: 0.045,
          onSelectAsp: vi.fn(),
        }),
      );

      // Verify header and metric cards
      expect(html).toContain("Bloomberg for OKX Agents");
      expect(html).toContain("Active ASPs");
      expect(html).toContain("24");
      expect(html).toContain("24h Est. Volume");
      expect(html).toContain("$55,000");
      expect(html).toContain("Market Reject Rate");
      expect(html).toContain("4.5%");

      // Verify category filter buttons
      expect(html).toContain("all");
      expect(html).toContain("audit");
      expect(html).toContain("trading");

      // Verify table rows and contents
      expect(html).toContain("DEX Auditor");
      expect(html).toContain("asp-dex-auditor");
      expect(html).toContain("MEV Sentinel");
      expect(html).toContain("asp-mev-sentinel");
      expect(html).toContain("elite");
      expect(html).toContain("verified");

      // Verify benchmarks section
      expect(html).toContain("Category Friction &amp; Pricing Distributions");
      expect(html).toContain("Median Price:");
      expect(html).toContain("$100 USDT");
    });

    it("normalizes category casing for category filters and matching", () => {
      const mixedCaseAsps: AspItem[] = [
        {
          id: "asp-1",
          name: "Agent One",
          category: "Audit",
          reputationScore: 90,
          medianPrice: 100,
          tasksCompleted: 10,
          rejectRate: 0.05,
          disputeRate: 0.01,
          recentVolume7d: 5,
          trustTier: "elite",
        },
        {
          id: "asp-2",
          name: "Agent Two",
          category: "audit",
          reputationScore: 85,
          medianPrice: 90,
          tasksCompleted: 12,
          rejectRate: 0.06,
          disputeRate: 0.02,
          recentVolume7d: 8,
          trustTier: "verified",
        },
      ];

      const html = renderToStaticMarkup(
        createElement(BloombergView, {
          asps: mixedCaseAsps,
        }),
      );

      // Casing should be normalized so only one "audit" filter button is rendered, not duplicates
      const auditButtonMatches = html.match(/>audit<\/button>/gi);
      expect(auditButtonMatches).toHaveLength(1);
      expect(html).toContain("Agent One");
      expect(html).toContain("Agent Two");
    });
  });

  describe("EvaluatorView", () => {
    it("renders dispute list, transcripts, rubric scores, and fee claiming details", () => {
      const html = renderToStaticMarkup(
        createElement(EvaluatorView, {
          okbStaked: 100,
          totalFeesEarned: 42.5,
          disputes: mockDisputes,
          onClaimFee: vi.fn(),
        }),
      );

      // Header and protection status
      expect(html).toContain("OKX Dispute Resolution Evaluator ASP");
      expect(html).toContain("OKB Stake Protection");
      expect(html).toContain("100 OKB");
      expect(html).toContain("Dispute Fees Earned");
      expect(html).toContain("$42.50 USDT");

      // Dispute feed list
      expect(html).toContain("Disputes Deliberated (1)");
      expect(html).toContain("disp-101");
      expect(html).toContain("task-202");
      expect(html).toContain("PASS");
      expect(html).toContain("+7.5 USDT Fee");

      // Details panel
      expect(html).toContain("Dispute Details:");
      expect(html).toContain("Claim Fee (7.5 USDT)");

      // Rubric scores
      expect(html).toContain("Completeness");
      expect(html).toContain("30/30");
      expect(html).toContain("Quality &amp; Tests");
      expect(html).toContain("28/30");
      expect(html).toContain("Spec Alignment");
      expect(html).toContain("19/20");
      expect(html).toContain("Good Faith");
      expect(html).toContain("18/20");

      // Grievance, Rationale, and Transcript
      expect(html).toContain("Buyer Rejection Grievance:");
      expect(html).toContain("Deliverable lacked stress test suite.");
      expect(html).toContain("Chief Arbiter Assessment &amp; Rationale:");
      expect(html).toContain("Seller submitted thorough benchmark results conforming to spec.");
      expect(html).toContain("Auditable Deliberation Transcript");
      expect(html).toContain("=== DELIBERATION TRANSCRIPT ===");

      // Slashing protection footer
      expect(html).toContain("Slashing Protection:");
      expect(html).toContain("Safe to Broadcast (Consensus Reached)");
      expect(html).toContain("95.0% (Threshold: 65%)");
    });

    it("renders dedicated empty state placeholder when disputes = []", () => {
      const html = renderToStaticMarkup(
        createElement(EvaluatorView, {
          disputes: [],
        }),
      );

      // Left feed indicates empty
      expect(html).toContain("Disputes Deliberated (0)");
      expect(html).toContain("No disputes on record.");

      // Right detail area renders dedicated clean empty-state placeholder
      expect(html).toContain("No Disputes on Record");
      expect(html).toContain("There are currently no dispute deliberations to evaluate.");
    });

    it("renders fee claimed state when dispute fee is already claimed", () => {
      const claimedDisputes: DisputeCardData[] = [
        {
          ...mockDisputes[0],
          feeClaimed: true,
        },
      ];

      const html = renderToStaticMarkup(
        createElement(EvaluatorView, {
          disputes: claimedDisputes,
        }),
      );

      expect(html).toContain("Fee Claimed");
    });
  });

  describe("OkxSettingsModal", () => {
    it("handles closed state and renders nothing when open is false", () => {
      const html = renderToStaticMarkup(
        createElement(OkxSettingsModal, {
          open: false,
          onClose: vi.fn(),
          onSave: vi.fn(),
        }),
      );

      expect(html).toBe("");
    });

    it("renders only server-only credential guidance and spend limit inputs", () => {
      const html = renderToStaticMarkup(
        createElement(OkxSettingsModal, {
          open: true,
          onClose: vi.fn(),
          onSave: vi.fn(),
          initialSettings: {
            treasuryBalance: 300,
            maxPerRunSpend: 75,
            monthlyBudgetCap: 750,
            token: "USDT",
          },
        }),
      );

      expect(html).toContain("OKX Onchain OS Gateway Settings");
      expect(html).toContain("Developer Portal Credentials");
      expect(html).toContain("server-only");
      expect(html).toContain("Railway service-scoped sealed variables");
      for (const secretLabel of [
        "API Key (OK-ACCESS-KEY)",
        "Passphrase",
        "Secret Key (HMAC-SHA256 Signing)",
        "Webhook Ingress Secret",
        "Base URL",
      ]) {
        expect(html).not.toContain(secretLabel);
      }

      expect(html).toContain("Autonomous Treasury &amp; Budget Limits");
      expect(html).toContain("Wallet Balance (USDT)");
      expect(html).toContain("value=\"300\"");
      expect(html).toContain("Max Per-Run (USDT)");
      expect(html).toContain("value=\"75\"");
      expect(html).toContain("Monthly Cap (USDT)");
      expect(html).toContain("value=\"750\"");
    });

    it("builds a settings payload without credential fields", () => {
      const payload = buildOkxSettingsPayload({
        treasuryBalance: 300,
        maxPerRunSpend: 75,
        monthlyBudgetCap: 750,
        token: "USDT",
      });
      expect(payload).toEqual({
        treasuryBalance: 300,
        maxPerRunSpend: 75,
        monthlyBudgetCap: 750,
        token: "USDT",
      });
      for (const key of ["apiKey", "secretKey", "passphrase", "webhookSecret", "baseUrl"]) {
        expect(payload).not.toHaveProperty(key);
      }
    });
  });
});
