# Deploy Triage — 2026-06-19

Цель: перед деплоем не смешивать готовые изменения, большой runtime-рефакторинг и локальные диагностические артефакты.

## Деплоить сейчас

Это узкий безопасный набор под срочный фикс публичной activity-ленты:

- `app/page.tsx`
- `app/api/activity/route.ts`

Смысл:

- главная больше не рендерит публичную activity-панель;
- `/api/activity` больше не раздает пользовательские ответы, вопросы и рисунки.

## Ручной ревью перед любым более широким деплоем

Это уже не "шум", а реальные runtime/API изменения. Их нельзя тащить в прод пакетом без отдельной проверки:

- `app/api/health/route.ts`
- `app/api/jokester/packs/route.ts`
- `app/api/packs/route.ts`
- `app/api/packs/room/[roomId]/route.ts`
- `app/api/panel/answers/route.ts`
- `app/api/panel/jokester-packs/route.ts`
- `app/api/panel/packs/route.ts`
- `app/api/panel/prices/route.ts`
- `app/api/panel/promo/route.ts`
- `app/api/panel/room-action/route.ts`
- `app/api/panel/room-detail/route.ts`
- `app/api/panel/rooms/route.ts`
- `app/api/panel/round4-categories/route.ts`
- `app/api/panel/stats/route.ts`
- `app/api/panel/streams/route.ts`
- `app/api/payment/create/route.ts`
- `app/api/pricing-packs/route.ts`
- `app/api/promo/validate/route.ts`
- `app/api/room-token/route.ts`
- `app/api/round4-categories/route.ts`
- `app/api/streams/route.ts`
- `app/api/survivach/create/route.ts`
- `app/ctrl-8f2q9z/login/page.tsx`
- `app/ctrl-8f2q9z/page.tsx`
- `app/draw/page.tsx`
- `app/survivach/host/[code]/page.tsx`
- `app/survivach/page.tsx`
- `app/survivach/room/[code]/page.tsx`
- `app/uno/page.tsx`
- `src/lib/db.server.ts`
- `src/lib/jokester/api.ts`
- `src/lib/survivach/api.ts`
- `src/lib/survivach/audio.ts`
- `src/lib/survivach/gameModes.ts`
- `src/lib/survivach/types.ts`
- `src/lib/panel/config.ts`
- `src/lib/payments/pricing.ts`
- `src/lib/server/api.ts`
- `upload_files.js`

Причины:

- здесь смешаны серверные API, админка, платежи, realtime, healthcheck и крупные UI-изменения;
- diff слишком широкий для безопасного "одним деплоем";
- часть файлов выглядит как инфраструктурный/абстракционный рефакторинг, а не точечный фикс.

## Не деплоить

Это локальные диагностические или временные артефакты. Они не должны участвовать в прод-выкладке:

- `.vscode/`
- `_live_test.html`
- `live.html`
- `original_panel.txt`
- `check_col.js`
- `check_col.txt`
- `check_form.js`
- `check_rooms.js`
- `check_states.js`
- `col2.txt`
- `col2b.txt`
- `dump_col2.js`
- `dump_col2b.js`
- `extract_form.js`
- `fix_data.js`
- `fix_dom.js`
- `fix_dom2.js`
- `fix_dom_safe3.js`
- `fix_models.js`
- `fix_party_games.js`
- `fix_syntax.js`
- `fix_types.js`
- `swap_swap.js`
- `test_live.js`
- `test_live2.js`
- `tmp.js`

## Отдельно от кода

- `docs/supabase-add-bet-option.sql` — не включать в обычный frontend deploy; применять как отдельную SQL-миграцию.
- `DEPLOY.md` — документация; можно коммитить отдельно от runtime-изменений.

## Практическое правило

Если нужен срочный прод сейчас, ограничивать деплой только activity-фиксами.

Минимальный набор:

- `app/page.tsx`
- `app/api/activity/route.ts`

Все остальное — через отдельный проход ревью и изоляцию по подсистемам.
