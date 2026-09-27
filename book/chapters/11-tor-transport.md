# 11 Network Privacy & Routing Through Tor

> **Part IV — Clients · Build checkpoint 3 of 3**

*In this chapter*
- Validate SOCKS5h proxy policy to ensure remote DNS resolution
- Verify Tor exit status before allowing any application traffic
- Build a fail-closed transport with no direct-network fallback
- Reject loopback destinations that cannot be reached through exit nodes

The CLI currently uses the direct SDK transport. You will add one alternative
transport with a stronger invariant: it is returned only after a Tor exit check
succeeds, and it contains no direct-network fallback branch.

If the same source IP buys and immediately redeems a token, the issuer does not
need to break the VOPRF. Network metadata supplies the correlation. Tor adds a
separate routing layer for the Node CLI, provided every destination lookup and
request stays inside the SOCKS tunnel.

## 11.1 Step 1 — Validate proxy policy

The `socks5h` scheme means the proxy resolves hostnames. Plain `socks5` may
resolve DNS locally, exposing destinations to the local resolver and network.
BlindPass accepts only `socks5h://` and rejects invalid schemes.

> **⚠ PITFALL: Plain socks5:// resolves DNS locally**
>
> Plain socks5:// resolves DNS locally, exposing destinations to the local resolver and network observer. Always require socks5h:// for remote DNS resolution.

```typescript
// File: cli/src/tor.ts
import nodeFetch from "node-fetch";
import { SocksProxyAgent } from "socks-proxy-agent";
import { BlindPassError } from "@blindpass/shared";
import type { Transport } from "@blindpass/client";

export async function torTransport(
  proxy = process.env.ALL_PROXY ||
    process.env.TOR_PROXY ||
    "socks5h://127.0.0.1:9050", // <1>
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

  if (url.protocol !== "socks5h:") // <2>
    throw new BlindPassError(
      "TOR_NOT_AVAILABLE",
      503,
      "Use a socks5h:// proxy so DNS resolution also occurs through the proxy.",
    );

  const agent = new SocksProxyAgent(proxy); // <3>

  try {
    const response = await nodeFetch("https://check.torproject.org/api/ip", { // <4>
      agent,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    const status = (await response.json()) as { IsTor?: boolean };
    
    if (!response.ok || status.IsTor !== true) // <5>
      throw new Error("Not a Tor exit");
  } catch {
    agent.destroy(); // <6>
    throw new BlindPassError(
      "TOR_NOT_AVAILABLE",
      503,
      "Could not verify Tor through the configured proxy. No direct fallback was attempted.",
    );
  }

  return async (url, init = {}) => {
    const target = new URL(url);
    if (["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) // <7>
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
        redirect: "error", // <8>
        signal: AbortSignal.timeout(30000),
      });

      return new Response(await response.arrayBuffer(), {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      });
    } catch {
      throw new BlindPassError(
        "TOR_NOT_AVAILABLE", // <9>
        503,
        "The Tor request failed. The result may be ambiguous; no direct fallback was attempted.",
      );
    }
  };
}
```

> **<1>** Default proxy: socks5h://127.0.0.1:9050
>
> **<2>** Parse and require socks5h: protocol — plain socks5 resolves DNS locally
>
> **<3>** Create SocksProxyAgent
>
> **<4>** Tor exit check via https://check.torproject.org/api/ip
>
> **<5>** Require IsTor: true before returning transport
>
> **<6>** Destroy agent on check failure
>
> **<7>** Reject loopback destinations (localhost, 127.0.0.1, [::1])
>
> **<8>** No redirect following, no direct retry
>
> **<9>** All errors map to TOR_NOT_AVAILABLE — never silent fallback

> **▶ Try It Out**
> ```bash
> pnpm run build
> ```
> Expected output should show successful compilation of the CLI with the updated transport module.

Build `torTransport` in three gates. Parse and require `socks5h:` before creating
an agent. Use that agent for the Tor exit check and destroy it on failure. Return
a closure that reuses the agent for application requests, rejects loopback
destinations and redirects, and maps every network error to
`TOR_NOT_AVAILABLE`. Do not accept an optional direct transport in this module;
making fallback impossible is simpler than remembering to disable it.

> **🔒 SECURITY NOTE: The Tor exit check reveals to check.torproject.org**
>
> The Tor exit check reveals to check.torproject.org that a Tor client is testing its connection. This is a reachability assertion, not a guarantee of anonymity.

