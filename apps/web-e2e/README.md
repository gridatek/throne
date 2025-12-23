# Love Letter E2E Tests

End-to-end tests for the Love Letter card game using Playwright.

## Prerequisites

- Node.js 20+
- Supabase CLI installed
- All dependencies installed (`npm install`)

## Running Tests Locally

### 1. Start Supabase

```bash
cd apps/supabase
supabase start
```

### 2. Run E2E Tests

```bash
# Run all tests
npx nx e2e web-e2e

# Run specific test file
npx playwright test apps/web-e2e/src/love-letter.spec.ts

# Run in headed mode (see browser)
npx nx e2e web-e2e --headed

# Run in UI mode (interactive)
npx playwright test --ui
```

### 3. View Test Reports

After running tests, you can view the HTML report:

```bash
npx playwright show-report dist/.playwright/apps/web-e2e/playwright-report
```

## Test Structure

- `example.spec.ts` - Basic smoke test
- `love-letter.spec.ts` - Comprehensive game tests including:
  - Home page functionality
  - Game creation and lobby
  - Multiplayer flow with 2+ players
  - Card reference display
  - Error handling
  - Responsive design

## CI/CD

Tests run automatically on GitHub Actions for:
- Push to `main`, `develop`, or `feature/**` branches
- Pull requests to `main` or `develop`

The CI workflow:
1. Installs dependencies
2. Starts Supabase
3. Runs E2E tests with `e2e-ci` target
4. Uploads test results and screenshots

## Debugging Failed Tests

If tests fail in CI:

1. Check the uploaded artifacts in GitHub Actions
2. Download the `playwright-report` artifact
3. Unzip and open `index.html` to see detailed results
4. Check `playwright-screenshots` for failure screenshots

## Writing New Tests

Add new test files in `apps/web-e2e/src/` with the pattern `*.spec.ts`.

Example:

```typescript
import { test, expect } from '@playwright/test';

test('my test', async ({ page }) => {
  await page.goto('/');
  // Your test logic
});
```

## Configuration

- `playwright.config.ts` - Playwright configuration
- Tests run on Chromium, Firefox, and WebKit browsers
- Base URL: `http://localhost:4200`
- The dev server starts automatically before tests
