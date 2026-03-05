# План миграции Вечеринкача с Supabase/Vercel/GitHub на Яндекс.Облако и РФ-альтернативы

> Документ подготовлен: март 2026  
> Угроза: блокировка Роскомнадзором (аналогично блокировке Supabase в 2024–2025)  
> Цель: обеспечить полную доступность приложения для пользователей из РФ

---

## 1. АНАЛИЗ ТЕКУЩЕЙ АРХИТЕКТУРЫ

### 1.1 Стек технологий

| Компонент | Текущий сервис | Расположение |
|---|---|---|
| Frontend | Next.js 16 на Vercel | США/Европа |
| База данных | Supabase PostgreSQL | США (AWS us-east-1) |
| Realtime | Supabase Realtime (WebSocket + postgres_changes) | США |
| Auth | Кастомные JWT, подписанные SUPABASE_JWT_SECRET на сервере | — |
| Storage | **Не используется** (активы в /public/) | — |
| Аналитика | @vercel/analytics | США |
| Репозиторий | GitHub | США |
| CI/CD | Vercel (авто-деплой из GitHub) | США |

### 1.2 Схема базы данных

#### Основные игры (Вечеринкач — классик):
- `rooms` — комнаты с конечным автоматом состояний (status: waiting → running → round2-running → ... → finished)
- `players` — участники (id, room_id, name, total_points)
- `questions` — вопросы с вариантами ответов
- `answers` — ответы 1-го раунда
- `round2_answers`, `round3_answers`, `round4_answers`, `round5_answers` — ответы по раундам
- `game_results` — итоги

#### Пошути-кач (Jokester):
- `jokester_rooms`, `jokester_players`, `jokester_duels`
- `jokester_answers`, `jokester_votes`, `jokester_category_votes`, `jokester_used_questions`

#### Креативач:
- `creativach_rooms`, `creativach_players`, `creativach_answers`, `creativach_votes`

#### Рисункач (Drawinkach):
- `draw_rooms`, `draw_players`, `draw_chains`, `draw_steps`, `draw_votes`, `draw_words`

#### UNO:
- `uno_rooms`, `uno_players`, `uno_events`, `irregular_verbs`

#### Всего: ~25 таблиц, PostgreSQL расширения: `uuid-ossp` (gen_random_uuid), временны́е зоны UTC

### 1.3 Как работает Realtime

```
Клиент (браузер)
  → supabase.channel(`room-sync-${roomId}`)
    → postgres_changes: UPDATE на таблицу rooms WHERE id = roomId
    → broadcast: ping/pong для замера latency
  → При отказе: автоматический fallback на HTTP polling каждые 2 секунды
```

Realtime — **критически важен** для синхронизации состояния игры между хостом и игроками.

### 1.4 Как работает Auth

Схема без Supabase Auth:
1. Клиент обращается на `/api/room-token` (Next.js API route на Vercel/сервере)
2. Сервер проверяет комнату и игрока через Supabase Admin Client
3. Сервер подписывает JWT с `SUPABASE_JWT_SECRET` (роль `authenticated`, `room_id`, `player_id`)
4. Клиент использует этот токен в заголовках запросов к Supabase
5. RLS-политики в PostgreSQL принимают токен и разрешают операции

**Важно**: RLS политики в коде — `USING (true) WITH CHECK (true)` — фактически **открытые** (MVP-статус). Auth реально не защищает данные.

### 1.5 API Routes (Next.js)

- `GET/POST /api/room-token` — выдача JWT для доступа к комнате
- `GET /api/health` — healthcheck
- `GET/POST /api/admin/*` — административные операции (требуют `adminAuth.server`)
- `GET /api/audio/*`, `/api/jingle` — аудио-контент
- `POST /api/round3/*`, `/api/round4/*` — логика конкретных раундов

---

## 2. КРИТИЧЕСКИЕ ТОЧКИ ОТКАЗА ПРИ БЛОКИРОВКЕ

| Компонент | Что сломается | Приоритет |
|---|---|---|
| **Supabase DB** (supabase.co) | Все операции с данными: создание комнат, подключение игроков, сохранение ответов | 🔴 Критично |
| **Supabase Realtime** (realtime.supabase.co) | Синхронизация состояния игры в реальном времени | 🔴 Критично |
| **Vercel** (vercel.com) | Недоступен фронтенд и все API routes | 🔴 Критично |
| **Vercel Analytics** | Только аналитика — не влияет на игру | 🟡 Некритично |
| **GitHub** (github.com) | Нет новых деплоев (но код уже задеплоен) | 🟠 Важно |

> **Примечание**: Supabase Storage **не используется** в проекте (все статические файлы в `/public/`). Supabase Auth также **не используется** (только кастомный JWT). Это упрощает миграцию.

---

## 3. УРОВЕНЬ 1 — МИНИМАЛЬНЫЙ ПЕРЕНОС: ТОЛЬКО БД

**Цель**: перенести PostgreSQL с Supabase на Yandex Managed Service for PostgreSQL.  
**Что сохраняем**: Vercel, GitHub, Supabase Realtime (временно).  
**Ожидаемое время**: 3–5 дней.

### 3.1 Целевая архитектура

```
Пользователь (РФ)
  → Vercel CDN (риск блокировки сохраняется)
    → Next.js App
      → /api/* → Yandex Managed PostgreSQL (РФ)
      → supabase.channel() → Supabase Realtime (риск остаётся)
      ↕ (fallback polling → Yandex Managed PG)
```

### 3.2 Шаги миграции

#### Шаг 1: Создание Yandex Managed PostgreSQL

