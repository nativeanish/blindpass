import { test, expect } from "@playwright/test";
test("buys a simulated invoice, receives real credits, searches and updates the local wallet", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app/buy");
  await page.getByRole("button", { name: "Get 10 private credits" }).click();
  await expect(
    page.getByText("SIMULATED PAYMENT EVENT", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Simulate payment confirmation" })
    .click();
  await page.getByRole("button", { name: "Receive private credits" }).click();
  await expect(
    page.getByText("10 PRIVATE CREDITS READY", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Make your first private search" })
    .click();
  await page.getByLabel("Search query").fill("privacy");
  await page.getByRole("button", { name: "Search privately" }).click();
  await expect(
    page.getByText(/PRIVATE CREDIT USED · 9 REMAINING/),
  ).toBeVisible();
  await expect(page.locator(".search-result").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("9 CREDITS", { exact: true })).toBeVisible();
  await page.goto("/app");
  await expect(page.locator(".stat-card.primary .stat-value")).toContainText(
    "9",
  );
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("runs real two-client issuance, shuffled redemption and all attacks", async ({
  page,
}) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Run complete demo" }).click();
  await expect(
    page.getByText(
      "Demo complete. Real credentials verified. Replay, forgery and malicious configuration rejected.",
    ),
  ).toBeVisible({ timeout: 60000 });
  await expect(
    page.locator(".attack-result").filter({ hasText: "TOKEN_ALREADY_SPENT" }),
  ).toBeVisible();
  await expect(
    page.locator(".attack-result").filter({ hasText: "INVALID_TOKEN" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".attack-result")
      .filter({ hasText: "ISSUER_POLICY_VIOLATION" }),
  ).toBeVisible();
  await expect(page.locator(".demo-matrix")).toContainText("50%");
  await page.getByRole("button", { name: "Run privacy audit" }).click();
  await expect(
    page.getByText("DIRECT NETWORK CONNECTION", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Stronger privacy assumptions" })
    .click();
  await expect(
    page.getByText("REDUCED SIDE-CHANNEL LINKABILITY", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/live-demo.png", fullPage: true });
});
test("landing, docs, merchant view, presentation and mobile layout render cleanly", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Pay privately. Use privately." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/landing-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/landing-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/demo/privacy");
  await expect(
    page.getByRole("heading", { name: "Break the link. Know the limits." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/docs");
  await expect(
    page.getByRole("heading", {
      name: "Access is a proof. It doesn’t need a profile.",
    }),
  ).toBeVisible();
  await page.goto("/admin");
  await expect(
    page.getByText("Payments dataset", { exact: true }),
  ).toBeVisible();
  await page.goto("/presentation");
  await expect(
    page.getByRole("heading", { name: "Private payment ≠ private usage." }),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("heading", {
      name: "One session. Every request connected.",
    }),
  ).toBeVisible();
});
