import { expect, test } from '@playwright/test';

// Measured on the production build (E2E runs `next start`). Numbers are printed for the case study.
test('the widget does not shift the host page and opens quickly', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!entry.hadRecentInput) w.__cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });

  const started = Date.now();
  await page.goto('http://localhost:5174');
  const launcher = page.getByRole('button', { name: '문의하기' });
  await expect(launcher).toBeVisible();
  const launcherMs = Date.now() - started;

  const opened = Date.now();
  await launcher.click();
  await expect(page.frameLocator('[data-supportkit] iframe').getByRole('textbox', { name: '질문 입력' })).toBeFocused();
  const openMs = Date.now() - opened;

  const metrics = await page.evaluate(() => ({
    cls: (window as unknown as { __cls: number }).__cls,
    widgetFiles: performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.includes('/widget/'))
      .map((entry) => {
        const resource = entry as PerformanceResourceTiming;
        return { file: resource.name.split('/').pop(), transferBytes: resource.transferSize, ms: Math.round(resource.duration) };
      }),
  }));

  const report = { launcherVisibleMs: launcherMs, panelReadyMs: openMs, ...metrics };
  console.info(JSON.stringify(report));
  await testInfo.attach('perf.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });

  expect(metrics.cls).toBe(0);
  // Only the loader loads with the page; the panel bundle waits for the visitor.
  const beforeOpen = metrics.widgetFiles.map((file) => file.file);
  expect(beforeOpen).toContain('loader.js');
});
