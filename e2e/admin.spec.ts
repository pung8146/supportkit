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

  await page.getByRole('link', { name: '설치' }).click();
  await expect(page.getByRole('heading', { name: '설치', level: 1 })).toBeVisible();
  expect(await scan()).toEqual([]);

  await page.getByRole('link', { name: '문의', exact: true }).click();
  await page.getByRole('link', { name: '전체 대화' }).click();
  await expect(page.getByRole('heading', { name: '문의', level: 1 })).toBeVisible();
  expect(await scan()).toEqual([]);
});

test('inbox: an unanswered preview question becomes an inquiry, gets handled, and turns into a FAQ', async ({ page }) => {
  const knowledgeUrl = await startDemo(page);
  const widget = preview(page);
  await widget.getByRole('textbox', { name: '질문 입력' }).fill('선물 포장 되나요?');
  await widget.getByRole('button', { name: '보내기' }).click();
  await widget.getByRole('button', { name: '담당자에게 문의 남기기' }).click();
  await widget.getByLabel('연락받을 이메일 또는 전화번호').fill('buyer@example.com');
  await widget.getByRole('checkbox').check();
  await widget.getByRole('button', { name: '문의 접수' }).click();
  await expect(widget.getByText('문의가 접수되었어요.', { exact: false })).toBeVisible();

  await page.getByRole('link', { name: '문의', exact: true }).click();
  await expect(page.getByText('확인할 문의 1건')).toBeVisible();
  await page.getByRole('link', { name: /선물 포장 되나요\?/ }).click();
  await expect(page.getByText('buyer@example.com')).toBeVisible();
  await expect(page.getByText('등록된 안내에서 답을 찾지 못해 안내 문구로 응답했습니다.', { exact: false })).toBeVisible();

  await page.getByRole('radio', { name: '완료' }).check();
  await page.getByLabel('메모').fill('포장 가능하다고 전화로 안내함');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('연락처는', { exact: false })).toBeVisible();
  await expect(page.getByText('확인할 문의가 없습니다.')).toBeVisible();

  await page.getByRole('link', { name: '답하지 못한 대화' }).click();
  await page.getByRole('link', { name: /선물 포장 되나요\?/ }).click();
  await expect(page.getByText('미리보기', { exact: false }).first()).toBeVisible();
  await page.getByRole('link', { name: '이 질문으로 FAQ 추가' }).click();
  await expect(page).toHaveURL(new RegExp(`${knowledgeUrl}\\?draft=`));
  await expect(page.getByRole('textbox', { name: '질문' })).toHaveValue('선물 포장 되나요?');
  await page.getByLabel('답변').fill('선물 포장은 2,000원에 해 드립니다.');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('7개 항목')).toBeVisible();
});

test('inbox: deleting a conversation keeps its inquiry', async ({ page }) => {
  await startDemo(page);
  const widget = preview(page);
  await widget.getByRole('textbox', { name: '질문 입력' }).fill('매장 주소가 어디예요?');
  await widget.getByRole('button', { name: '보내기' }).click();
  await widget.getByRole('button', { name: '담당자에게 문의 남기기' }).click();
  await widget.getByLabel('연락받을 이메일 또는 전화번호').fill('010-2222-3333');
  await widget.getByRole('checkbox').check();
  await widget.getByRole('button', { name: '문의 접수' }).click();
  await expect(widget.getByText('문의가 접수되었어요.', { exact: false })).toBeVisible();

  await page.getByRole('link', { name: '문의', exact: true }).click();
  await page.getByRole('link', { name: '전체 대화' }).click();
  await page.getByRole('link', { name: /매장 주소가 어디예요\?/ }).click();
  await page.getByRole('button', { name: '대화 삭제' }).click();
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(page.getByText('아직 대화가 없습니다.', { exact: false })).toBeVisible();

  await page.getByRole('link', { name: '문의', exact: true }).first().click();
  await page.getByRole('link', { name: /매장 주소가 어디예요\?/ }).click();
  await expect(page.getByText('010-2222-3333')).toBeVisible();
  await expect(page.getByText('연결된 대화가 삭제되어 문의 내용만 남아 있습니다.')).toBeVisible();
});

test('install tab: snippet, locked demo domains, and retention', async ({ page }) => {
  await startDemo(page);
  await page.getByRole('link', { name: '설치' }).click();
  await expect(page.locator('pre code').first()).toContainText(/data-bot="pk_[0-9a-f]{32}"/);
  await expect(page.getByText('체험용 위젯은 외부 사이트에 설치할 수 없습니다.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('도메인')).toHaveCount(0);
  await expect(page.getByText('아직 설치가 감지되지 않았습니다.', { exact: false })).toBeVisible();

  await page.getByRole('radio', { name: '30일' }).check();
  await page.waitForLoadState('networkidle');
  await page.reload();
  await expect(page.getByRole('radio', { name: '30일' })).toBeChecked();
});

test('install detection records where the widget loaded and where it was refused', async ({ page }) => {
  const { createClient } = await import('@supabase/supabase-js');
  process.loadEnvFile('apps/admin/.env.local');
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  // The throttle skips rewrites within five minutes; clear it so the test is repeatable.
  await db.from('bots').update({ last_seen_at: null, last_blocked_at: null }).eq('public_key', 'pk_demo_shop');

  await page.goto('http://localhost:5174');
  await expect(page.getByRole('button', { name: '문의하기' })).toBeVisible();
  const blocked = page.waitForEvent('console', (message) => message.text().includes('[SupportKit]'));
  await page.goto('http://localhost:5176');
  await blocked;

  const { data } = await db.from('bots').select('last_seen_origin, last_blocked_origin').eq('public_key', 'pk_demo_shop').single();
  expect(data).toEqual({ last_seen_origin: 'http://localhost:5174', last_blocked_origin: 'http://localhost:5176' });
});

async function serviceDb() {
  const { createClient } = await import('@supabase/supabase-js');
  process.loadEnvFile('apps/admin/.env.local');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const botIdOf = (url: string) => /\/bots\/([0-9a-f-]{36})\//.exec(url)![1]!;

test('a bot over its monthly limit tells the visitor and offers an inquiry', async ({ page }) => {
  const url = await startDemo(page);
  await (await serviceDb()).from('bots').update({ monthly_limit: 1 }).eq('id', botIdOf(url));

  const widget = preview(page);
  await widget.getByRole('button', { name: '환불은 며칠 안에 되나요?' }).click();
  await expect(widget.locator('.reply').last()).toHaveAttribute('data-status', 'done');

  await widget.getByRole('textbox', { name: '질문 입력' }).fill('배송은 얼마나 걸리나요?');
  await widget.getByRole('button', { name: '보내기' }).click();
  await expect(widget.locator('.reply .answer').last()).toContainText('이번 달 상담 가능 횟수를 모두 사용했어요.');
  await expect(widget.getByRole('button', { name: '다시 시도' })).toHaveCount(0);
  await expect(widget.getByRole('button', { name: '담당자에게 문의 남기기' })).toBeVisible();
});

test('an expired demo can no longer be opened', async ({ page }) => {
  const url = await startDemo(page);
  await (await serviceDb()).from('bots').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', botIdOf(url));
  const response = await page.goto(url);
  expect(response?.status()).toBe(404);
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
