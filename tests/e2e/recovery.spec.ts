import { test, expect } from "@playwright/test";
test("recovers a committed purchase after a lost response and page reload, then restores an encrypted backup on a new device", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app/buy");
  await page.getByRole("button", { name: "Get 10 private credits" }).click();
  await page
    .getByRole("button", { name: "Simulate payment confirmation" })
    .click();
  let interrupted = false;
  await page.route("**/api/issuance", async (route) => {
    await route.fetch();
    interrupted = true;
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Receive private credits" }).click();
  await expect.poll(() => interrupted).toBe(true);
  await page.unroute("**/api/issuance");
  await page.reload();
  await page.goto("/app/purchases");
  await page.getByRole("link", { name: "Recover credits" }).click();
  await page
    .getByRole("button", {
      name: /Recover private credits|Receive private credits/,
    })
    .click();
  await expect(
    page.getByText("10 PRIVATE CREDITS READY", { exact: true }),
  ).toBeVisible();
  await page.goto("/app/wallet");
  await page
    .getByLabel("Backup passphrase", { exact: true })
    .first()
    .fill("browser recovery passphrase");
  await page
    .getByLabel("Confirm passphrase")
    .fill("browser recovery passphrase");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download encrypted backup" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const fresh = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  try {
    const restored = await fresh.newPage();
    restored.on("pageerror", (e) => errors.push(e.message));
    await restored.goto("/app/wallet");
    await restored.getByLabel("Encrypted backup file").setInputFiles(path!);
    await restored
      .getByLabel("Backup passphrase", { exact: true })
      .last()
      .fill("browser recovery passphrase");
    await restored
      .getByRole("button", { name: "Restore encrypted backup" })
      .click();
    await expect(restored.getByRole("status")).toContainText("Wallet restored");
    await restored.goto("/app/search");
    await restored.getByLabel("Search query").fill("privacy");
    await restored.getByRole("button", { name: "Search privately" }).click();
    await expect(
      restored.getByText(/PRIVATE CREDIT USED · 9 REMAINING/),
    ).toBeVisible();
    await restored.setViewportSize({ width: 390, height: 844 });
    for (const route of [
      "/app/wallet",
      "/app/purchases",
      "/app/help",
      "/operator",
    ]) {
      await restored.goto(route);
      await expect(restored.locator("h1")).toBeVisible();
      expect(
        await restored.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        route,
      ).toBe(true);
    }
    await restored.goto("/app/wallet");
    await expect(restored.locator(".stat-card.primary .stat-value")).toHaveText(
      "9",
    );
    await restored.screenshot({
      path: "test-results/wallet-mobile.png",
      fullPage: true,
    });
  } finally {
    await fresh.close();
  }
  await page.screenshot({
    path: "test-results/wallet-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
