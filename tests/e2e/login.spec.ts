import { test, expect } from "@playwright/test";
test("login and recovery are accessible and responsive", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Good to see you." }),
  ).toBeVisible();
  await expect(page.getByLabel("Work email")).toBeVisible();
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(
    page.getByRole("heading", { name: "Password recovery" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Request reset" }),
  ).toBeVisible();
});
test("anonymous navigation redirects to login", async ({ page }) => {
  await page.goto("/employees");
  await expect(
    page.getByRole("heading", { name: "Good to see you." }),
  ).toBeVisible();
});
test("administrator can browse and create employee records against a live API", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Work email").fill("admin@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("E2E_Fictional_Only_123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Hello,/ })).toBeVisible();
  await expect(page.locator(".stat-card")).toHaveCount(4);
  await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.screenshot({
    path: "test-results/dashboard-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Use light theme" }).click();
  await page.getByRole("link", { name: "Employees", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Employee directory" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add employee" }).click();
  await page.getByLabel("Employee ID *").fill("GH-E2E");
  await page.getByLabel("First name *").fill("Jordan");
  await page.getByLabel("Last name *").fill("Cruz");
  await page.getByLabel("Work email *").fill("jordan@example.test");
  await page.getByLabel("Department *").selectOption({ label: "Engineering" });
  await page.getByLabel("Branch *").selectOption({ label: "Manila Office" });
  await page.getByLabel("Hire date *").fill("2026-10-01");
  await page.getByLabel("Change reason *").fill("Fictional E2E onboarding");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByText("GH-E2E", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/employee-directory.png",
    fullPage: true,
  });
});
test("payroll preparation and independent approval use persisted snapshots, and finalization remains blocked", async ({
  page,
}) => {
  const signIn = async (email: string) => {
    await page.goto("/login");
    await page.getByLabel("Work email").fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("E2E_Fictional_Only_123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Hello,/ })).toBeVisible();
  };
  await signIn("admin@example.test");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Payroll", exact: true })
    .click();
  await page.getByRole("button", { name: "New payroll run" }).click();
  await page
    .getByLabel("Payroll cutoff *")
    .selectOption({ label: "October 2026 — First half" });
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByRole("button", { name: "Calculate payroll" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Calculate payroll" }).click();
  await expect(
    page.getByRole("heading", { name: "Calculated", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Alex Santos", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/payroll-preview.png",
    fullPage: true,
  });
  const runUrl = page.url();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await page.getByLabel("Decision reason *").fill("Fictional E2E review");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByRole("heading", { name: "Under Review", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await signIn("approver@example.test");
  await page.goto(runUrl);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page
    .getByLabel("Decision reason *")
    .fill("Fictional independent review");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByRole("heading", { name: "Approved", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Finalize", exact: true }).click();
  await page
    .getByLabel("Decision reason *")
    .fill("Fictional finalization attempt");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("Resolve all payroll exceptions before finalization"),
  ).toBeVisible();
});
test("employee sees only their own directory record and no company payroll navigation", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Work email").fill("alex@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("E2E_Fictional_Only_123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Hello, Alex/ }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation")
      .getByRole("link", { name: "Payroll", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Employees", exact: true }).click();
  await expect(page.getByText("GH-0001", { exact: true })).toBeVisible();
  await expect(page.getByText("GH-0002", { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/employee-mobile.png",
    fullPage: true,
  });
});
