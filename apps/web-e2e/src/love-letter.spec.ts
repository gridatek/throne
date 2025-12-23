import { test, expect } from '@playwright/test';

test.describe('Love Letter Game', () => {
  test.describe('Home Page', () => {
    test('should display the home page with game title', async ({ page }) => {
      await page.goto('/');

      // Check title
      await expect(page.locator('h1')).toContainText('Love Letter');

      // Check for create game form
      await expect(page.locator('input[placeholder*="name"]')).toBeVisible();
      await expect(page.locator('button:has-text("Create Game")')).toBeVisible();
    });

    test('should show join game form when clicking join button', async ({ page }) => {
      await page.goto('/');

      // Click join game button
      await page.locator('button:has-text("Join Existing Game")').click();

      // Check join form is visible
      await expect(page.locator('input[placeholder*="6-digit code"]')).toBeVisible();
      await expect(page.locator('button:has-text("Join Game")')).toBeVisible();
    });

    test('should validate player name before creating game', async ({ page }) => {
      await page.goto('/');

      // Try to create game without name
      const createButton = page.locator('button:has-text("Create Game")');
      await expect(createButton).toBeDisabled();

      // Enter name
      await page.locator('input[placeholder*="name"]').fill('Test Player');

      // Button should be enabled
      await expect(createButton).toBeEnabled();
    });
  });

  test.describe('Game Creation and Lobby', () => {
    test('should create a game and navigate to lobby', async ({ page }) => {
      await page.goto('/');

      // Fill in player name
      await page.locator('input[placeholder*="name"]').fill('Player 1');

      // Create game (defaults to 4 max players)
      await page.locator('button:has-text("Create Game")').click();

      // Wait for navigation to lobby
      await page.waitForURL(/\/lobby\/.+/);

      // Check lobby elements
      await expect(page.locator('h1')).toContainText('Game Lobby');
      await expect(page.locator('text=Room Code')).toBeVisible();
      await expect(page.locator('text=Player 1')).toBeVisible();

      // Check host badge
      await expect(page.locator('text=Host')).toBeVisible();

      // Check start button is disabled (need at least 2 players)
      const startButton = page.locator('button:has-text("Start Game")');
      await expect(startButton).toBeDisabled();
    });

    test('should display correct game settings in lobby', async ({ page }) => {
      await page.goto('/');

      // Create game (defaults to 4 max players)
      await page.locator('input[placeholder*="name"]').fill('Host Player');
      await page.locator('button:has-text("Create Game")').click();

      await page.waitForURL(/\/lobby\/.+/);

      // Check max players
      await expect(page.locator('text=Max Players')).toBeVisible();
      await expect(page.locator('text=4').first()).toBeVisible();

      // Check tokens to win
      await expect(page.locator('text=Tokens to Win')).toBeVisible();
    });
  });

  test.describe('Multiplayer Game Flow', () => {
    test('should allow two players to join and start a game', async ({ browser }) => {
      // Create two browser contexts for two players
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();

      const player1 = await context1.newPage();
      const player2 = await context2.newPage();

      // Player 1 creates game
      await player1.goto('/');
      await player1.locator('input[placeholder*="name"]').fill('Player 1');
      await player1.locator('button:has-text("Create Game")').click();

      await player1.waitForURL(/\/lobby\/.+/);

      // Get room code
      const roomCodeElement = player1.locator('text=/[A-Z0-9]{6}/').first();
      const roomCode = await roomCodeElement.textContent();

      expect(roomCode).toBeTruthy();
      expect(roomCode?.length).toBe(6);

      // Player 2 joins game
      await player2.goto('/');
      await player2.locator('button:has-text("Join Existing Game")').click();
      await player2.locator('input[placeholder*="name"]').fill('Player 2');
      await player2.locator('input[placeholder*="6-digit code"]').fill(roomCode!);
      await player2.locator('button:has-text("Join Game")').click();

      await player2.waitForURL(/\/lobby\/.+/);

      // Both players should see each other
      await expect(player1.locator('text=Player 2')).toBeVisible();
      await expect(player2.locator('text=Player 1')).toBeVisible();

      // Player 1 should see enabled start button
      const startButton = player1.locator('button:has-text("Start Game")');
      await expect(startButton).toBeEnabled();

      // Start the game
      await startButton.click();

      // Both players should navigate to game
      await player1.waitForURL(/\/game\/.+/, { timeout: 10000 });
      await player2.waitForURL(/\/game\/.+/, { timeout: 10000 });

      // Check game page elements
      await expect(player1.locator('text=Your Hand')).toBeVisible();
      await expect(player2.locator('text=Your Hand')).toBeVisible();

      // Check players are displayed
      await expect(player1.locator('text=Player 1')).toBeVisible();
      await expect(player1.locator('text=Player 2')).toBeVisible();

      // Cleanup
      await context1.close();
      await context2.close();
    });
  });

  test.describe('Game Card Reference', () => {
    test('should display card reference in lobby', async ({ page }) => {
      await page.goto('/');

      await page.locator('input[placeholder*="name"]').fill('Test Player');
      await page.locator('button:has-text("Create Game")').click();

      await page.waitForURL(/\/lobby\/.+/);

      // Check card reference
      await expect(page.locator('text=Card Reference')).toBeVisible();

      // Check all card types are listed
      const cardNames = ['Princess', 'Countess', 'King', 'Prince', 'Handmaid', 'Baron', 'Priest', 'Guard'];

      for (const cardName of cardNames) {
        await expect(page.locator(`text=${cardName}`)).toBeVisible();
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should show error when joining non-existent game', async ({ page }) => {
      await page.goto('/');

      await page.locator('button:has-text("Join Existing Game")').click();
      await page.locator('input[placeholder*="name"]').fill('Test Player');
      await page.locator('input[placeholder*="6-digit code"]').fill('XXXXXX');
      await page.locator('button:has-text("Join Game")').click();

      // Should show error message
      await expect(page.locator('text=/Game not found|Failed to join/i')).toBeVisible();
    });

    test('should validate room code format', async ({ page }) => {
      await page.goto('/');

      await page.locator('button:has-text("Join Existing Game")').click();

      const roomCodeInput = page.locator('input[placeholder*="6-digit code"]');
      const joinButton = page.locator('button:has-text("Join Game")');

      // Empty room code - button should be disabled
      await expect(joinButton).toBeDisabled();

      // Partial room code - button should be disabled
      await roomCodeInput.fill('ABC');
      await expect(joinButton).toBeDisabled();

      // Full room code - button should be enabled
      await roomCodeInput.fill('ABCDEF');
      await roomCodeInput.blur();

      // Also need player name
      await page.locator('input[placeholder*="name"]').fill('Test');
      await expect(joinButton).toBeEnabled();
    });
  });

  test.describe('Navigation', () => {
    test('should navigate between home and lobby', async ({ page }) => {
      await page.goto('/');

      // Create game
      await page.locator('input[placeholder*="name"]').fill('Test Player');
      await page.locator('button:has-text("Create Game")').click();

      await page.waitForURL(/\/lobby\/.+/);

      // Go back to home
      await page.goto('/');

      // Should be on home page
      await expect(page.locator('h1:has-text("Love Letter")')).toBeVisible();
      await expect(page.locator('button:has-text("Create Game")')).toBeVisible();
    });
  });

  test.describe('Responsive Design', () => {
    test('should be mobile responsive', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/');

      // Check elements are visible on mobile
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('input[placeholder*="name"]')).toBeVisible();
      await expect(page.locator('button:has-text("Create Game")')).toBeVisible();

      // Create game and check lobby on mobile
      await page.locator('input[placeholder*="name"]').fill('Mobile Player');
      await page.locator('button:has-text("Create Game")').click();

      await page.waitForURL(/\/lobby\/.+/);

      await expect(page.locator('text=Room Code')).toBeVisible();
      await expect(page.locator('text=Players')).toBeVisible();
    });
  });
});