```bash
# Через Yandex Cloud CLI (yc)
yc managed-postgresql cluster create \
  --name vecherinkach-prod \
  --environment production \
  --postgresql-version 16 \
  --resource-preset s2.micro \
  --disk-size 20 \
  --disk-type network-ssd \
  --user name=vecherinkach,password=<STRONG_PASSWORD> \
  --database name=vecherinkach,owner=vecherinkach \
  --security-group-ids <SG_ID> \
  --network-name default \
  --zone-id ru-central1-a
```

**Рекомендуемые параметры:**
- PostgreSQL 16 (≥ версия Supabase)
- `s2.micro` (2 vCPU, 8 GB RAM) → ~3 000 ₽/мес
- Disk: 20 GB SSD, с возможностью авторасширения
- Резервные копии: 7 дней, ежедневно
- Зона: `ru-central1-a` (Москва)

#### Шаг 2: Проверка расширений

Supabase использует `pgcrypto` (для `gen_random_uuid()`). В Yandex Managed PG:

```sql
-- Выполнить после подключения к новой БД
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- gen_random_uuid() работает через pgcrypto в PostgreSQL 16 (встроен)
-- uuid-ossp — альтернатива, тоже доступна:
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

> **Важно**: В Supabase `gen_random_uuid()` — это функция из `pgcrypto`. В PostgreSQL 16+ она встроена в ядро и расширение не нужно.

#### Шаг 3: Экспорт схемы и данных из Supabase

```bash
# Установить суpabase CLI и pg_dump
# Получить строку подключения из Supabase Dashboard > Settings > Database

# Только схема (без данных)
pg_dump \
  "postgresql://postgres:<PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres" \
  --schema-only \
  --no-owner \
  --no-privileges \
  -f schema.sql

# Только данные (для продакшн-данных)
pg_dump \
  "postgresql://postgres:<PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres" \
  --data-only \
  --no-owner \
  -f data.sql

# Или полный дамп
pg_dump \
  "postgresql://postgres:<PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres" \
  --no-owner \
  --no-privileges \
  -f full_dump.sql
```

#### Шаг 4: Очистка дампа от Supabase-специфичных объектов

Supabase добавляет схемы `auth`, `storage`, `realtime`, `vault`. Их нужно исключить:

```bash
# Экспорт только схемы public
pg_dump \
  "postgresql://postgres:<PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres" \
  --schema=public \
  --no-owner \
  --no-privileges \
  -f schema_public.sql
```

Убедиться, что в дампе **нет**:
- `ALTER PUBLICATION supabase_realtime ...` — это нужно удалить (realtime настраивается отдельно)
- Ссылок на `auth.uid()`, `auth.role()` — у вас их нет (RLS политики `USING (true)`)
- Функций из схем `auth`, `storage`, `vault`

#### Шаг 5: Импорт в Yandex Managed PostgreSQL

```bash
# Подключиться к Yandex PG (через SSL, обязательно)
export PG_YC="postgresql://vecherinkach:<PASSWORD>@<CLUSTER_HOST>:6432/vecherinkach?sslmode=require"

psql "$PG_YC" -f schema_public.sql
psql "$PG_YC" -f data.sql

# Проверка
psql "$PG_YC" -c "\dt public.*"
```

#### Шаг 6: Настройка PgBouncer

Yandex Managed PG включает встроенный PgBouncer на порту **6432** (вместо прямого PostgreSQL 5432). Используем его:
- Режим: `transaction` (по умолчанию) — подходит для большинства запросов
- **Осторожно**: `SET` команды, advisory locks и prepared statements не работают в transaction mode. В коде проекта их нет, поэтому всё ок.

```
NEXT_PUBLIC_SUPABASE_URL=https://<ваш_домен_или_ip>
DATABASE_URL=postgresql://vecherinkach:<PASSWORD>@<CLUSTER_HOST>:6432/vecherinkach?sslmode=require
```

#### Шаг 7: Замена Supabase клиента на прямой API

Вместо `@supabase/supabase-js` нужно перейти на собственный тонкий слой, который будет работать напрямую с PostgreSQL.

**Вариант А: PostgREST self-hosted** (минимальные изменения в коде)

PostgREST — это отдельный сервер, который предоставляет REST API поверх PostgreSQL (его использует Supabase внутри). Запустить на Yandex Cloud VM или Container Registry:

```yaml
# docker-compose.yml на Yandex Cloud VM
version: '3'
services:
  postgrest:
    image: postgrest/postgrest:v12.2.0
    environment:
      PGRST_DB_URI: "postgres://vecherinkach:<PASSWORD>@<YC_HOST>:5432/vecherinkach"
      PGRST_DB_SCHEMA: "public"
      PGRST_DB_ANON_ROLE: "anon"
      PGRST_JWT_SECRET: "<ВАШ_JWT_SECRET>"  # тот же, что SUPABASE_JWT_SECRET
      PGRST_SERVER_PORT: "3000"
    ports:
      - "3000:3000"
    restart: unless-stopped
