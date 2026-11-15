import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

function database() {
  process.loadEnvFile('apps/admin/.env.local');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

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
  await expect(widget.locator('.reply .answer').last()).toContainText('7일 이내');
  await expect(widget.getByText('근거 · 교환·환불 안내')).toBeVisible();
});

test('stays usable on a page with hostile global CSS', async ({ page }) => {
  await page.goto(HOSTILE);
  await expect(launcher(page)).toBeVisible();
  const box = await launcher(page).boundingBox();
  expect(box?.width).toBeGreaterThan(40);

  await launcher(page).click();
  const widget = await ask(page, '배송 기간이 궁금해요');
  await expect(widget.locator('.reply .answer').last()).toContainText('1~2일');
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

test('replaces an ungrounded answer with the fallback and no sources', async ({ page }) => {
  await openWidget(page, DEMO_SHOP);
  const widget = await ask(page, '__replace__ 환불');
  const reply = widget.locator('.reply').last();
  await expect(reply).toHaveAttribute('data-status', 'done');
  await expect(reply.locator('.answer')).toHaveText('등록된 안내에서 답을 찾지 못했어요. 문의를 남겨 주시면 담당자가 확인해 드릴게요.');
  await expect(reply.locator('.sources')).toHaveCount(0);
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

test('removing a domain blocks tokens that were already issued', async ({ request }) => {
  const db = database();
  const bootstrapUrl = 'http://localhost:3000/api/widget/bootstrap/pk_demo_shop';
  const chatUrl = 'http://localhost:3000/api/widget/chat';
  const headers = { origin: HOSTILE };

  const { token } = await (await request.post(bootstrapUrl, { headers })).json();
  const chat = () => request.post(chatUrl, { data: { message: '배송' }, headers: { authorization: `Bearer ${token}` } });
  expect((await chat()).status()).toBe(200);

  const { data } = await db.from('bots').select('allowed_origins').eq('public_key', 'pk_demo_shop').single();
  const original: string[] = data!.allowed_origins;
  try {
    await db
      .from('bots')
      .update({ allowed_origins: original.filter((origin) => origin !== HOSTILE) })
      .eq('public_key', 'pk_demo_shop');

    expect((await chat()).status()).toBe(401);
    expect((await request.post(bootstrapUrl, { headers })).status()).toBe(403);
  } finally {
    await db.from('bots').update({ allowed_origins: original }).eq('public_key', 'pk_demo_shop');
  }
});

test('chat API rejects a missing or forged token', async ({ request }) => {
  const url = 'http://localhost:3000/api/widget/chat';
  expect((await request.post(url, { data: { message: 'hi' } })).status()).toBe(401);
  const forged = await request.post(url, { data: { message: 'hi' }, headers: { authorization: 'Bearer abc.def' } });
  expect(forged.status()).toBe(401);
});

test('restores the conversation after a reload and starts over on request', async ({ page }) => {
  const widget = await openWidget(page, DEMO_SHOP);
  await widget.getByRole('button', { name: '환불은 며칠 안에 되나요?' }).click();
  await expect(widget.getByText('근거 · 교환·환불 안내')).toBeVisible();

  await page.reload();
  await launcher(page).click();
  await expect(widget.locator('.question')).toHaveText('환불은 며칠 안에 되나요?');
  await expect(widget.locator('.reply .answer').last()).toContainText('7일 이내');
  await expect(widget.getByText('근거 · 교환·환불 안내')).toBeVisible();

  await widget.getByRole('button', { name: '새 대화' }).click();
  await expect(widget.locator('.question')).toHaveCount(0);

  await page.reload();
  await launcher(page).click();
  await expect(widget.getByRole('button', { name: '환불은 며칠 안에 되나요?' })).toBeVisible();
  await expect(widget.locator('.question')).toHaveCount(0);
});

test('takes an inquiry only with consent and stores it without PII in the question', async ({ page }) => {
  await openWidget(page, DEMO_SHOP);
  const widget = await ask(page, '선물 포장 되나요? 제 번호는 010-1111-2222');
  await widget.getByRole('button', { name: '담당자에게 문의 남기기' }).click();

  const form = widget.getByRole('form', { name: '담당자에게 문의 남기기' });
  const contactField = form.getByLabel('연락받을 이메일 또는 전화번호');
  await expect(contactField).toBeFocused();

  await form.getByRole('button', { name: '문의 접수' }).click();
  await expect(form.getByText('연락받을 이메일이나 전화번호를 입력해 주세요.')).toBeVisible();
  await expect(form.getByText('개인정보 수집에 동의해야 접수할 수 있어요.')).toBeVisible();
  await expect(contactField).toHaveAttribute('aria-invalid', 'true');
  await expect(contactField).toBeFocused();

  const contact = `e2e-${Date.now()}@example.com`;
  await contactField.fill(contact);
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: '문의 접수' }).click();
  await expect(widget.getByText('문의가 접수되었어요. 담당자가 확인 후 연락드릴게요.')).toBeVisible();

  const { data } = await database()
    .from('inquiries')
    .select('question, consent_version, conversation_id')
    .eq('contact', contact)
    .single();
  expect(data?.consent_version).toBe('v1');
  expect(data?.conversation_id).not.toBeNull();
  expect(data?.question).toContain('[전화번호]');
  expect(data?.question).not.toContain('010-1111-2222');
});

test('inquiry API rejects a submission without consent', async ({ request }) => {
  const bootstrap = await request.post('http://localhost:3000/api/widget/bootstrap/pk_demo_shop', { headers: { origin: DEMO_SHOP } });
  const { token } = await bootstrap.json();
  const response = await request.post('http://localhost:3000/api/widget/inquiries', {
    headers: { authorization: `Bearer ${token}` },
    data: { question: '포장 되나요?', contact: 'a@b.co', consent: false },
  });
  expect(response.status()).toBe(400);
});

test('has no accessibility violations with the widget and inquiry form open', async ({ page }) => {
  await openWidget(page, DEMO_SHOP);
  const widget = await ask(page, '선물 포장 되나요?');
  await widget.getByRole('button', { name: '담당자에게 문의 남기기' }).click();
  await expect(widget.getByRole('form')).toBeVisible();

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' > ')).join(', ')}`)).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('opens full screen, locks the page behind it, and restores it on close', async ({ page }) => {
    await openWidget(page, DEMO_SHOP);
    const box = await page.locator('[data-supportkit] iframe').boundingBox();
    expect(box).toEqual({ x: 0, y: 0, width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');

    await page.keyboard.press('Escape');
    await expect(launcher(page)).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
  });
});
