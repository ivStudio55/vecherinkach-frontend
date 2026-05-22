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
  { local: 'app/globals.css', remote: '/opt/vecherinkach-app/app/globals.css' },
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
          sftp.fastPut(localPath, remote, {}, (err) => {
            if (err) return reject(err);
            console.log(`  Done: ${local}`);
            uploadNext(index + 1);
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

upload()
  .then(() => { console.log('All files uploaded!'); process.exit(0); })
  .catch(e => { console.error('Failed:', e.message); process.exit(1); });
