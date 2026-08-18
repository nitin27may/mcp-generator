import { expect, test } from '@playwright/test';
import { seedReadyProject } from './fixtures/seed-project';

/**
 * Keyboard-only traversal of the two custom widgets in the wizard: the
 * endpoint inventory's roving-tabindex table (`OperationTable`) and the
 * parameter binding table's `Select`/remove-button controls. No `.click()`
 * anywhere — every interaction goes through `.focus()` (establishing where
 * a Tab sequence would land) plus real key presses.
 */
test.describe('keyboard-only traversal', () => {
  test('operation table: arrow keys move the roving row, Enter opens the designer, the checkbox is independently reachable', async ({
    page,
    request,
  }) => {
    const projectId = await seedReadyProject(request, 'keyboard-tools');
    await page.goto(`/projects/${projectId}/tools`);

    const rows = page.getByRole('row').filter({ has: page.getByRole('checkbox') });
    const firstRow = rows.first();
    const secondRow = rows.nth(1);

    await firstRow.focus();
    await expect(firstRow).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(secondRow).toBeFocused();

    await page.keyboard.press('ArrowUp');
    await expect(firstRow).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.getByText('Tool details')).toBeVisible();

    const checkbox = firstRow.getByRole('checkbox');
    const wasChecked = await checkbox.isChecked();
    await checkbox.focus();
    await expect(checkbox).toBeFocused();
    await page.keyboard.press('Space');
    await expect(checkbox).toBeChecked({ checked: !wasChecked });
  });

  test('binding table: the kind Select and Remove button are both operable without a mouse', async ({ page, request }) => {
    const projectId = await seedReadyProject(request, 'keyboard-bindings');
    await page.goto(`/projects/${projectId}/bindings`);

    const customerIdRow = page.getByRole('row', { name: /customerId/ });
    const kindSelect = customerIdRow.getByRole('combobox', { name: 'Source' });

    await kindSelect.focus();
    await expect(kindSelect).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('option', { name: 'Static value' })).toBeVisible();
    // allowedKinds order for this table is [tool-input, environment, secret, static]; the
    // binding starts as tool-input (seeded), so three ArrowDowns reaches "Static value".
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByPlaceholder('Value')).toBeVisible();

    const removeButton = customerIdRow.getByRole('button', { name: /Remove binding for customerId/ });
    await removeButton.focus();
    await expect(removeButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(customerIdRow.getByRole('button', { name: 'Bind' })).toBeVisible();
    await expect(customerIdRow.getByText(/has no binding/)).toBeVisible();
  });
});