Before returning a transport, the function requests the Tor Project's exit
check through the proxy and requires `IsTor: true`. This is a reachability and
routing assertion at that moment, not a guarantee of anonymity. The check
itself reveals to the Tor exit-check service that a Tor client is testing its
connection.

The returned transport attaches the same proxy agent to every request, rejects
redirects, sets a timeout, and converts `node-fetch` responses to the Web
`Response` interface consumed by the SDK. Any exception becomes
`TOR_NOT_AVAILABLE`; there is no direct retry.

```text
┌─────────────┐     SOCKS5h     ┌────────┐     ┌───────┐     ┌───────┐     HTTPS     ┌─────────────┐
│ BlindPass   │───────────>│ Guard  │────>│ Relay │────>│ Exit  │─────────>│ BlindPass   │
│ CLI         │             │        │     │       │     │       │             │ API         │
└─────────────┘             └────────┘     └───────┘     └───────┘             └─────────────┘
      │                                                                              ▲
      ╳─────── forbidden direct fallback ───────────────────────────────────────╳
```

Localhost is rejected because a public Tor exit cannot connect back to the
CLI's loopback interface. For development, use direct mode. To test end to end
through Tor, expose a deliberate HTTPS staging host or onion service and set
`BLINDPASS_API_URL` accordingly.

## 11.2 Step 2 — Fail closed under attack

```typescript
// File: tests/tor.test.ts
import { it, expect } from "vitest";
import { torTransport } from "../cli/src/tor.js";
import { createServer, type AddressInfo } from "node:net";

it("rejects proxy schemes that resolve DNS locally", async () => {
  await expect(torTransport("not-a-url")).rejects.toMatchObject({
    code: "TOR_NOT_AVAILABLE",
  });
  await expect(torTransport("socks5://127.0.0.1:9050")).rejects.toMatchObject({ // <1>
    code: "TOR_NOT_AVAILABLE",
  });
});

it("fails closed when the configured SOCKS proxy is unavailable", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await expect(
    torTransport(`socks5h://127.0.0.1:${port}`), // <2>
  ).rejects.toMatchObject({ code: "TOR_NOT_AVAILABLE" });
}); // <3>
```

> **<1>** Reject socks5:// (local DNS downgrade)
>
> **<2>** Unavailable proxy raises TOR_NOT_AVAILABLE
>
> **<3>** No assertion for absent direct transport — code review + single injected transport boundary

> **▶ Try It Out**
> ```bash
> pnpm exec vitest run tests/tor.test.ts
> docker compose --profile tor up -d tor
> BLINDPASS_API_URL=https://staging.example pnpm blindpass search --tor "privacy pass"
> ```
> Expected output should show the tests passing successfully, followed by Docker starting the Tor service, and lastly the application searching via the tor network.

The first test catches a local-DNS downgrade. The second allocates and closes a
loopback port, then proves an unavailable proxy raises the Tor-specific error.
There is no assertion that direct fetch was avoided because the implementation
contains no direct transport branch after Tor selection; code review and the
single injected transport boundary preserve that property.

Do not point the final command at a host you do not control while testing real
credentials.

## 11.3 Step 3 — Know what Tor does not normalize

Tor separates the destination from the source IP as observed by ordinary
endpoints. It does not hide query contents from BlindPass, prevent application
fingerprinting, equalize request sizes, or defeat a sufficiently capable global
observer correlating timing and volume.

> **🔒 SECURITY NOTE: Tor does not normalize application fingerprints**
>
> Tor does not normalize application fingerprints — the Node TLS handshake differs from browsers, unique API paths can stand out, and request timing may correlate sessions.

The Node TLS handshake may differ from
the browser's. A unique API path, header set, or issuance batch time can still
stand out.

Delay redemption, use common batch sizes, avoid invoice-derived headers, and
keep request shapes stable. OHTTP is a future option for separating client
network identity from an application request through a relay, but it brings key
configuration, relay trust, replay, and padding choices of its own.

### Build checkpoint

Tor mode now has a crisp invariant: either a verified SOCKS5h path carries the
request or the command fails. It never silently exchanges privacy for
availability.

You now have two durable clients using one protocol SDK. Part V stops adding
features and tries to break the assembled system.
