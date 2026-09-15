import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import { x402HTTPResourceServer, type HTTPAdapter, type HTTPProcessResult } from "@okxweb3/x402-core/http";
import { x402ResourceServer } from "@okxweb3/x402-core/server";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";

export const X402_TESTNET_NETWORK = "eip155:1952";
export const X402_TESTNET_RESOURCE_PATH = "/api/okx/x402-testnet/market-intelligence";

export interface X402TestnetConfiguration {
  enabled: boolean;
  apiKey?: string;
  secretKey?: string;
  passphrase?: string;
  payTo?: string;
  resourceUrl?: string;
  price?: string;
}

export interface X402TestnetStatus {
  enabled: boolean;
  ready: boolean;
  network: typeof X402_TESTNET_NETWORK;
  resourcePath: typeof X402_TESTNET_RESOURCE_PATH;
  reason?: string;
}

/**
 * A testnet-only adapter around the official OKX x402 server SDK. It constructs
 * no facilitator client and performs no network operation until the explicit
 * feature flag and every server-only setting are present.
 */
export class X402TestnetResource {
  private initialization?: Promise<x402HTTPResourceServer>;
  private readonly config: X402TestnetConfiguration;

  constructor(config: X402TestnetConfiguration) {
    this.config = config;
  }

  status(): X402TestnetStatus {
    if (!this.config.enabled) {
      return {
        enabled: false,
        ready: false,
        network: X402_TESTNET_NETWORK,
        resourcePath: X402_TESTNET_RESOURCE_PATH,
        reason: "OKX_X402_TESTNET_ENABLED is not true",
      };
    }

    const missing = [
      ["OKX_API_KEY", this.config.apiKey],
      ["OKX_SECRET_KEY", this.config.secretKey],
      ["OKX_PASSPHRASE", this.config.passphrase],
      ["OKX_X402_TESTNET_PAY_TO", this.config.payTo],
      ["OKX_X402_TESTNET_RESOURCE_URL", this.config.resourceUrl],
    ].filter(([, value]) => !value).map(([name]) => name);

    return {
      enabled: true,
      ready: missing.length === 0,
      network: X402_TESTNET_NETWORK,
      resourcePath: X402_TESTNET_RESOURCE_PATH,
      ...(missing.length ? { reason: `Missing server-only testnet configuration: ${missing.join(", ")}` } : {}),
    };
  }

  async process(adapter: HTTPAdapter): Promise<HTTPProcessResult> {
    return (await this.getHttpServer()).processHTTPRequest({
      adapter,
      method: adapter.getMethod(),
      path: adapter.getPath(),
    }, { testnet: true });
  }

  async settle(
    adapter: HTTPAdapter,
    process: Extract<HTTPProcessResult, { type: "payment-verified" }>,
    responseBody: Buffer,
  ) {
    return (await this.getHttpServer()).processSettlement(
      process.paymentPayload,
      process.paymentRequirements,
      process.declaredExtensions,
      {
        request: {
          adapter,
          method: adapter.getMethod(),
          path: adapter.getPath(),
        },
        responseBody,
        responseHeaders: { "content-type": "application/json" },
      },
    );
  }

  private async getHttpServer(): Promise<x402HTTPResourceServer> {
    const status = this.status();
    if (!status.ready) throw new Error(status.reason ?? "x402 testnet is unavailable");
    if (!this.initialization) {
      this.initialization = (async () => {
        const facilitator = new OKXFacilitatorClient({
          apiKey: this.config.apiKey!,
          secretKey: this.config.secretKey!,
          passphrase: this.config.passphrase!,
          // A successful test must include a real settlement proof, rather than
          // accepting a pending/local fallback result.
          syncSettle: true,
        });
        const resourceServer = new x402ResourceServer(facilitator)
          .register(X402_TESTNET_NETWORK, new ExactEvmScheme());
        const httpServer = new x402HTTPResourceServer(resourceServer, {
          [`POST ${X402_TESTNET_RESOURCE_PATH}`]: {
            accepts: [{
              scheme: "exact",
              network: X402_TESTNET_NETWORK,
              payTo: this.config.payTo!,
              price: this.config.price || "$0.01",
              maxTimeoutSeconds: 300,
            }],
            resource: this.config.resourceUrl!,
            description: "Kind Meitner market intelligence — X Layer testnet only",
            mimeType: "application/json",
          },
        });
        await httpServer.initialize();
        return httpServer;
      })();
    }
    return this.initialization;
  }
}
