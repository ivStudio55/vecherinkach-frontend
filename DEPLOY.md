# Инструкция по деплою — vecherinkach-frontend

## Сервер

| Параметр | Значение |
|---|---|
| IP | `89.169.2.83` |
| Исходники | `/opt/vecherinkach-app/` |
| Docker Compose | `/opt/vecherinkach/` |
| Контейнер | `nextjs` |

---

## Полный деплой (после изменений кода)

Это **единственный правильный способ** задеплоить изменения. Всегда использовать оба шага.

### Шаг 1 — загрузить файлы на сервер

```bash
node upload_files.js
```

Скрипт загружает по SFTP все файлы из массива `FILES` в `upload_files.js`.

### Шаг 2 — пересобрать Docker-контейнер

```bash
node deploy_ssh.js "cd /opt/vecherinkach && docker compose build --no-cache nextjs && docker compose up -d nextjs"
```

Дождаться `Exit code: 0` и строки `Container vecherinkach-nextjs-1 Started`.

---

## Добавить новый файл в деплой

Если ты изменил файл, которого **нет** в `upload_files.js`, добавь его в массив `FILES`:

```js
// upload_files.js
{ local: 'путь/к/файлу.tsx', remote: '/opt/vecherinkach-app/путь/к/файлу.tsx' }
```

После этого — стандартный деплой (шаг 1 + шаг 2).

---

## Быстрый рестарт (без rebuild)

> ⚠️ Не использовать после изменений кода — изменения не попадут в контейнер.
> Только для рестарта без изменений (например, зависший контейнер).

```bash
node deploy_ssh.js "cd /opt/vecherinkach && docker compose restart nextjs"
```

---

## Проверить логи

```bash
node deploy_ssh.js "cd /opt/vecherinkach && docker compose logs nextjs --tail=50"
```

---

## Проверить статус контейнеров

```bash
node deploy_ssh.js
```

Без аргументов выводит `docker compose ps` и последние 30 строк логов.

---

## SQL-миграции

SQL-файлы хранятся в `docs/`. Применять через:

```bash
node run_migration.js docs/имя_файла.sql
```

---

## Частые ошибки

| Проблема | Решение |
|---|---|
| Изменения не применились | Убедись, что файл добавлен в `upload_files.js`, и выполни оба шага |
| PostgREST не видит новые колонки | `node deploy_ssh.js "cd /opt/vecherinkach && docker compose restart vecherinkach-postgrest-1"` |
| Контейнер не стартует | Проверь логи: `node deploy_ssh.js "cd /opt/vecherinkach && docker compose logs nextjs --tail=100"` |
