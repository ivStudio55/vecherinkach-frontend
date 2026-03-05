// Quick test: connect to Centrifugo and subscribe to a room channel
// Run with: node docs/timeweb-migration/centrifuge-test.mjs

import { Centrifuge } from 'centrifuge';
import WebSocket from 'ws';

const url = 'ws://89.169.2.83:8000/connection/websocket';
const client = new Centrifuge(url, { websocket: WebSocket });

client.on('connected', (ctx) => {
  console.log('Connected! client:', ctx.client, 'user:', ctx.info?.user || '(anonymous)');

  const sub = client.newSubscription('room:6d65cdb1-a7d4-4758-a722-f5e394f7a191');
  sub.on('subscribed', (ctx) => {
    console.log('\n✅ SUBSCRIBED! ctx:', JSON.stringify(ctx));
    process.exit(0);
  });
  sub.on('error', (ctx) => {
    console.log('\n❌ Subscribe error:', JSON.stringify(ctx));
    process.exit(1);
  });
  sub.subscribe();
});

client.on('error', (ctx) => {
  console.log('Client error:', JSON.stringify(ctx));
});

client.connect();

setTimeout(() => {
  console.log('Timeout after 8s');
  process.exit(2);
}, 8000);
