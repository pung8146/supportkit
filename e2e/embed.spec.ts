import { expect, test, type Page } from '@playwright/test';

const DEMO_SHOP = 'http://localhost:5174';
const HOSTILE = 'http://localhost:5175';
const BLOCKED = 'http://localhost:5176';
const EMBED = 'http://localhost:3000/embed/pk_demo_shop';

const launcher = (page: Page) => page.getByRole('button', { name: '문의하기' });
const panel = (page: Page) => page.frameLocator('[data-supportkit] iframe');

async function openWidget(page: Page, url: string) {
  await page.goto(url);
  await launcher(page).click();
  const widget = panel(page);
  await expect(widget.getByRole('textbox', { name: '질문 입력' })).toBeFocused();
  return widget;
}

async function ask(page: Page, text: string) {
  const widget = panel(page);
  await widget.getByRole('textbox', { name: '질문 입력' }).fill(text);
  await widget.getByRole('button', { name: '보내기' }).click();
  return widget;
}

test('answers with a source on a separate-origin plain HTML site', async ({ page }) => {
  const widget = await openWidget(page, DEMO_SHOP);
  await widget.getByRole('button', { name: '환불은 며칠 안에 되나요?' }).click();
  await expect(widget.getByText('7일 이내')).toBeVisible();
  await expect(widget.getByText('근거 · 교환·환불 안내')).toBeVisible();
});

test('stays usable on a page with hostile global CSS', async ({ page }) => {
  await page.goto(HOSTILE);
  await expect(launcher(page)).toBeVisible();
  const box = await launcher(page).boundingBox();
  expect(box?.width).toBeGreaterThan(40);

  await launcher(page).click();
  const widget = await ask(page, '배송 기간이 궁금해요');
  await expect(widget.getByText('1~2일')).toBeVisible();
});

test('does not render on a disallowed origin', async ({ page }) => {
  const warning = page.waitForEvent('console', (message) => message.text().includes('[SupportKit]'));
  await page.goto(BLOCKED);
  await warning;
  await expect(page.locator('[data-supportkit]')).toHaveCount(0);
});

test('bootstrap checks the Origin header on the server', async ({ request }) => {
  const url = 'http://localhost:3000/api/widget/bootstrap/pk_demo_shop';

  const denied = await request.post(url, { headers: { origin: BLOCKED } });
  expect(denied.status()).toBe(403);
  expect(denied.headers()['access-control-allow-origin']).toBeUndefined();

  const noOrigin = await request.post(url);
  expect(noOrigin.status()).toBe(403);

  const allowed = await request.post(url, { headers: { origin: DEMO_SHOP } });
  expect(allowed.status()).toBe(200);
  expect(allowed.headers()['access-control-allow-origin']).toBe(DEMO_SHOP);
});

test('browser refuses to frame the embed on a disallowed origin', async ({ page }) => {
  await page.goto(BLOCKED);
  await page.evaluate((src) => {
    const frame = document.createElement('iframe');
    frame.src = src;
    document.documentElement.append(frame);
  }, EMBED);
  await expect.poll(() => page.frames().at(-1)?.url()).toContain('chrome-error');
});

test('keeps the question and retries after a provider failure', async ({ page }) => {
  let chatRequests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/widget/chat')) chatRequests += 1;
  });

  await openWidget(page, DEMO_SHOP);
  const widget = await ask(page, '__fail__ 환불');
  const retry = widget.getByRole('button', { name: '다시 시도' });
  await expect(retry).toBeEnabled();
  await expect(widget.locator('.question')).toHaveText('__fail__ 환불');

  await retry.click();
  await expect.poll(() => chatRequests).toBe(2);
  await expect(retry).toBeEnabled();
});

test('stops a streaming answer', async ({ page }) => {
  await openWidget(page, DEMO_SHOP);
  const widget = await ask(page, '__slow__ 환불');
  await widget.getByRole('button', { name: '중단' }).click();
  await expect(widget.getByText('답변을 중단했습니다.')).toBeVisible();
  await expect(widget.getByRole('button', { name: '보내기' })).toBeVisible();
});

test('Escape closes the panel and returns focus to the launcher', async ({ page }) => {
  await openWidget(page, DEMO_SHOP);
  await page.keyboard.press('Escape');
  await expect(launcher(page)).toBeFocused();
  await expect(page.locator('[data-supportkit] iframe')).toBeHidden();
});

test('chat API rejects a missing or forged token', async ({ request }) => {
  const url = 'http://localhost:3000/api/widget/chat';
  expect((await request.post(url, { data: { message: 'hi' } })).status()).toBe(401);
  const forged = await request.post(url, { data: { message: 'hi' }, headers: { authorization: 'Bearer abc.def' } });
  expect(forged.status()).toBe(401);
});
