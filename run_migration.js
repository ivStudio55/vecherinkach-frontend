const { Client } = require('ssh2');
const fs = require('fs');

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('Usage: node run_migration.js <sql-file>');
  process.exit(1);
}

const sql = fs.readFileSync(sqlFile, 'utf8');

function tryConnect() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => resolve(conn));
    conn.on('error', (err) => reject(err));
    conn.connect({
      host: '89.169.2.83', port: 22, username: 'root',
      password: 'm4ii*C7YQhR2,h', readyTimeout: 60000
    });
  });
}

function runSql(conn, sql) {
  return new Promise((resolve, reject) => {
    const cmd = `PGPASSWORD='3WdY)K<{=Mc=rJ' psql -h 5.42.107.149 -p 5432 -U gen_user -d default_db`;
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('data', d => { stdout += d.toString(); process.stdout.write(d); });
      stream.stderr.on('data', d => { stderr += d.toString(); process.stderr.write(d); });
      stream.on('close', code => {
        conn.end();
        resolve({ code, stdout, stderr });
      });
      stream.stdin.write(sql);
      stream.stdin.end();
    });
  });
}

(async () => {
  try {
    const conn = await tryConnect();
    console.log('Connected to VPS!');
    console.log(`Running migration: ${sqlFile}\n`);

    const { code } = await runSql(conn, sql);

    if (code === 0) {
      console.log('\n✅ Migration successful!');
    } else {
      console.log('\n❌ Migration failed with exit code:', code);
      process.exit(code);
    }
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
