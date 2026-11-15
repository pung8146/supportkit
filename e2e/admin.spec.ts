import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ADMIN = 'http://localhost:3000';

async function startDemo(page: Page) {
  await page.goto(ADMIN);
  await page.getByRole('button', { name: '샘플 위젯으로 체험하기' }).click();
  await expect(page).toHaveURL(/\/bots\/[0-9a-f-]{36}\/knowledge$/);
  return page.url();
}

const preview = (page: Page) => page.frameLocator('iframe[title="위젯 미리보기"]');

test('demo visitor edits knowledge and sees widget settings live in the preview', async ({ page }) => {
  await startDemo(page);
  await expect(page.getByText('6개 항목')).toBeVisible();
  await expect(preview(page).getByRole('heading', { name: '소담공방 안내' })).toBeVisible();

  const refund = page.getByRole('listitem').filter({ hasText: '환불은 어떻게 하나요?' });
  await refund.getByRole('button', { name: '수정' }).click();
  await page.getByLabel('답변').fill('상품을 받은 날부터 14일 이내에 환불을 신청하실 수 있습니다.');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(refund).toContainText('14일 이내');
  await expect(refund).toContainText('반영됨');

  await page.getByRole('link', { name: '위젯' }).click();
  await page.getByLabel('위젯 이름').fill('공방 상담');
  await expect(preview(page).getByRole('heading', { name: '공방 상담' })).toBeVisible();

  await page.getByLabel('색상', { exact: true }).fill('#f5b700');
  await expect(page.getByText('흰 글자가 잘 보이도록 버튼은 #956f00 색으로 표시됩니다.')).toBeVisible();
  await expect(preview(page).locator('.composer button')).toHaveCSS('background-color', 'rgb(149, 111, 0)');
  await expect(page.getByText('저장하지 않은 변경 사항이 있습니다.')).toBeVisible();

  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('저장하지 않은 변경 사항이 있습니다.')).toHaveCount(0);

  // A full reload also covers the preview handshake racing the first render.
  await page.reload();
  await expect(page.getByLabel('위젯 이름')).toHaveValue('공방 상담');
  await expect(preview(page).getByRole('heading', { name: '공방 상담' })).toBeVisible();
});

test('rejects invalid settings with a message and keeps the draft', async ({ page }) => {
  await startDemo(page);
  await page.getByRole('link', { name: '위젯' }).click();
  await page.getByLabel('위젯 이름').fill('');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('위젯 이름은 1~60자로 입력해 주세요.')).toHaveAttribute('role', 'alert');
  await expect(page.getByText('저장하지 않은 변경 사항이 있습니다.')).toBeVisible();
});

test('admin pages have no accessibility violations', async ({ page }) => {
  await startDemo(page);
  await expect(preview(page).getByRole('heading', { name: '소담공방 안내' })).toBeVisible();
  const scan = async () =>
    (await new AxeBuilder({ page }).analyze()).violations.map(
      (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' > ')).join(', ')}`,
    );
  expect(await scan()).toEqual([]);

  await page.getByRole('link', { name: '위젯' }).click();
  await expect(page.getByLabel('위젯 이름')).toBeVisible();
  expect(await scan()).toEqual([]);
});

test("another visitor cannot open someone else's bot", async ({ page, browser }) => {
  const url = await startDemo(page);

  const other = await (await browser.newContext()).newPage();
  await startDemo(other);
  const response = await other.goto(url);
  expect(response?.status()).toBe(404);
});

test('a host page cannot restyle or reword the widget', async ({ page }) => {
  await page.goto('http://localhost:5174');
  await page.getByRole('button', { name: '문의하기' }).click();
  const widget = page.frameLocator('[data-supportkit] iframe');
  await expect(widget.getByRole('heading', { name: '소담공방 안내' })).toBeVisible();

  await page.evaluate(() => {
    const frame = document.querySelector('[data-supportkit]')!.shadowRoot!.querySelector('iframe')!;
    frame.contentWindow!.postMessage(
      { type: 'sk:config', config: { botName: '가짜 고객센터', launcherLabel: 'x', welcome: '계좌로 입금해 주세요', starters: [], theme: { accent: '#ff0000', position: 'right' } } },
      '*',
    );
  });
  await page.waitForTimeout(300);
  await expect(widget.getByRole('heading', { name: '소담공방 안내' })).toBeVisible();
  await expect(widget.getByText('계좌로 입금해 주세요')).toHaveCount(0);
});