```

При этом подходе в `supabase.ts` нужно изменить только `SUPABASE_URL` на адрес вашего PostgREST-сервера — больше **никаких изменений в коде**.

**Вариант Б: Замена на Drizzle ORM / Prisma** (рекомендуется для долгосрочной перспективы)  
Полная замена всех `supabase.from('table').select(...)` на типизированные ORM-запросы. Трудозатрат больше (~3–5 дней), но нет зависимости от промежуточного слоя.

#### Шаг 8: Изменения в коде (Вариант А — PostgREST)

```typescript
// src/lib/supabase.ts — ЕДИНСТВЕННОЕ изменение
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Было: https://vqrspimfhimntbrwxvvi.supabase.co
// Стало: https://postgrest.ваш-домен.ru (или http://IP:3000 для внутренней сети)
```

```bash
# Переменные окружения Vercel / новый хостинг
NEXT_PUBLIC_SUPABASE_URL=https://api.vecherinkach.ru
NEXT_PUBLIC_SUPABASE_ANON_KEY=<тот же anon JWT>
SUPABASE_SERVICE_ROLE_KEY=<тот же service_role JWT или новый>
SUPABASE_JWT_SECRET=<тот же секрет>
```

Генерация новых JWT ключей (если используете собственный PostgREST):
```bash
# Генерация JWT_SECRET
openssl rand -base64 32

# Генерация anon-токена (роль anon, без expiry)
node -e "
const jwt = require('jsonwebtoken');
const secret = 'ВАШ_СЕКРЕТ';
console.log(jwt.sign({ role: 'anon', iss: 'postgrest' }, secret));
"
```

#### Шаг 9: Настройка сети и безопасности (Yandex VPC)

```bash
# Создать security group
yc vpc security-group create \
  --name vecherinkach-pg-sg \
  --rule direction=ingress,port=6432,protocol=tcp,cidr=0.0.0.0/0 \
  --rule direction=ingress,port=5432,protocol=tcp,cidr=10.0.0.0/8

# Для PostgREST VM:
yc vpc security-group create \
  --name vecherinkach-api-sg \
  --rule direction=ingress,port=443,protocol=tcp,cidr=0.0.0.0/0 \
  --rule direction=egress,protocol=any,cidr=0.0.0.0/0
```

> **Рекомендация**: PostgreSQL не открывать наружу (порт 5432). PgBouncer (6432) открыть только для IP серверов приложения или через Yandex VPN.

### 3.3 Риски Уровня 1

| Риск | Вероятность | Митигация |
|---|---|---|
| Vercel всё ещё заблокирован | Высокая (если РКН заблокирует Vercel) | Переходить к Уровню 3 |
| Realtime недоступен | Высокая | Есть fallback polling (2 сек), игра продолжает работать |
| Разрыв соединения с PostgREST | Средняя | Настроить health checks и автоперезапуск |
| Миграция данных с потерями | Низкая | Делать в maintenance window, проверить foreign keys |

### 3.4 Стоимость Уровня 1 (Yandex Cloud)

| Сервис | Конфигурация | Стоимость/мес |
|---|---|---|
| Yandex Managed PostgreSQL | s2.micro (2 vCPU, 8 GB), 20 GB SSD | ~3 500 ₽ |
| Yandex Compute (VM для PostgREST) | 2 vCPU, 2 GB RAM | ~800 ₽ |
| Yandex VPC (трафик) | ~10 GB/мес | ~100 ₽ |
| **Итого** | | **~4 400 ₽/мес** |

---

## 4. УРОВЕНЬ 2 — ПЕРЕНОС БД + REALTIME

**Цель**: полностью устранить зависимость от Supabase (DB + Realtime). Vercel и GitHub остаются.  
**Что сохраняем**: Vercel, GitHub.  
**Ожидаемое время**: 1–2 недели (после Уровня 1).

### 4.1 Целевая архитектура

```
Пользователь (РФ)
  → Vercel CDN (риск блокировки остаётся)
    → Next.js App
      → REST запросы → PostgREST → Yandex Managed PostgreSQL (РФ)
      → WebSocket → собственный Realtime-сервер (Yandex Cloud VM, РФ)
```

### 4.2 Замена Supabase Realtime

#### Вариант А: Centrifugo (рекомендуется)

[Centrifugo](https://centrifugal.dev/) — российский open-source WebSocket-сервер (автор — Александр Емелин), активно развивается. Поддерживает:
- Каналы с историей
- Подписки с фильтрацией
- Интеграцию с PostgreSQL через `LISTEN/NOTIFY` или polling
- Встроенный JWT auth

```yaml
# centrifugo/config.json
{
  "token_hmac_secret_key": "<ВАШ_JWT_SECRET>",
  "api_key": "<API_KEY>",
  "admin": false,
  "port": 8000,
  "grpc_port": 10000,
  "allowed_origins": ["https://vecherinkach.ru"],
  "channel_namespace": [
    {
      "name": "room",
      "subscribe_for_publish": true,
      "history_size": 100,
      "history_ttl": "300s"
    }
  ]
}
```

```yaml
# docker-compose на Yandex VM
services:
  centrifugo:
    image: centrifugo/centrifugo:v5
    volumes:
      - ./config.json:/centrifugo/config.json
    command: centrifugo -c config.json
    ports:
      - "8000:8000"
    restart: unless-stopped
    
  # PostgreSQL→Centrifugo bridge
  pg-notifier:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - ./notifier:/app
    command: node index.js
    environment:
      PG_URL: "postgresql://vecherinkach:<PASSWORD>@<YC_HOST>:5432/vecherinkach"
      CENTRIFUGO_API_URL: "http://centrifugo:8000/api"
      CENTRIFUGO_API_KEY: "<API_KEY>"
    restart: unless-stopped
```

**Bridge (pg-notifier/index.js)** — слушает изменения через `LISTEN/NOTIFY`:

```javascript
// notifier/index.js
const { Client } = require('pg');
const fetch = require('node-fetch');

const pgClient = new Client({ connectionString: process.env.PG_URL });

