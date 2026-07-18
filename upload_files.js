const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const FILES = [
  { local: 'app/survivach/page.tsx', remote: '/opt/vecherinkach-app/app/survivach/page.tsx' },
  { local: 'app/survivach/host/[code]/page.tsx', remote: '/opt/vecherinkach-app/app/survivach/host/[code]/page.tsx' },
  { local: 'app/survivach/room/[code]/page.tsx', remote: '/opt/vecherinkach-app/app/survivach/room/[code]/page.tsx' },
  { local: 'src/lib/survivach/audio.ts', remote: '/opt/vecherinkach-app/src/lib/survivach/audio.ts' },
  { local: 'src/lib/survivach/api.ts', remote: '/opt/vecherinkach-app/src/lib/survivach/api.ts' },
  { local: 'src/lib/survivach/gameModes.ts', remote: '/opt/vecherinkach-app/src/lib/survivach/gameModes.ts' },
  { local: 'src/lib/survivach/types.ts', remote: '/opt/vecherinkach-app/src/lib/survivach/types.ts' },
  { local: 'app/draw/survivach/arithmetic_mean_questions.json', remote: '/opt/vecherinkach-app/app/draw/survivach/arithmetic_mean_questions.json' },
  { local: 'app/draw/survivach/crowd_forecast_questions.json', remote: '/opt/vecherinkach-app/app/draw/survivach/crowd_forecast_questions.json' },
  { local: 'app/draw/survivach/art_historian_questions.json', remote: '/opt/vecherinkach-app/app/draw/survivach/art_historian_questions.json' },
  { local: 'docs/supabase-draw-packs.sql', remote: '/opt/vecherinkach-app/docs/supabase-draw-packs.sql' },
  { local: 'app/globals.css', remote: '/opt/vecherinkach-app/app/globals.css' },
  { local: 'app/api/panel/stats/route.ts', remote: '/opt/vecherinkach-app/app/api/panel/stats/route.ts' },
  { local: 'app/api/panel/rooms/route.ts', remote: '/opt/vecherinkach-app/app/api/panel/rooms/route.ts' },
  { local: 'app/api/panel/room-detail/route.ts', remote: '/opt/vecherinkach-app/app/api/panel/room-detail/route.ts' },
  { local: 'app/api/panel/room-action/route.ts', remote: '/opt/vecherinkach-app/app/api/panel/room-action/route.ts' },
  { local: 'app/ctrl-8f2q9z/page.tsx', remote: '/opt/vecherinkach-app/app/ctrl-8f2q9z/page.tsx' },
  { local: 'app/host/page.tsx', remote: '/opt/vecherinkach-app/app/host/page.tsx' },
  { local: 'app/page.tsx', remote: '/opt/vecherinkach-app/app/page.tsx' },
  { local: 'src/components/GameConnectionGuide.tsx', remote: '/opt/vecherinkach-app/src/components/GameConnectionGuide.tsx' },
  { local: 'app/api/activity/route.ts', remote: '/opt/vecherinkach-app/app/api/activity/route.ts' },
  { local: 'app/api/health/route.ts', remote: '/opt/vecherinkach-app/app/api/health/route.ts' },
  { local: 'app/api/jokester/packs/route.ts', remote: '/opt/vecherinkach-app/app/api/jokester/packs/route.ts' },
  { local: 'app/api/jokester/lottery/route.ts', remote: '/opt/vecherinkach-app/app/api/jokester/lottery/route.ts' },
  { local: 'app/api/packs/route.ts', remote: '/opt/vecherinkach-app/app/api/packs/route.ts' },
  { local: 'app/api/packs/room/[roomId]/route.ts', remote: '/opt/vecherinkach-app/app/api/packs/room/[roomId]/route.ts' },
  { local: 'app/api/panel/answers/route.ts', remote: '/opt/vecherinkach-app/app/api/panel/answers/route.ts' },
  { local: 'app/api/panel/draw-packs/route.ts', remote: '/opt/vecherinkach-app/app/api/panel/draw-packs/route.ts' },
  { local: 'app/api/panel/jokester-packs/route.ts', remote: '/opt/vecherinkach-app/app/api/panel/jokester-packs/route.ts' },
  { local: 'app/api/panel/packs/route.ts', remote: '/opt/vecherinkach-app/app/api/panel/packs/route.ts' },
  { local: 'app/api/panel/prices/route.ts', remote: '/opt/vecherinkach-app/app/api/panel/prices/route.ts' },
  { local: 'app/api/panel/promo/route.ts', remote: '/opt/vecherinkach-app/app/api/panel/promo/route.ts' },
  { local: 'app/api/panel/round4-categories/route.ts', remote: '/opt/vecherinkach-app/app/api/panel/round4-categories/route.ts' },
  { local: 'app/api/panel/session/route.ts', remote: '/opt/vecherinkach-app/app/api/panel/session/route.ts' },
  { local: 'app/api/panel/streams/route.ts', remote: '/opt/vecherinkach-app/app/api/panel/streams/route.ts' },
  { local: 'app/api/payment/create/route.ts', remote: '/opt/vecherinkach-app/app/api/payment/create/route.ts' },
  { local: 'app/api/pricing-packs/route.ts', remote: '/opt/vecherinkach-app/app/api/pricing-packs/route.ts' },
  { local: 'app/api/promo/validate/route.ts', remote: '/opt/vecherinkach-app/app/api/promo/validate/route.ts' },
  { local: 'app/api/room-token/route.ts', remote: '/opt/vecherinkach-app/app/api/room-token/route.ts' },
  { local: 'app/api/round4-categories/route.ts', remote: '/opt/vecherinkach-app/app/api/round4-categories/route.ts' },
  { local: 'app/api/streams/route.ts', remote: '/opt/vecherinkach-app/app/api/streams/route.ts' },
  { local: 'app/api/survivach/create/route.ts', remote: '/opt/vecherinkach-app/app/api/survivach/create/route.ts' },
  { local: 'app/uno/page.tsx', remote: '/opt/vecherinkach-app/app/uno/page.tsx' },
  { local: 'app/draw/page.tsx', remote: '/opt/vecherinkach-app/app/draw/page.tsx' },
  { local: 'app/creativach/page.tsx', remote: '/opt/vecherinkach-app/app/creativach/page.tsx' },
  { local: 'app/jokester/page.tsx', remote: '/opt/vecherinkach-app/app/jokester/page.tsx' },
  { local: 'app/payment/success/page.tsx', remote: '/opt/vecherinkach-app/app/payment/success/page.tsx' },
  { local: 'app/pricing/page.tsx', remote: '/opt/vecherinkach-app/app/pricing/page.tsx' },
  { local: 'app/ctrl-8f2q9z/draw-packs/page.tsx', remote: '/opt/vecherinkach-app/app/ctrl-8f2q9z/draw-packs/page.tsx' },
  { local: 'app/ctrl-8f2q9z/prices/page.tsx', remote: '/opt/vecherinkach-app/app/ctrl-8f2q9z/prices/page.tsx' },
  { local: 'app/jokester/host/[code]/page.tsx', remote: '/opt/vecherinkach-app/app/jokester/host/[code]/page.tsx' },
  { local: 'app/jokester/spectator/[code]/page.tsx', remote: '/opt/vecherinkach-app/app/jokester/spectator/[code]/page.tsx' },
  { local: 'src/lib/db.server.ts', remote: '/opt/vecherinkach-app/src/lib/db.server.ts' },
  { local: 'src/lib/panel/config.ts', remote: '/opt/vecherinkach-app/src/lib/panel/config.ts' },
  { local: 'src/lib/payments/pricing.ts', remote: '/opt/vecherinkach-app/src/lib/payments/pricing.ts' },
  { local: 'src/lib/server/api.ts', remote: '/opt/vecherinkach-app/src/lib/server/api.ts' },
  { local: 'src/lib/jokester/api.ts', remote: '/opt/vecherinkach-app/src/lib/jokester/api.ts' },
  { local: 'src/lib/draw/types.ts', remote: '/opt/vecherinkach-app/src/lib/draw/types.ts' },
];

