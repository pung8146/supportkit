import { isHexColor } from '@supportkit/widget/color';
import type { WidgetConfig } from '@supportkit/widget/protocol';

export type KnowledgeInput = { kind: 'faq' | 'text'; title: string; body: string };

const WILDCARD = /^https:\/\/\*\.((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})$/;

/**
 * Turns what an operator types ("shop.example.com", "https://shop.example.com/") into an origin
 * the allowlist can match, or null. HTTPS only, except localhost for testing.
 */
export function normalizeOrigin(input: string): string | null {
  let value = input.trim().toLowerCase().replace(/\/+$/, '');
  if (!value) return null;
  if (!/^[a-z]+:\/\//.test(value)) value = `https://${value}`;
  if (WILDCARD.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
  // The URL parser accepts '*' in hostnames; only the WILDCARD form above may contain one.
  if (!/^[a-z0-9.-]+$/.test(url.hostname)) return null;
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
  if (!local && !url.hostname.includes('.')) return null;
  return url.origin;
}

export function validateKnowledge(input: KnowledgeInput): string | null {
  const isFaq = input.kind === 'faq';
  if (input.kind !== 'faq' && input.kind !== 'text') return '항목 종류가 올바르지 않습니다.';
  if (!input.title.trim()) return isFaq ? '질문을 입력해 주세요.' : '제목을 입력해 주세요.';
  if (input.title.trim().length > 200) return isFaq ? '질문은 200자 이내로 입력해 주세요.' : '제목은 200자 이내로 입력해 주세요.';
  if (!input.body.trim()) return isFaq ? '답변을 입력해 주세요.' : '내용을 입력해 주세요.';
  if (input.body.trim().length > 4000) return '본문은 4,000자 이내로 입력해 주세요.';
  return null;
}

export function validateSettings(config: WidgetConfig): string | null {
  if (!config.botName.trim() || config.botName.trim().length > 60) return '위젯 이름은 1~60자로 입력해 주세요.';
  if (!config.launcherLabel.trim() || config.launcherLabel.trim().length > 20) return '버튼 문구는 1~20자로 입력해 주세요.';
  if (!config.welcome.trim() || config.welcome.trim().length > 300) return '환영 문구는 1~300자로 입력해 주세요.';
  if (config.starters.length > 3) return '시작 질문은 3개까지 넣을 수 있습니다.';
  if (config.starters.some((starter) => !starter.trim() || starter.trim().length > 60)) return '시작 질문은 1~60자로 입력해 주세요.';
  if (!isHexColor(config.theme.accent)) return '색상은 #1f4d3f 형식으로 입력해 주세요.';
  if (config.theme.position !== 'left' && config.theme.position !== 'right') return '위치가 올바르지 않습니다.';
  return null;
}
