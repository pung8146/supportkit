-- Local demo bot. Ports match the demo shop and the allowed E2E host.
insert into public.bots (id, public_key, name, launcher_label, welcome, starters, theme, allowed_origins)
values (
  '00000000-0000-4000-8000-000000000001',
  'pk_demo_shop',
  '소담공방 안내',
  '문의하기',
  '안녕하세요. 배송, 교환, 환불에 대해 안내해 드릴게요.',
  array['환불은 며칠 안에 되나요?', '배송은 얼마나 걸리나요?'],
  '{"accent": "#1f4d3f", "position": "right"}',
  array['http://localhost:5174', 'http://localhost:5175']
);
