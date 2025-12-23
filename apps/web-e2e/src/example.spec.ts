import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect h1 to contain Love Letter title
  expect(await page.locator('h1').innerText()).toContain('Love Letter');
});