async function publishRoomUpdate(roomId, roomData) {
  await fetch(`${process.env.CENTRIFUGO_API_URL}/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.CENTRIFUGO_API_KEY,
    },
    body: JSON.stringify({
      channel: `room:${roomId}`,
      data: roomData,
    }),
  });
}

async function main() {
  await pgClient.connect();
  
  // Настраиваем PostgreSQL TRIGGER для NOTIFY
  await pgClient.query(`
    CREATE OR REPLACE FUNCTION notify_room_update()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM pg_notify('room_updates', row_to_json(NEW)::text);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    DROP TRIGGER IF EXISTS room_update_trigger ON rooms;
    CREATE TRIGGER room_update_trigger
    AFTER UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION notify_room_update();
  `);

  await pgClient.query('LISTEN room_updates');
  
  pgClient.on('notification', async (msg) => {
    const room = JSON.parse(msg.payload);
    await publishRoomUpdate(room.id, room);
  });

  console.log('PG notifier started, listening for room updates...');
}

main().catch(console.error);
```

#### Изменения в useRoomSync.ts при переходе на Centrifugo

```typescript
// src/lib/centrifugo.ts — НОВЫЙ ФАЙЛ
import Centrifuge from 'centrifuge';

let client: Centrifuge | null = null;

export function getCentrifugoClient(token: string) {
  if (!client) {
    client = new Centrifuge(
      process.env.NEXT_PUBLIC_CENTRIFUGO_URL!,  // wss://ws.vecherinkach.ru/connection/websocket
      { token }
    );
    client.connect();
  }
  return client;
}
```

```typescript
// src/shared/logic/useRoomSync.ts — замена канала Supabase на Centrifugo
// Было (строки ~135-165):
const roomChannel = supabase
  .channel(`room-sync-${roomId}-${channelId}`)
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
    (payload) => throttledApply(payload.new)
  )
  .subscribe();

// Стало:
const centrifuge = getCentrifugoClient(token);
const sub = centrifuge.newSubscription(`room:${roomId}`);
sub.on('publication', (ctx) => {
  if (!mounted) return;
  throttledApply(ctx.data as RoomSyncRow);
});
sub.subscribe();
```

> **Важно**: Механизм fallback polling уже реализован в `useRoomSync.ts` — он автоматически включается при недоступности WebSocket. Этот код **менять не нужно**.

#### Вариант Б: Server-Sent Events (SSE) — более простой

Если WebSocket кажется сложным, можно использовать SSE (однонаправленный поток от сервера к клиенту):

```typescript
// app/api/room-events/route.ts — НОВЫЙ API ROUTE
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db'; // прямое подключение к PG

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get('roomId');
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      
      // Поллинг каждые 1.5 секунды (или PostgreSQL LISTEN)
      const interval = setInterval(async () => {
        const room = await sql`SELECT * FROM rooms WHERE id = ${roomId}`;
        if (room[0]) send(room[0]);
      }, 1500);
      
      req.signal.addEventListener('abort', () => clearInterval(interval));
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### 4.3 Auth (Token endpoint)

Текущий `/api/room-token` уже работает независимо от Supabase — он только:
1. Проверяет комнату через Admin Client → заменить на прямой SQL запрос
2. Подписывает JWT с тем же секретом → **изменений не требует**

```typescript
// app/api/room-token/route.ts — заменить Admin Client на прямой SQL
// Было:
const admin = getSupabaseAdminClient();
const { data: room } = await admin.from('rooms').select('id, code').eq('id', roomId).single();

// Стало (с Drizzle/postgres.js):
import { sql } from '@/lib/db';
const [room] = await sql`SELECT id, code FROM rooms WHERE id = ${roomId}`;
```

### 4.4 Риски Уровня 2

| Риск | Митигация |
|---|---|
| Centrifugo VM упал | Fallback polling (уже реализован), + настроить авторестарт |
| Задержка LISTEN/NOTIFY | Добавить polling как второй слой (уже есть в useRoomSync) |
| Vercel всё ещё заблокирован | Переходить к Уровню 3 |

### 4.5 Стоимость Уровня 2

| Сервис | Конфигурация | Стоимость/мес |
|---|---|---|
| Yandex Managed PostgreSQL | s2.micro | ~3 500 ₽ |
| Yandex Compute (PostgREST + Centrifugo) | 2 vCPU, 4 GB RAM | ~1 500 ₽ |
| Yandex Application Load Balancer | — | ~500 ₽ |
| Yandex Certificate Manager (TLS) | Бесплатно для Let's Encrypt | 0 ₽ |
| **Итого** | | **~5 500 ₽/мес** |

---

## 5. УРОВЕНЬ 3 — ПОЛНАЯ НЕЗАВИСИМОСТЬ ОТ ЗАПАДНЫХ СЕРВИСОВ

**Цель**: нулевая зависимость от сервисов, доступных для блокировки РКН.  
**Что убираем**: Vercel, GitHub, Supabase (всё).

### 5.1 Хостинг фронтенда Next.js

#### Вариант А: Yandex Serverless Containers (рекомендуется)

```bash
# Сборка Docker-образа Next.js
cat > Dockerfile << 'EOF'
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
EOF

# next.config.ts — добавить
output: 'standalone',

# Push в Yandex Container Registry
docker build -t cr.yandex/<REGISTRY_ID>/vecherinkach:latest .
docker push cr.yandex/<REGISTRY_ID>/vecherinkach:latest

# Создать Serverless Container
yc serverless container create \
  --name vecherinkach \
  --memory 512MB \
  --cores 1 \
  --concurrency 10 \
  --execution-timeout 30s \
  --image cr.yandex/<REGISTRY_ID>/vecherinkach:latest
```

#### Вариант Б: Yandex Compute (VM с pm2/nginx)

```nginx
# nginx.conf
server {
    listen 443 ssl;
    server_name vecherinkach.ru;
    
    ssl_certificate /etc/letsencrypt/live/vecherinkach.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vecherinkach.ru/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    location /ws/ {
        proxy_pass http://localhost:8000;  # Centrifugo
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
    }
}
```

#### Вариант В: Timeweb Cloud Apps (PaaS)

Российский PaaS, поддерживает деплой из Docker-образа или GitHub:
- Простая настройка, панель управления на русском
- ~1 000–2 000 ₽/мес за контейнер с достаточными ресурсами
- Риск: менее надёжная инфраструктура по сравнению с Yandex Cloud

#### Вариант Г: VK Cloud (Mail.ru Cloud Solutions)

- Kubernetes кластер или Container Apps
- Надёжная РФ-инфраструктура, ФСТЭК-аттестация
- ~2 000–5 000 ₽/мес

### 5.2 Репозиторий

#### Вариант А: GitLab self-hosted на Yandex VM

```bash
# Yandex Compute VM: 2 vCPU, 4 GB RAM, 50 GB disk
docker run -d \
  --hostname gitlab.vecherinkach.ru \
  --publish 443:443 --publish 80:80 --publish 22:22 \
  --name gitlab \
  --restart unless-stopped \
  --volume /srv/gitlab/config:/etc/gitlab \
  --volume /srv/gitlab/logs:/var/log/gitlab \
  --volume /srv/gitlab/data:/var/opt/gitlab \
  gitlab/gitlab-ce:latest
```

Стоимость: VM ~1 500 ₽/мес + диск

#### Вариант Б: Gitea (лёгкий, ~100 MB RAM)

```bash
docker run -d \
  --name gitea \
  -p 3001:3000 -p 22:22 \
  -v /srv/gitea:/data \
  -e USER_UID=1000 -e USER_GID=1000 \
  gitea/gitea:latest
```

Стоимость: делится с другими контейнерами на VM

#### Вариант В: Yandex Cloud source repositories (ограниченный функционал)

Базовое git-хранилище от Яндекса, без CI/CD. Бесплатно.

### 5.3 CI/CD

#### Git push → автодеплой (без GitLab CI)

```bash
# На сервере: настроить bare git repo + post-receive hook
git init --bare /srv/repos/vecherinkach.git
cat > /srv/repos/vecherinkach.git/hooks/post-receive << 'EOF'
#!/bin/bash
cd /var/www/vecherinkach
git --work-tree=/var/www/vecherinkach --git-dir=/srv/repos/vecherinkach.git checkout -f
npm ci --production
npm run build
pm2 restart vecherinkach
EOF
chmod +x /srv/repos/vecherinkach.git/hooks/post-receive
```

#### GitLab CI/CD

```yaml
# .gitlab-ci.yml
stages:
  - build
  - deploy

build:
  stage: build
  image: docker:24
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA

deploy:
  stage: deploy
  script:
    - yc serverless container revision deploy
        --container-name vecherinkach
        --image $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
        --token $YC_TOKEN
  only:
    - main
```

#### Yandex Cloud Deploy

```bash
yc deploy application create \
  --name vecherinkach \
  --image cr.yandex/<REGISTRY>/<IMAGE>:latest \
  --environment production
```

### 5.4 Мониторинг

```yaml
# Yandex Monitoring — добавить в docker-compose
services:
  node-exporter:
    image: prom/node-exporter
    ports: ["9100:9100"]
    
  yc-monitoring-agent:
    image: cr.yandex/yc/unified-agent:latest
    environment:
      FOLDER_ID: <YC_FOLDER_ID>
    volumes:
      - ./monitoring-config.yaml:/etc/yandex/unified_agent/config.yaml
```

Алерты: настроить в Yandex Monitoring на:
- HTTP 5xx ответы > 1% за 5 минут
- Latency p95 > 2 секунды
- PostgreSQL connections > 80%
- VM CPU > 80%

### 5.5 DNS и домены

Использовать **Yandex Cloud DNS** или **reg.ru DNS**:
```
vecherinkach.ru  → A → <IP Yandex VM или Serverless Container endpoint>
api.vecherinkach.ru → A → <IP PostgREST VM>
ws.vecherinkach.ru → A → <IP Centrifugo VM>
```

TLS-сертификаты: Yandex Certificate Manager (Let's Encrypt) — бесплатно.

### 5.6 Риски Уровня 3

| Риск | Митигация |
|---|---|
| Yandex Cloud недоступен | Использовать несколько зон доступности (ru-central1-a, -b, -d), Geo-балансировщик |
| Let's Encrypt заблокирован | Yandex Certificate Manager запрашивает сертификаты через собственную инфраструктуру |
| DDoS атаки | Yandex DDoS Protection (входит в тариф), Yandex Cloud WAF |
| Сложность эксплуатации | Нанять DevOps или использовать managed-сервисы вместо self-hosted |

### 5.7 Стоимость Уровня 3 (полный переход)

| Сервис | Конфигурация | Стоимость/мес |
|---|---|---|
| Yandex Managed PostgreSQL | s2.micro (2 vCPU, 8 GB), 20 GB SSD | ~3 500 ₽ |
| Yandex Compute (API + Realtime) | 2 vCPU, 4 GB, 2 VM | ~3 000 ₽ |
| Yandex Serverless Containers (Frontend) | по запросам | ~500–1 500 ₽ |
| Yandex Application Load Balancer | — | ~500 ₽ |
| Yandex Object Storage (статика CDN) | 10 GB | ~50 ₽ |
| Yandex Certificate Manager | Let's Encrypt | 0 ₽ |
| Yandex Cloud DNS | — | ~50 ₽ |
| Yandex Monitoring | до 200 метрик бесплатно | 0 ₽ |
| **Итого** | | **~7 600–9 000 ₽/мес** |

**Сравнение с текущими расходами**: Vercel Pro ~$20/мес (~1 800 ₽) + Supabase Pro ~$25/мес (~2 300 ₽) = ~4 100 ₽/мес. Яндекс выйдет дороже (~+2x), но с полной независимостью.

---

## 6. ПЛАН ДЕЙСТВИЙ

### 6.1 Первые 7 дней — Экстренная защита

**Цель**: подготовить почву, не меняя продакшн.

| День | Задача | Ответственный |
|---|---|---|
| 1 | Создать аккаунт Yandex Cloud, активировать грант (до 10 000 ₽ для новых пользователей) | DevOps |
| 1 | Зарегистрировать домен в российской зоне (.ru) через reg.ru / nic.ru — если нет | — |
| 2 | Создать Yandex Managed PostgreSQL кластер (по шагам из Уровня 1) | DevOps |
| 2–3 | Сделать полный дамп существующей Supabase БД (`pg_dump`) | DevOps |
| 3 | Поднять PostgREST на Yandex VM, настроить TLS через Yandex Certificate Manager | DevOps |
| 3–4 | Импортировать схему и данные в Yandex PG, проверить корректность | DevOps |
| 4–5 | В тестовом окружении заменить `NEXT_PUBLIC_SUPABASE_URL` на PostgREST endpoint, проверить все основные сценарии | Frontend Dev |
| 5–6 | Smoke-тест всех игр (Вечеринкач, Jokester, Creativach, Draw, UNO) в тестовом окружении | QA |
| 7 | Переключить `NEXT_PUBLIC_SUPABASE_URL` в Vercel на новый endpoint. Supabase остаётся как fallback. | DevOps |

**Результат через 7 дней**: БД в РФ, Realtime временно на Supabase (работает через fallback polling), фронтенд на Vercel.

---

### 6.2 Дни 8–30 — Perенос Realtime, стабилизация

| Период | Задача |
|---|---|
| 8–10 | Поднять Centrifugo на отдельном Yandex VM, настроить PG→Centrifugo bridge |
| 10–13 | Написать адаптер `useRoomSync` для Centrifugo (или SSE), тестирование в staging |
| 13–17 | Заменить в коде импорт канала Supabase на Centrifugo/SSE, тестировать нагрузку |
| 17–20 | Перевести `/api/room-token` с Admin Client на прямой SQL (убрать зависимость от `supabaseAdmin.server.ts`) |
| 20–25 | Деплой обновлённого фронтенда на Vercel с новым Realtime |
| 25–28 | Нагрузочное тестирование: 50+ одновременных игроков |
| 28–30 | Настроить мониторинг Yandex Monitoring, алерты в Telegram |

**Результат через 30 дней**: нет зависимости от Supabase. Единственная зависимость от запада — Vercel и GitHub.

---

### 6.3 Дни 31–90 — Полная независимость

| Период | Задача |
|---|---|
| 31–40 | Настроить GitLab self-hosted (или Gitea) на Yandex VM, перенести репозиторий |
| 40–45 | Добавить `output: 'standalone'` в `next.config.ts`, создать Dockerfile для Next.js |
| 45–55 | Поднять фронтенд в Yandex Serverless Containers, настроить CI/CD через GitLab |
| 55–60 | DNS: перенести домен на Yandex Cloud DNS, настроить Geo-балансировку |
| 60–70 | Удалить `@vercel/analytics`, добавить собственную аналитику (Plausible self-hosted или Yandex Metrika) |
| 70–80 | Убрать зависимость от `@supabase/supabase-js` (заменить на PostgREST клиент или готовый HTTP-клиент) |
| 80–90 | Финальная проверка: отключить Vercel и Supabase, убедиться что всё работает |

**Результат через 90 дней**: 100% РФ-инфраструктура, нулевая зависимость от западных сервисов.

---

## 7. ЧЕКЛИСТ: ЧТО ПРОВЕРИТЬ В КОДЕ ПЕРЕД МИГРАЦИЕЙ

### 7.1 Зависимости от Supabase URL

```bash
# Найти все хардкоденные ссылки на Supabase
grep -r "supabase.co" src/ app/ --include="*.ts" --include="*.tsx"
grep -r "SUPABASE_URL\|SUPABASE_ANON_KEY\|SUPABASE_SERVICE_ROLE\|SUPABASE_JWT_SECRET" . \
  --include="*.ts" --include="*.tsx" --include="*.env*"
```

**Ожидаемые файлы** (которые нужно будет обновить):
- [src/lib/supabase.ts](../src/lib/supabase.ts) — URL клиента
- [src/lib/supabaseAdmin.server.ts](../src/lib/supabaseAdmin.server.ts) — URL admin клиента
- [app/api/room-token/route.ts](../app/api/room-token/route.ts) — использует admin для проверки комнаты
- [next.config.ts](../next.config.ts) — `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 7.2 Использование Supabase Realtime channels

```bash
grep -r "\.channel\(\|supabase_realtime\|postgres_changes\|\.subscribe(" src/ app/ \
  --include="*.ts" --include="*.tsx"
```

**Ожидаемые файлы**:
- [src/shared/logic/useRoomSync.ts](../src/shared/logic/useRoomSync.ts) — основной realtime хук
- Проверить дополнительные realtime-подписки в играх (jokester, creativach, draw, uno)

### 7.3 Использование Supabase Auth

```bash
grep -r "supabase.auth\|signIn\|signOut\|getSession\|getUser" src/ app/ \
  --include="*.ts" --include="*.tsx"
```

**Ожидается**: Auth не используется (только `/api/room-token` с кастомным JWT).  
Если найдено — требует отдельного плана.

### 7.4 Проверка Supabase-специфичных функций в SQL

```bash
# В схеме нет ссылок на auth.uid(), auth.email()
grep -r "auth\." docs/ --include="*.sql"
# Ожидается: только в supabase-fix-round2-rls.sql
```

**Файлы с RLS** — проверить, что политики `USING (true)` не зависят от `auth.uid()`:
- [docs/supabase-init-full.sql](supabase-init-full.sql) ✅ `USING (true)`
- [docs/supabase-jokester.sql](supabase-jokester.sql) ✅ `USING (true)`
- [docs/supabase-creativach.sql](supabase-creativach.sql) ✅ `USING (true)`
- [docs/supabase-fix-round2-rls.sql](supabase-fix-round2-rls.sql) ⚠️ требует проверки

### 7.5 Переменные окружения

Полный список переменных для замены/создания:

```env
# Текущие (Supabase)
NEXT_PUBLIC_SUPABASE_URL=https://vqrspimfhimntbrwxvvi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<jwt>
SUPABASE_SERVICE_ROLE_KEY=<jwt>
SUPABASE_JWT_SECRET=<secret>

# Новые (после миграции)
NEXT_PUBLIC_SUPABASE_URL=https://api.vecherinkach.ru     # PostgREST endpoint
NEXT_PUBLIC_SUPABASE_ANON_KEY=<новый anon JWT>            # генерировать с тем же или новым секретом
SUPABASE_SERVICE_ROLE_KEY=<новый service JWT>
SUPABASE_JWT_SECRET=<тот же секрет>                       # можно не менять

# Дополнительные (Уровень 2)
NEXT_PUBLIC_CENTRIFUGO_URL=wss://ws.vecherinkach.ru/connection/websocket
CENTRIFUGO_API_KEY=<api key>
DATABASE_URL=postgresql://vecherinkach:<PASSWORD>@<YC_HOST>:6432/vecherinkach?sslmode=require
```

### 7.6 Wrangler (Cloudflare Workers)

В `devDependencies` есть `wrangler`. Проверить, используется ли:
```bash
grep -r "wrangler\|cloudflare\|workers" . --include="*.ts" --include="*.json" \
  --exclude-dir=node_modules
```
Если `wrangler` использован только для dev proxy — можно оставить или удалить.

### 7.7 Vercel Analytics

```bash
grep -r "@vercel/analytics\|vercel/analytics" src/ app/ --include="*.tsx" --include="*.ts"
```

При переходе к Уровню 3 — заменить на Яндекс.Метрику или Plausible self-hosted.

---

## 8. ЧЕКЛИСТ: ЧТО ТЕСТИРОВАТЬ ПОСЛЕ МИГРАЦИИ

### 8.1 Функциональные тесты

- [ ] Создать новую комнату через `/host` — проверить, что код комнаты генерируется
- [ ] Подключиться к комнате через `/join` — проверить, что игрок отображается у хоста
- [ ] Запустить Раунд 1 — проверить появление вопросов у всех игроков
- [ ] Отправить ответы в Раунд 1 — проверить начисление очков
- [ ] Проверить переходы: Round 2 → Round 3 → Round 4 → Round 5 → Final Results
- [ ] Запустить игру Jokester с 4+ игроками — проверить дуэли, голосование
- [ ] Запустить Creativach — проверить раунды и голосование
- [ ] Запустить Drawinkach — проверить рисование и передачу цепочек
- [ ] Запустить UNO — проверить очерёдность карт
- [ ] Проверить режим зрителя (spectator)

### 8.2 Тест Realtime

- [ ] Открыть host и 3 клиентских устройства (или вкладки)
- [ ] Смена состояния у хоста — все клиенты обновились в течение < 2 секунд
- [ ] Отключить WebSocket в DevTools → проверить fallback polling
- [ ] Восстановить соединение → проверить переключение обратно на Realtime
- [ ] Проверить latency индикатор (должен быть < 500ms в РФ)

### 8.3 Тест API

```bash
# Healthcheck
curl https://vecherinkach.ru/api/health

# Создание токена комнаты
curl -X POST https://vecherinkach.ru/api/room-token \
  -H "Content-Type: application/json" \
  -d '{"roomId": "<UUID>", "roomCode": "1234"}'

# PostgREST прямой запрос
curl https://api.vecherinkach.ru/rooms?select=id,code&limit=5 \
  -H "Authorization: Bearer <anon_token>"
```

### 8.4 Тест из РФ-сети

- [ ] Проверить доступность сайта через российский ISP (не VPN)
- [ ] Проверить через сервис [check-host.net](https://check-host.net) из нескольких РФ-локаций
- [ ] Проверить WebSocket соединение через [websocketking.com](https://websocketking.com) из РФ
- [ ] Проверить скорость загрузки через [tools.pingdom.com](https://tools.pingdom.com) с сервером в Москве

### 8.5 Нагрузочный тест

```bash
# k6 — нагрузочный тест (15 одновременных комнат с 5 игроками)
k6 run --vus 75 --duration 5m load-test.js
```

Метрики для проверки:
- p95 latency HTTP запросов < 500ms
- p95 latency WebSocket < 300ms
- Нет ошибок PostgreSQL под нагрузкой

---

## 9. СЕРВИСЫ, КОТОРЫЕ МОЖНО ОСТАВИТЬ НА ЗАПАДЕ

Следующие сервисы **не блокируются РКН** и не критичны для работы приложения:

| Сервис | Причина безопасности |
|---|---|
| **GitHub** (репозиторий) | Разработка не нужна пользователям в РФ; CI/CD → деплой на РФ-серверы |
| **npm registry** | Используется только в процессе сборки (не в runtime) |
| **Sentry / LogRocket** (если будет добавлен) | Мониторинг ошибок работает как outbound запросы с сервера |
| **Cloudflare DNS** (только DNS резолюция) | Cloudflare сам по себе редко блокируется, используется только для DNS |
| **Let's Encrypt** | Яндекс Certificate Manager запрашивает сертификаты через собственную инфраструктуру |
| **Font CDN** (Google Fonts) | Можно заменить на `@fontsource/bangers` (уже используется в проекте — шрифт уже в npm) |
| **Docker Hub** | Используется только в CI/CD pipeline |

### Что НЕЛЬЗЯ оставлять на западе для РФ-доступности:

- ❌ Vercel (хостинг фронтенда) — потенциальный объект блокировки
- ❌ Supabase (БД и Realtime) — уже был заблокирован
- ❌ AWS/GCP/Azure напрямую — теоретически могут быть заблокированы
- ❌ Cloudflare Workers/Pages — Cloudflare блокировался частично в 2022

---

## 10. АРХИТЕКТУРНАЯ ДИАГРАММА ЦЕЛЕВОГО СОСТОЯНИЯ (Уровень 3)

```
                    ┌────────────────────────────────────────────────────────┐
                    │                  Yandex Cloud (ru-central1)             │
                    │                                                          │
   Пользователь     │  ┌──────────────────────────────────────────────────┐  │
   (РФ, браузер) ───┼─►│  Yandex Application Load Balancer (HTTPS/WSS)   │  │
                    │  └──────────┬───────────────────┬────────────────┬──┘  │
                    │             │                   │                │      │
                    │  ┌──────────▼─────────┐ ┌──────▼───────┐ ┌─────▼────┐ │
                    │  │  Serverless         │ │  PostgREST   │ │Centrifugo│ │
                    │  │  Container          │ │  REST API    │ │WebSocket │ │
                    │  │  (Next.js)          │ │  :3000       │ │:8000     │ │
                    │  └──────────┬──────────┘ └──────┬───────┘ └─────┬────┘ │
                    │             │                   │                │      │
                    │  ┌──────────▼───────────────────▼────────────────▼────┐ │
                    │  │         Yandex Managed PostgreSQL 16               │ │
                    │  │         (PgBouncer :6432 → PG :5432)               │ │
                    │  │         HA: multi-zone, автобэкап 7 дней           │ │
                    │  └──────────────────────────────────────────────────── ┘ │
                    │                                                          │
                    │  ┌────────────────────────────────────────────────────┐ │
                    │  │  Yandex Object Storage (статические ассеты, CDN)   │ │
                    │  └────────────────────────────────────────────────────┘ │
                    └────────────────────────────────────────────────────────┘
                    
  Разработчик ──► GitLab self-hosted (Yandex VM) ──► GitLab CI ──► Yandex Container Registry
```

---

## 11. ИТОГОВАЯ МАТРИЦА РИСКОВ

| Уровень | Устраняет | Оставляет риск | Сложность | Стоимость |
|---|---|---|---|---|
| **0 (текущий)** | — | Supabase, Vercel, GitHub | — | ~4 100 ₽/мес |
| **1 (БД в РФ)** | Supabase DB | Vercel, Supabase Realtime | ⭐⭐ | ~4 400 ₽/мес |
| **2 (БД + Realtime)** | Supabase (всё) | Vercel, GitHub | ⭐⭐⭐ | ~5 500 ₽/мес |
| **3 (полная независимость)** | Всё западное | — | ⭐⭐⭐⭐⭐ | ~8 000 ₽/мес |

---

## 12. КОМАНДЫ ДЛЯ БЫСТРОГО СТАРТА

```bash
# 1. Установить Yandex Cloud CLI
curl https://storage.yandexcloud.net/yandexcloud-yc/install.sh | bash
yc init

# 2. Получить список доступных кластеров PG
yc managed-postgresql cluster list

# 3. Экспорт данных из Supabase
pg_dump "$(cat .env.local | grep SUPABASE_URL | cut -d= -f2 | sed 's/https:\/\//postgresql:\/\/postgres:PASSWORD@db./' | sed 's/\.supabase\.co/:5432\/postgres/')" \
  --schema=public --no-owner --no-privileges -f backup_$(date +%Y%m%d).sql

# 4. Проверка подключения к Yandex PG
psql "postgresql://vecherinkach:<PASSWORD>@<HOST>:6432/vecherinkach?sslmode=require" -c "SELECT version();"

# 5. Запуск PostgREST локально для теста
docker run --rm \
  -e PGRST_DB_URI="postgresql://vecherinkach:<PASSWORD>@<HOST>:6432/vecherinkach?sslmode=require" \
  -e PGRST_DB_SCHEMA=public \
  -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET=<YOUR_JWT_SECRET> \
  -p 3000:3000 \
  postgrest/postgrest:v12.2.0
```

---

*Документ подготовлен на основе анализа исходного кода проекта vecherinkach-frontend. Актуален для состояния кода на март 2026.*
