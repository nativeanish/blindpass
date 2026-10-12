import { expect, test } from "@playwright/test";
import type { ServiceInfo } from "../../packages/shared/src/index.js";

test("shows the actual network and leaves unconfigured networks unavailable", async ({
  page,
}) => {
  await page.goto("/app/buy");
  const selector = page.getByRole("combobox", { name: "Zcash network" });
  await expect(selector).toHaveValue("simulation");
  await expect(selector.locator('option[value="devnet"]')).toBeDisabled();
  await expect(selector.locator('option[value="mainnet"]')).toBeDisabled();
  await expect(selector.locator('option[value="mainnet"]')).toContainText(
    "Not configured",
  );
  await expect(
    page.getByText("Simulated payments · No real funds", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(selector).toHaveValue("simulation");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(selector).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/payment-networks-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/payment-networks-desktop.png",
    fullPage: true,
  });
});

for (const environment of ["devnet", "mainnet"] as const) {
  test(`reflects the active ${environment} deployment without offering simulation`, async ({
    page,
  }) => {
    await page.route("**/api/service", async (route) => {
      const response = await route.fetch();
      const data: ServiceInfo = await response.json();
      await route.fulfill({
        json: {
          ...data,
          paymentMode: "scanner",
          network: environment === "devnet" ? "testnet" : "mainnet",
          paymentEnvironment: environment,
          paymentEnvironments: data.paymentEnvironments.map((option) => ({
            ...option,
            available: option.id === environment,
            url: null,
          })),
        },
      });
    });
    await page.goto("/app/buy");
    const selector = page.getByRole("combobox", { name: "Zcash network" });
    await expect(selector).toHaveValue(environment);
    await expect(selector.locator('option[value="simulation"]')).toBeDisabled();
    await expect(
      page.getByText(
        environment === "devnet"
          ? "Zcash testnet · Test funds only"
          : "Zcash mainnet · Real ZEC payments",
        { exact: true },
      ),
    ).toBeVisible();
  });

  test(`switches to configured ${environment} without forwarding purchase details`, async ({
    page,
  }) => {
    const target = `https://${environment}.blindpass.test/app`;
    await page.route("**/api/service", async (route) => {
      const response = await route.fetch();
      const data: ServiceInfo = await response.json();
      await route.fulfill({
        json: {
          ...data,
          paymentEnvironments: data.paymentEnvironments.map((option) =>
            option.id === environment
              ? { ...option, available: true, url: target }
              : option,
          ),
        },
      });
    });
    await page.route(`https://${environment}.blindpass.test/**`, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Selected workspace</h1>",
      }),
    );
    await page.goto("/app/buy?invoice=local-purchase#private-context");
    const selector = page.getByRole("combobox", { name: "Zcash network" });
    await expect(selector).toBeEnabled();
    await selector.selectOption(environment);
    await expect(page).toHaveURL(target);
    await expect(
      page.getByRole("heading", { name: "Selected workspace" }),
    ).toBeVisible();
  });
}

test("does not claim a network when service details cannot be loaded", async ({
  page,
}) => {
  await page.route("**/api/service", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/app/buy");
  const selector = page.getByRole("combobox", { name: "Zcash network" });
  await expect(selector).toBeDisabled();
  await expect(selector).toHaveValue("");
  await expect(
    page.getByText("Unable to check payment networks", { exact: true }),
  ).toBeVisible();
});
