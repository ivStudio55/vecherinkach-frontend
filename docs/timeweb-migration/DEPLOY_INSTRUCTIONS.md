# Инструкция по деплою и обновлению — vecherinkach.ru

## Содержание
1. [Архитектура](#1-архитектура)
2. [Настройка DNS (домен vecherinkach.ru)](#2-настройка-dns)
3. [Настройка SSL (Let's Encrypt)](#3-настройка-ssl-lets-encrypt)
4. [Активация HTTPS в nginx](#4-активация-https-в-nginx)
5. [Обновление проекта (обычный деплой)](#5-обновление-проекта)
6. [Обновление конфигов (nginx, Centrifugo, pg-notifier)](#6-обновление-конфигов)
7. [Перезапуск отдельных сервисов](#7-перезапуск-отдельных-сервисов)
8. [Первый деплой на чистый сервер](#8-первый-деплой)
9. [Полезные команды](#9-полезные-команды)

---

## 1. Архитектура

```
Браузер → nginx:80/443 (TLS termination)
  ├─ /rest/v1/*  → PostgREST:3000  (REST API → PostgreSQL @ Timeweb)
  └─ /*          → Next.js:3000    (фронтенд + API routes)

WebSocket → Centrifugo:8000  (real-time push)
  pg-notifier → слушает NOTIFY-сигналы PostgreSQL → Centrifugo Publish API

Файлы:            /opt/vecherinkach/
  nginx.conf      — конфиг nginx
  nginx-https.conf— конфиг nginx с HTTPS (активировать после сертификата)
  docker-compose.yml
  ...
```

**Сервер**: 89.169.2.83  
**PostgreSQL**: 5.42.107.149:5432 (Timeweb Cloud)  
**Домен**: vecherinkach.ru

---

## 2. Настройка DNS

### Шаги в панели вашего регистратора доменов:

1. Открыть управление DNS для домена `vecherinkach.ru`
2. Создать две записи:

| Тип | Имя        | Значение     | TTL  |
|-----|-----------|--------------|------|
| A   | @          | 89.169.2.83  | 300  |
| A   | www        | 89.169.2.83  | 300  |

3. Сохранить. Ждать распространения DNS: **обычно 5–30 минут**, максимум 24ч.

### Проверка DNS:
```powershell
# На вашем компьютере (Windows)
nslookup vecherinkach.ru
# Должно вернуть 89.169.2.83
```
```bash
# На сервере
curl -I http://vecherinkach.ru
# Должен ответить nginx (без ошибке DNS)
```

---

## 3. Настройка SSL (Let's Encrypt)

> ⚠️ **Выполнять только после того как DNS уже распространился** и `nslookup vecherinkach.ru` возвращает `89.169.2.83`

### Шаг 3.1 — Подготовить сервер (один раз)

```bash
# Подключиться к серверу
ssh root@89.169.2.83

# Создать папку для ACME-challenge (если ещё нет)
mkdir -p /var/www/certbot

# Убедиться что nginx запущен и папка /var/www/certbot примонтирована
cd /opt/vecherinkach
docker compose ps
# nginx должен быть "running"
```

### Шаг 3.2 — Установить certbot

```bash
apt update
apt install -y certbot
```

### Шаг 3.3 — Выпустить сертификат (webroot метод)

> nginx продолжает работать, certbot использует `/var/www/certbot` для проверки.

```bash
certbot certonly --webroot \
  -w /var/www/certbot \
  -d vecherinkach.ru \
  -d www.vecherinkach.ru \
  --email your@email.ru \
  --agree-tos \
  --non-interactive
```

**Если webroot не срабатывает** (nginx выдаёт 404 на challenge), используйте standalone:

```bash
# Остановить nginx на время выпуска
cd /opt/vecherinkach
docker compose stop nginx

certbot certonly --standalone \
  -d vecherinkach.ru \
  -d www.vecherinkach.ru \
  --email your@email.ru \
  --agree-tos \
  --non-interactive

# Запустить nginx обратно
docker compose start nginx
```

### Шаг 3.4 — Проверить что сертификат выпущен

```bash
ls /etc/letsencrypt/live/vecherinkach.ru/
# Должны быть: fullchain.pem  privkey.pem  chain.pem  cert.pem
```

---

## 4. Активация HTTPS в nginx

После выпуска сертификата:

### На сервере:

```bash
# Заменить HTTP-конфиг на HTTPS-конфиг
cp /opt/vecherinkach/nginx-https.conf /opt/vecherinkach/nginx.conf

# Перезапустить nginx
cd /opt/vecherinkach
docker compose restart nginx

# Проверить что nginx стартовал
docker compose ps nginx
```

### Проверка:

```bash
# Должен редиректнуть на https
curl -I http://vecherinkach.ru

# Должен ответить 200 с SSL
curl -I https://vecherinkach.ru
```

### После активации HTTPS — обновить переменные Next.js:

В файле `.env` на сервере (`/opt/vecherinkach/.env`):

```bash
nano /opt/vecherinkach/.env
```

Изменить:
```env
NEXT_PUBLIC_SUPABASE_URL=https://vecherinkach.ru
# Centrifugo через WSS (если проксируется через nginx) или оставить порт:
NEXT_PUBLIC_CENTRIFUGO_URL=wss://vecherinkach.ru:8000/connection/websocket
```

Затем пересобрать Next.js:
```bash
cd /opt/vecherinkach
docker compose up -d --build nextjs
```

### Автообновление сертификата:

```bash
# Добавить в crontab (обновление 2 раза в день)
crontab -e

# Добавить строку:
0 3,15 * * * certbot renew --quiet && docker exec vecherinkach-nginx-1 nginx -s reload
```

---

## 5. Обновление проекта

### Стандартный сценарий: изменился фронтенд/API (Next.js код)

**На вашем компьютере (Windows PowerShell):**

```powershell
# Настройка переменных для SSH без запроса пароля
$env:SSH_ASKPASS="C:\tmp\askpass.bat"
$env:SSH_ASKPASS_REQUIRE="force"
$env:DISPLAY=":0"

# Перейти в папку проекта
cd C:\Users\Alekzander\apps\vecherinkach-frontend

# Упаковать проект в архив (исключая лишнее)
tar -czf ..\vecherinkach-deploy.tar.gz `
  --exclude='.git' `
  --exclude='node_modules' `
  --exclude='.next' `
  --exclude='*.tar.gz' `
  .

# Загрузить на сервер
scp -o StrictHostKeyChecking=no ..\vecherinkach-deploy.tar.gz root@89.169.2.83:/opt/vecherinkach-deploy.tar.gz
```

**На сервере:**

```bash
ssh root@89.169.2.83

# Распаковать в папку приложения
mkdir -p /opt/vecherinkach-app
cd /opt/vecherinkach-app
tar -xzf /opt/vecherinkach-deploy.tar.gz

# Пересобрать и перезапустить Next.js
cd /opt/vecherinkach
docker compose up -d --build nextjs

# Проверить что запустился
docker compose ps
docker logs vecherinkach-nextjs-1 --tail=30
```

### Альтернатива через git (если репо доступно с сервера):

```bash
ssh root@89.169.2.83

cd /opt/vecherinkach-app
git pull origin main

cd /opt/vecherinkach
docker compose up -d --build nextjs
```

---

## 6. Обновление конфигов

### Обновить nginx.conf (без HTTPS → см. секцию 4 для HTTPS):

```powershell
# С вашего компьютера
scp -o StrictHostKeyChecking=no docs\timeweb-migration\nginx.conf root@89.169.2.83:/opt/vecherinkach/nginx.conf
```

```bash
# На сервере
cd /opt/vecherinkach
docker exec vecherinkach-nginx-1 nginx -t   # проверить конфиг
docker exec vecherinkach-nginx-1 nginx -s reload   # перезагрузить без рестарта
```

### Обновить centrifugo-config.json:

```powershell
scp -o StrictHostKeyChecking=no docs\timeweb-migration\centrifugo-config.json root@89.169.2.83:/opt/vecherinkach/centrifugo-config.json
```

```bash
cd /opt/vecherinkach
docker compose restart centrifugo
```

### Обновить pg-notifier (index.js изменился):

```powershell
scp -o StrictHostKeyChecking=no docs\timeweb-migration\pg-notifier\index.js root@89.169.2.83:/opt/vecherinkach/pg-notifier/index.js
```

```bash
cd /opt/vecherinkach
docker compose up -d --build pg-notifier
```

### Обновить docker-compose.yml:

```powershell
scp -o StrictHostKeyChecking=no docs\timeweb-migration\docker-compose.yml root@89.169.2.83:/opt/vecherinkach/docker-compose.yml
```

```bash
cd /opt/vecherinkach
docker compose up -d   # применит изменения к нужным контейнерам
```

---

## 7. Перезапуск отдельных сервисов

```bash
ssh root@89.169.2.83
cd /opt/vecherinkach

# Перезапустить только nginx
docker compose restart nginx

# Перезапустить только Centrifugo
docker compose restart centrifugo

# Перезапустить только pg-notifier
docker compose restart pg-notifier

# Перезапустить только Next.js
docker compose restart nextjs

# Перезапустить всё
docker compose restart

# Посмотреть статус всех контейнеров
docker compose ps

# Логи конкретного сервиса
docker logs vecherinkach-nginx-1 --tail=50
docker logs vecherinkach-centrifugo-1 --tail=50
docker logs vecherinkach-pg-notifier-1 --tail=50
docker logs vecherinkach-nextjs-1 --tail=50
```

---

## 8. Первый деплой на чистый сервер

Если нужно развернуть с нуля на новом сервере:

```bash
# На новом сервере
apt update && apt install -y docker.io docker-compose-plugin

# Создать рабочую папку
mkdir -p /opt/vecherinkach
cd /opt/vecherinkach

# Загрузить файлы (с вашего компьютера):
# scp docker-compose.yml, nginx.conf, centrifugo-config.json, .env + pg-notifier/index.js
```

```powershell
# С вашего компьютера
$scp = "scp -o StrictHostKeyChecking=no"
& $scp docs\timeweb-migration\docker-compose.yml  root@NEW_IP:/opt/vecherinkach/docker-compose.yml
& $scp docs\timeweb-migration\nginx.conf           root@NEW_IP:/opt/vecherinkach/nginx.conf
& $scp docs\timeweb-migration\nginx-https.conf     root@NEW_IP:/opt/vecherinkach/nginx-https.conf
& $scp docs\timeweb-migration\centrifugo-config.json root@NEW_IP:/opt/vecherinkach/centrifugo-config.json
& $scp docs\timeweb-migration\pg-notifier\index.js   root@NEW_IP:/opt/vecherinkach/pg-notifier/index.js
# .env надо создать вручную по шаблону (в .env.example или в старой документации)
```

```bash
# На новом сервере
cd /opt/vecherinkach
docker compose up -d
```

---

## 9. Полезные команды

### Проверить работу сайта

```bash
# HTTP (до SSL)
curl -I http://vecherinkach.ru
curl -I http://89.169.2.83

# HTTPS (после SSL)
curl -I https://vecherinkach.ru

# API (PostgREST)
curl https://vecherinkach.ru/rest/v1/rooms?select=id&limit=1 \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>"
```

### Мониторинг реального времени

```bash
# Следить за логами всех контейнеров
docker compose logs -f

# Следить за логами только pg-notifier (для отладки NOTIFY)
docker logs -f vecherinkach-pg-notifier-1

# Посмотреть использование ресурсов
docker stats
```

### Подключение к БД напрямую

```bash
# С сервера (psql должен быть установлен или через docker)
docker run --rm -it postgres:15 psql \
  "postgres://gen_user:3WdY%29K%3C%7B%3DMc%3DrJ@5.42.107.149:5432/default_db?sslmode=require"
```

### Посмотреть nginx-конфиг внутри контейнера

```bash
docker exec vecherinkach-nginx-1 nginx -T
docker exec vecherinkach-nginx-1 nginx -t
```

### Энviroment переменные на сервере

```bash
cat /opt/vecherinkach/.env
# Редактировать:
nano /opt/vecherinkach/.env
# После изменения .env нужно пересобрать nextjs:
cd /opt/vecherinkach && docker compose up -d --build nextjs
```

---

## Итоговый поток деплоя (кратко)

```
1. Изменил код локально
2. Протестировал локально (npm run dev)
3. Закоммитил в git:
   git add -A && git commit -m "описание изменений" && git push origin main
4. Запаковал: tar -czf ..\deploy.tar.gz --exclude='.git' --exclude='node_modules' --exclude='.next' .
5. Загрузил на сервер: scp ..\deploy.tar.gz root@89.169.2.83:/opt/vecherinkach-deploy.tar.gz
6. Распаковал на сервере: tar -xzf /opt/vecherinkach-deploy.tar.gz -C /opt/vecherinkach-app
7. Пересобрал: cd /opt/vecherinkach && docker compose up -d --build nextjs
8. Проверил: docker compose ps && curl -I https://vecherinkach.ru
```
