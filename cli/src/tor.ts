import nodeFetch from "node-fetch";
import { SocksProxyAgent } from "socks-proxy-agent";
import { BlindPassError } from "@blindpass/shared";
import type { Transport } from "@blindpass/client";
export async function torTransport(
  proxy = process.env.ALL_PROXY ||
    process.env.TOR_PROXY ||
    "socks5h://127.0.0.1:9050",
): Promise<Transport> {
  let url: URL;
  try {
    url = new URL(proxy);
  } catch {
    throw new BlindPassError(
      "TOR_NOT_AVAILABLE",
      503,
      "The configured SOCKS proxy URL is invalid.",
    );
  }
  if (url.protocol !== "socks5h:")
    throw new BlindPassError(
      "TOR_NOT_AVAILABLE",
      503,
      "Use a socks5h:// proxy so DNS resolution also occurs through the proxy.",
    );
  const agent = new SocksProxyAgent(proxy);
  try {
    const response = await nodeFetch("https://check.torproject.org/api/ip", {
      agent,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    const status = (await response.json()) as { IsTor?: boolean };
    if (!response.ok || status.IsTor !== true)
      throw new Error("Not a Tor exit");
  } catch {
    agent.destroy();
    throw new BlindPassError(
      "TOR_NOT_AVAILABLE",
      503,
      "Could not verify Tor through the configured proxy. No direct fallback was attempted.",
    );
  }
  return async (url, init = {}) => {
    const target = new URL(url);
    if (["localhost", "127.0.0.1", "[::1]"].includes(target.hostname))
      throw new BlindPassError(
        "TOR_NOT_AVAILABLE",
        503,
        "A Tor exit cannot reach this local development server. Configure BLINDPASS_API_URL to a reachable HTTPS or onion service.",
      );
    try {
      const response = await nodeFetch(url, {
        agent,
        method: init.method,
        headers: init.headers as Record<string, string>,
        body: typeof init.body === "string" ? init.body : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
      return new Response(await response.arrayBuffer(), {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      });
    } catch {
      throw new BlindPassError(
        "TOR_NOT_AVAILABLE",
        503,
        "The Tor request failed. The result may be ambiguous; no direct fallback was attempted.",
      );
    }
  };
}
