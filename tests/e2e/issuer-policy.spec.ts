import { test, expect } from "@playwright/test";

test("explains a local address mismatch and allows purchase at the configured address", async ({
  page,
  baseURL,
}) => {
  const address = new URL(baseURL!);
  test.skip(
    address.hostname !== "localhost",
    "Requires the local localhost issuer.",
  );
  const alias = new URL("/app/buy", address);
  alias.hostname = "127.0.0.1";
  const purchases: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/invoices"
    )
      purchases.push(request.url());
  });
  await page.goto(alias.href);
  await page.getByRole("button", { name: "Get 10 private credits" }).click();
  const error = page.locator(".notice.error");
  await expect(error).toContainText("ISSUER_POLICY_VIOLATION");
  await expect(error).toContainText(`Expected issuer "${alias.host}"`);
  await expect(error).toContainText(`configured for "${address.host}"`);
  expect(purchases).toEqual([]);
  await expect(
    page.getByRole("link", { name: "Get help with issuer verification." }),
  ).toBeVisible();

  await page.goto(new URL("/app/buy", address).href);
  await page.getByRole("button", { name: "Get 10 private credits" }).click();
  await expect(
    page.getByText("SIMULATED PAYMENT EVENT", { exact: true }),
  ).toBeVisible();
  expect(purchases).toHaveLength(1);
});
