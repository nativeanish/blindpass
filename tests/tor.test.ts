import { it, expect } from "vitest";
import { torTransport } from "../cli/src/tor.js";
import { createServer, type AddressInfo } from "node:net";
it("rejects proxy schemes that resolve DNS locally", async () => {
  await expect(torTransport("not-a-url")).rejects.toMatchObject({
    code: "TOR_NOT_AVAILABLE",
  });
  await expect(torTransport("socks5://127.0.0.1:9050")).rejects.toMatchObject({
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
    torTransport(`socks5h://127.0.0.1:${port}`),
  ).rejects.toMatchObject({ code: "TOR_NOT_AVAILABLE" });
});
