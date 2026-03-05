import { Centrifuge } from 'centrifuge';
import WebSocket from 'ws';

const ROOM_ID = '6d65cdb1-a7d4-4758-a722-f5e394f7a191';
const WS_URL = 'ws://89.169.2.83:8000/connection/websocket';
const POSTGREST_URL = 'http://89.169.2.83/rest/v1';
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiZ2VuX3VzZXIiLCJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3MjYzMjA4MywiZXhwIjo0MDcwOTA4ODAwfQ.O0frbJsIkHqhCNIcgf2gc39-QwsvC37MjN74SiHjijQ';

const centrifuge = new Centrifuge(WS_URL, { websocket: WebSocket });
await new Promise((resolve, reject) => {
  centrifuge.on('connected', resolve);
  centrifuge.on('error', (e) => reject(new Error(JSON.stringify(e))));
  centrifuge.connect();
  setTimeout(() => reject(new Error('WS timeout')), 8000);
});
console.log('Connected to Centrifugo');

const sub = centrifuge.newSubscription('room:' + ROOM_ID);
const receivedMessage = new Promise((resolve) => {
  sub.on('publication', (ctx) => { console.log('EVENT:', JSON.stringify(ctx.data)); resolve(ctx.data); });
});
await new Promise((resolve, reject) => {
  sub.on('subscribed', resolve);
  sub.on('error', (e) => reject(new Error(JSON.stringify(e))));
  sub.subscribe();
  setTimeout(() => reject(new Error('Subscribe timeout')), 5000);
});
console.log('Subscribed to room:' + ROOM_ID);

const res = await fetch(POSTGREST_URL + '/rooms?id=eq.' + ROOM_ID, {
  method: 'PATCH',
  headers: { 'Authorization': 'Bearer ' + JWT, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
  body: JSON.stringify({ status: 'waiting' }),
});
console.log('DB PATCH status:', res.status);

console.log('Waiting 10s for WebSocket notification...');
const data = await Promise.race([
  receivedMessage,
  new Promise((_, reject) => setTimeout(() => reject(new Error('No notification after 10s')), 10000)),
]);

console.log('E2E TEST PASSED: table=' + data.table + ' op=' + data.op);
centrifuge.disconnect();
process.exit(0);
