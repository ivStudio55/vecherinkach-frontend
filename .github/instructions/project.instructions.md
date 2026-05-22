---
description: "Use when working on this project: adding features, fixing bugs, editing UI, deploying changes. Covers tech stack, file structure, deployment workflow, coding conventions for vecherinkach-frontend."
applyTo: "**"
---

# Vecherinkach Frontend — Project Instructions

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19
- **Styling**: Tailwind CSS v4 (no config file — use utility classes directly)
- **Database / Realtime**: Supabase (client in `src/lib/supabase.ts`, admin in `src/lib/supabaseAdmin.server.ts`)
- **Realtime alternative**: Centrifuge WebSocket (`src/lib/useRoomSync.ts`)
- **Language**: TypeScript everywhere

## Project Structure

```
app/                    # Next.js App Router pages
  survivach/            # Survivach game (main active game)
    host/[code]/        # TV/Host screen
    room/[code]/        # Player screen
    spectator/[code]/   # Spectator screen
  creativach/           # Creative game
  draw/                 # Drawing game
  jokester/             # Jokester game
  uno/                  # UNO game
  admin/                # Admin panel
  api/                  # API routes
src/
  lib/                  # Shared logic, Supabase clients, game state
    survivach/          # Survivach-specific logic
  components/           # Shared UI components
docs/                   # SQL migration files for Supabase
public/
  questions/            # JSON question packs
```

## Deployment Workflow

### Full deploy (после изменений кода):
1. Загрузить файлы на сервер: `node upload_files.js`
2. Пересобрать Docker-контейнер: `node deploy_ssh.js "cd /opt/vecherinkach && docker compose build --no-cache nextjs && docker compose up -d nextjs"`

### Быстрый деплой (только рестарт без rebuild — не рекомендуется после изменений):
```
node deploy_ssh.js "cd /opt/vecherinkach && docker compose restart nextjs"
```

### Проверить логи сервера:
```
node deploy_ssh.js "cd /opt/vecherinkach && docker compose logs nextjs --tail=50"
```

### Git перед деплоем:
```
git add <files>
git commit -m "<message>"
git push origin main
```

### Список файлов, которые `upload_files.js` загружает:
- `app/survivach/page.tsx`
- `app/survivach/host/[code]/page.tsx`
- `app/survivach/room/[code]/page.tsx`
- `src/lib/survivach/audio.ts`
- `app/globals.css`

Если нужно добавить новые файлы в список — редактировать массив `FILES` в `upload_files.js`.

## Server Info

- Host: `89.169.2.83`
- App dir on server: `/opt/vecherinkach-app/` (исходники)
- Docker compose dir: `/opt/vecherinkach/`
- Container name: `nextjs`

## Coding Conventions

### Tailwind CSS
- Используй Tailwind v4 utility-first подход. Без `@apply` — напрямую классы в JSX.
- TV-экран (host) рассчитан на разрешение ~1920×1080. Используй `text-xl`, `text-2xl`, `p-4`, `gap-4` для читаемости на большом экране.
- Для плотных сеток игроков используй `grid grid-cols-4`, для вариантов ответов — `grid grid-cols-2`.
- Горизонтальное разбиение секций: `flex flex-row`, вертикальное — `flex flex-col`.
- `min-h-0` обязателен на flex-детях, которые должны скроллиться или иметь `overflow-hidden`.

### Supabase
- Клиентский код: `src/lib/supabase.ts` — используй `createClient()`.
- Серверный/admin код: `src/lib/supabaseAdmin.server.ts` — только в `api/` роутах или `server actions`.
- Realtime подписки: `src/lib/useRoomSync.ts` через Centrifuge.

### Game State
- Состояния игры передаются через Supabase Realtime или Centrifuge.
- Основные фазы survivach: `waiting`, `round_playing`, `round_results`, `game_over`.
- Host-страница (`app/survivach/host/[code]/page.tsx`) — большой switch по `gameState.phase`.

### File Naming
- Страницы: `page.tsx` (Next.js convention)
- Серверная логика: `*.server.ts`
- Клиентские компоненты: `'use client'` директива вверху файла

## Common Patterns

### Добавить новый файл в деплой
Добавь запись в массив `FILES` в `upload_files.js`:
```js
{ local: 'path/to/file.tsx', remote: '/opt/vecherinkach-app/path/to/file.tsx' }
```

### Проверить статус контейнеров
```
node deploy_ssh.js
```
(без аргументов — выводит `docker compose ps` и последние 30 строк логов)

### SQL миграции
SQL-файлы для Supabase хранятся в `docs/`. Применять вручную через Supabase Studio или `run_migration.js`.
