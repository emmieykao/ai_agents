import { expect, test } from 'playwright/test';

/**
 * UI smoke tests. These exercise everything that works without an AI key:
 * the three panels, the forms list, form selection sync, document selection,
 * and the responsive stack. The fill flow itself needs the model API and is
 * verified manually.
 */

test('letterhead and all three panels render', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Inkwell' })).toBeVisible();
  await expect(page.getByText('Documents', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The sheet' })).toBeVisible();
  await expect(page.getByText('Correspondence')).toBeVisible();
  await expect(
    page.getByPlaceholder('Ask for a form, or add missing details…'),
  ).toBeVisible();
});

test('welcome screen lists forms and selecting one opens the viewer', async ({
  page,
}) => {
  await page.goto('/');

  // Forms come from /api/forms; the welcome list renders one row per form.
  const formRow = page
    .locator('button', { hasText: /job application/i })
    .first();
  await expect(formRow).toBeVisible();

  // Animation controls only appear once a form is open.
  await expect(
    page.getByRole('group', { name: 'Fill animation style' }),
  ).toHaveCount(0);

  await formRow.click();

  // The viewer header takes the form's name and the picker syncs to it.
  await expect(
    page.getByRole('heading', { name: /job application/i }),
  ).toBeVisible();
  await expect(page.locator('#form-select')).toHaveValue(/job-application/);
  await expect(
    page.getByRole('group', { name: 'Fill animation style' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Fill from document' }),
  ).toBeEnabled();
});

test('documents list loads and marks the selected source', async ({ page }) => {
  await page.goto('/');

  // At least one document row appears (the repo ships samples); the
  // auto-selected source is labeled.
  await expect(page.getByText('in use').first()).toBeVisible();

  const upload = page.getByText('Drop a document');
  await expect(upload).toBeVisible();
});

test('panels stack on a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Inkwell' })).toBeVisible();
  await expect(page.getByText('Documents', { exact: true })).toBeVisible();
  await expect(page.getByText('Correspondence')).toBeVisible();

  // Drag gutters are a desktop affordance and stay hidden on mobile.
  for (const separator of await page.getByRole('separator').all()) {
    await expect(separator).toBeHidden();
  }
});

test('night theme toggles and persists across reloads', async ({ page }) => {
  await page.goto('/');

  // Default (light OS preference in the test browser): no explicit theme.
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: /night/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // The choice survives a reload (applied pre-paint by the head script).
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: /day/i })).toBeVisible();
});

test('animation style preference persists across reloads', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('button', { hasText: /travel request/i })
    .first()
    .click();

  const instant = page.getByRole('button', { name: 'instant' });
  await instant.click();
  await expect(instant).toHaveAttribute('aria-pressed', 'true');

  // Selection resets on reload, so re-open a form to reveal the controls;
  // the style choice itself is remembered.
  await page.reload();
  await page
    .locator('button', { hasText: /travel request/i })
    .first()
    .click();
  await expect(
    page.getByRole('button', { name: 'instant' }),
  ).toHaveAttribute('aria-pressed', 'true');
});
