// pg-notifier/index.js
// ================================================================
// PG → Centrifugo Bridge
// Слушает PostgreSQL LISTEN/NOTIFY и публикует события в Centrifugo
// ================================================================

const { Client } = require('pg');
const https = require('https');
const http = require('http');

const PG_URL = process.env.PG_URL;
const CENTRIFUGO_API_URL = process.env.CENTRIFUGO_API_URL || 'http://centrifugo:8000/api';
const CENTRIFUGO_API_KEY = process.env.CENTRIFUGO_API_KEY;

if (!PG_URL) throw new Error('PG_URL is required');
if (!CENTRIFUGO_API_KEY) throw new Error('CENTRIFUGO_API_KEY is required');

// ----------------------------------------------------------------
// POST запрос в Centrifugo API
// ----------------------------------------------------------------
async function centrifugoPublish(channel, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      method: 'publish',
      params: { channel, data }
    });

    // Use the batch /api endpoint (not /api/publish) with {method, params} format
    const url = new URL(CENTRIFUGO_API_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-API-Key': CENTRIFUGO_API_KEY,
      },
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const parsed = JSON.parse(responseBody || '{}');
          if (parsed.error) {
            reject(new Error(`Centrifugo error ${parsed.error.code}: ${parsed.error.message}`));
          } else {
            resolve(parsed);
          }
        } else {
          reject(new Error(`Centrifugo API error ${res.statusCode}: ${responseBody}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ----------------------------------------------------------------
// Маппинг: таблица → имя канала в Centrifugo
// ----------------------------------------------------------------
function getChannel(notification) {
  const { table, room_id } = notification;

  // У каждой игры свой канал по room_id
  const tableChannelMap = {
    'rooms': `room:${room_id}`,
    'jokester_rooms': `jokester:${room_id}`,
    'creativach_rooms': `creativach:${room_id}`,
    'draw_rooms': `draw:${room_id}`,
    'uno_rooms': `uno:${room_id}`,
    // Players
    'players': `room:${room_id}`,
    'jokester_players': `jokester:${room_id}`,
    'creativach_players': `creativach:${room_id}`,
    'draw_players': `draw:${room_id}`,
    'uno_players': `uno:${room_id}`,
    // Jokester game data
    'jokester_duels': `jokester:${room_id}`,
    'jokester_category_votes': `jokester:${room_id}`,
    // Answers / Votes
    'jokester_answers': `jokester:${room_id}`,
    'jokester_votes': `jokester:${room_id}`,
    'creativach_answers': `creativach:${room_id}`,
    'creativach_votes': `creativach:${room_id}`,
    'round3_answers': `room:${room_id}`,
    'round3_votes': `room:${room_id}`,
    // Раунды 4 и 5 — отдельный канал чтобы не конфликтовать с room:{id}
    'round4_answers': `answers:${room_id}`,
    'round5_answers': `answers:${room_id}`,
    // Draw
    'draw_steps': `draw:${room_id}`,
  };

  return tableChannelMap[table] || null;
}

// ----------------------------------------------------------------
// Основная логика
// ----------------------------------------------------------------
async function main() {
  console.log('[pg-notifier] Starting...');
  console.log(`[pg-notifier] Centrifugo API: ${CENTRIFUGO_API_URL}`);

  const pgClient = new Client({
    connectionString: PG_URL,
    ssl: { rejectUnauthorized: false },
  });

  pgClient.on('error', (err) => {
    console.error('[pg-notifier] PostgreSQL error:', err.message);
    process.exit(1);
  });

  await pgClient.connect();
  console.log('[pg-notifier] Connected to PostgreSQL');

  // Слушаем все три канала NOTIFY
  await pgClient.query('LISTEN room_changes');
  await pgClient.query('LISTEN player_changes');
  await pgClient.query('LISTEN answer_changes');
  console.log('[pg-notifier] Listening on: room_changes, player_changes, answer_changes');

  pgClient.on('notification', async (msg) => {
    try {
      const payload = JSON.parse(msg.payload);
      const channel = getChannel(payload);

      if (!channel) {
        console.warn('[pg-notifier] Unknown table:', payload.table);
        return;
      }

      await centrifugoPublish(channel, payload);
      console.log(`[pg-notifier] Published to ${channel} (${payload.table} ${payload.op})`);
    } catch (err) {
      console.error('[pg-notifier] Error processing notification:', err.message);
    }
  });

  // Keepalive
  setInterval(async () => {
    try {
      await pgClient.query('SELECT 1');
    } catch (err) {
      console.error('[pg-notifier] Keepalive failed:', err.message);
      process.exit(1);
    }
  }, 30000);

  console.log('[pg-notifier] Ready, waiting for database events...');
}

main().catch((err) => {
  console.error('[pg-notifier] Fatal error:', err.message);
  process.exit(1);
});
