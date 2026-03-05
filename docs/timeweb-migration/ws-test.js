const ws = require('ws');
const c = new ws('ws://centrifugo:8000/connection/websocket');
let id = 1;

c.on('open', () => {
  console.log('WS open, sending connect...');
  // Centrifugo v5 protobuf-less JSON connect
  c.send(JSON.stringify({ id: id++, method: 1, params: {} }));
});

c.on('message', (d) => {
  const m = JSON.parse(d);
  console.log('msg:', JSON.stringify(m));
  if (m.id === 1) {
    if (m.error) {
      console.log('CONNECT FAIL:', m.error);
      process.exit(1);
    }
    console.log('Connected! Subscribing...');
    c.send(JSON.stringify({
      id: id++,
      method: 6,
      params: { channel: 'room:6d65cdb1-a7d4-4758-a722-f5e394f7a191' }
    }));
  } else if (m.id === 2) {
    if (m.error) {
      console.log('SUBSCRIBE FAIL:', JSON.stringify(m.error));
      process.exit(1);
    } else {
      console.log('SUBSCRIBE SUCCESS!');
      process.exit(0);
    }
  }
});

c.on('error', (e) => { console.log('error:', e.message); process.exit(1); });
setTimeout(() => { console.log('timeout'); process.exit(2); }, 6000);
