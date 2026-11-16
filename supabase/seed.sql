-- Local demo bot. Ports match the demo shop and the allowed E2E host.
-- monthly_limit is high locally because every E2E run chats with this bot; set it per deployment.
insert into public.bots (id, public_key, name, launcher_label, welcome, starters, theme, allowed_origins, monthly_limit)
values (
  '00000000-0000-4000-8000-000000000001',
  'pk_demo_shop',
  '소담공방 안내',
  '문의하기',
  '안녕하세요. 배송, 교환, 환불에 대해 안내해 드릴게요.',
  array['환불은 며칠 안에 되나요?', '배송비는 얼마인가요?'],
  '{"accent": "#1f4d3f", "position": "right"}',
  array['http://localhost:5174', 'http://localhost:5175'],
  1000000
);

-- Same text as the demo shop's policy section, so visitors can check every answer.
insert into public.knowledge_items (bot_id, kind, title, body) values
  ('00000000-0000-4000-8000-000000000001', 'faq', '배송은 얼마나 걸리나요?',
   '평일 오후 2시 이전 주문은 당일 출고되며, 보통 1~2일 안에 도착합니다. 주말과 공휴일에는 출고하지 않습니다.'),
  ('00000000-0000-4000-8000-000000000001', 'faq', '배송비는 얼마인가요?',
   '배송비는 3,000원이며, 5만원 이상 주문하시면 무료로 배송해 드립니다. 제주와 도서산간 지역은 3,000원이 추가됩니다.'),
  ('00000000-0000-4000-8000-000000000001', 'faq', '환불은 어떻게 하나요?',
   '상품을 받은 날부터 7일 이내에 환불을 신청하실 수 있습니다. 사용하지 않은 상품만 환불할 수 있으며, 단순 변심일 때 왕복 배송비 6,000원은 고객님이 부담합니다.'),
  ('00000000-0000-4000-8000-000000000001', 'faq', '파손된 상품을 받았어요.',
   '상품을 받은 날부터 3일 이내에 파손 부위 사진과 함께 문의를 남겨 주세요. 확인 후 같은 상품으로 교환해 드리며, 배송비는 공방이 부담합니다.'),
  ('00000000-0000-4000-8000-000000000001', 'faq', '주문 제작 상품은 언제 받을 수 있나요?',
   '옹기 화병은 주문 후 제작하며, 결제일로부터 영업일 기준 10일 안에 출고됩니다. 주문 제작 상품은 단순 변심으로 환불할 수 없습니다.'),
  ('00000000-0000-4000-8000-000000000001', 'faq', '고객센터 운영 시간이 어떻게 되나요?',
   '문의 답변은 평일 오전 10시부터 오후 5시까지 드립니다. 점심시간은 낮 12시부터 1시까지입니다.');
