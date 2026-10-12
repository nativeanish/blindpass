import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("core routes have no serious or critical accessibility violations", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/app",
    "/app/buy",
    "/app/wallet",
    "/app/purchases",
    "/app/help",
    "/operator",
    "/demo/privacy",
    "/docs",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    const result = await new AxeBuilder({ page }).analyze();
    const violations = result.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect
      .soft(
        violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
        path,
      )
      .toEqual([]);
  }
});
