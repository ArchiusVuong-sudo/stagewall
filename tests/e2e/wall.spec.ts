import { expect, test, type Page } from "@playwright/test";

async function send(page: Page, name: string, track: string, message: string) {
  const phone = page.getByTestId("phone");
  const write = phone.getByRole("button", { name: "Write a message" });
  if (await write.count()) await write.click();
  await phone.locator('input[name="name"]').fill(name);
  await phone.locator("label", { hasText: track }).first().click();
  await phone.locator('textarea[name="message"]').fill(message);
  await expect(phone.getByRole("button", { name: "Send" })).toBeDisabled();
  await phone.getByText("Show on the screen tonight").click();
  await phone.getByRole("button", { name: "Send" }).click();
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test("a message is scrubbed on the server, approved and shown on the venue screen", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/live");
  await expect(page.getByTestId("mode-badge")).toHaveText("Replay mode");
  await expect(page.getByText("Synthetic demo data").first()).toBeVisible();

  await send(page, "Ines", "Glasshouse", "Glasshouse got me through finals, text me (415) 555-0134");
  const card = page.getByTestId("status-card").first();
  await expect(card.getByTestId("status-pill")).toHaveText("Live");
  await expect(card).toContainText("We removed your phone number");

  const screen = page.getByTestId("venue-screen");
  await expect(screen.getByText("Glasshouse got me through finals").first()).toBeVisible();
  await expect(screen.getByText("phone removed").first()).toBeVisible();
  expect(await page.content()).not.toContain("555-0134");
  expect(errors).toEqual([]);
});

test("a risky message waits for a person, then a producer approves it from the keyboard", async ({ page, context }) => {
  const errors = watchErrors(page);
  await page.goto("/live");
  await send(page, "Ines", "Glasshouse", "selling 2 tix for lisbon, dm @ines_example");
  const pill = page.getByTestId("status-card").first().getByTestId("status-pill");
  await expect(pill).toHaveText("Waiting for a person");
  await expect(page.getByTestId("venue-screen").getByText("selling 2 tix")).toHaveCount(0);

  const consolePage = await context.newPage();
  const consoleErrors = watchErrors(consolePage);
  await consolePage.goto("/console");
  const held = consolePage.getByTestId("col-review").getByTestId("queue-card").filter({ hasText: "selling 2 tix" });
  await expect(held).toContainText("handle removed");
  await held.click();
  await expect(consolePage.getByTestId("policy-result")).toHaveText("Held for a person");
  await expect(consolePage.getByTestId("tool-args")).toContainText('"decision": "review"');
  await consolePage.keyboard.press("Escape");
  await consolePage.keyboard.press("a");
  await expect(consolePage.getByTestId("col-live").getByText("selling 2 tix")).toBeVisible();
  await expect(consolePage.getByTestId("toast")).toContainText("Approved");

  // The phone and the venue screen update over the live channel, no reload.
  await expect(pill).toHaveText("Live");
  await expect(page.getByTestId("venue-screen").getByText("selling 2 tix").first()).toBeVisible();
  expect([...errors, ...consoleErrors]).toEqual([]);
});

test("the fan deletes a live message and it leaves every screen at once", async ({ page, context }) => {
  await page.goto("/live");
  await send(page, "Tavi", "Paper Moons", "Paper Moons on vinyl tonight, my heart is full");
  await expect(page.getByTestId("status-card").first().getByTestId("status-pill")).toHaveText("Live");

  const venue = await context.newPage();
  await venue.goto("/screen");
  await expect(venue.getByText("Paper Moons on vinyl tonight").first()).toBeVisible();

  await page.getByTestId("status-card").first().getByRole("button", { name: "Delete my message" }).click();
  await expect(page.getByTestId("status-card").first().getByTestId("status-pill")).toHaveText("Deleted");
  await expect(venue.getByText("Paper Moons on vinyl tonight")).toHaveCount(0);
  await expect(page.getByTestId("venue-screen").getByText("Paper Moons on vinyl tonight")).toHaveCount(0);

  const consolePage = await context.newPage();
  await consolePage.goto("/console");
  await consolePage.getByRole("tab", { name: "Privacy" }).click();
  const audit = consolePage.getByTestId("audit");
  await expect(audit.getByText("deleted by fan").first()).toBeVisible();
  await expect(audit).not.toContainText("Paper Moons");
});