function upload() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);

        const uploadNext = (index) => {
          if (index >= FILES.length) {
            conn.end();
            return resolve();
          }
          const { local, remote } = FILES[index];
          const localPath = path.join(__dirname, local);
          const size = fs.statSync(localPath).size;
          console.log(`Uploading ${local} (${(size / 1024).toFixed(1)}KB)...`);
          const remoteDir = path.posix.dirname(remote);
          ensureRemoteDir(sftp, remoteDir, (mkdirErr) => {
            if (mkdirErr) return reject(mkdirErr);
            sftp.fastPut(localPath, remote, {}, (err) => {
              if (err) return reject(err);
              console.log(`  Done: ${local}`);
              uploadNext(index + 1);
            });
          });
        };

        uploadNext(0);
      });
    });
    conn.on('error', reject);
    conn.connect({
      host: '89.169.2.83', port: 22, username: 'root',
      password: 'm4ii*C7YQhR2,h', readyTimeout: 30000
    });
  });
}

function ensureRemoteDir(sftp, dir, cb) {
  const parts = dir.split('/').filter(Boolean);
  let current = '';
  const next = (idx) => {
    if (idx >= parts.length) return cb();
    current += `/${parts[idx]}`;
    sftp.mkdir(current, (err) => {
      if (err && err.code !== 4) return cb(err);
      next(idx + 1);
    });
  };
  next(0);
}

upload()
  .then(() => { console.log('All files uploaded!'); process.exit(0); })
  .catch(e => { console.error('Failed:', e.message); process.exit(1); });
