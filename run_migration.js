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

function runCmd(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('data', d => { stdout += d.toString(); process.stdout.write(d); });
      stream.stderr.on('data', d => { stderr += d.toString(); process.stderr.write(d); });
      stream.on('close', code => {
        conn.end();
        resolve({ code, stdout, stderr });
      });
    });
  });
}

(async () => {
  try {
    const conn = await tryConnect();
    console.log('Connected to VPS!');
    
    // PostgreSQL находится на отдельном хосте 5.42.107.149
    const cmd = `PGPASSWORD='3WdY)K<{=Mc=rJ' psql -h 5.42.107.149 -p 5432 -U gen_user -d default_db -c "ALTER TABLE survivach_rooms DROP CONSTRAINT IF EXISTS survivach_rooms_status_check;" -c "ALTER TABLE survivach_rooms ADD CONSTRAINT survivach_rooms_status_check CHECK (status IN ('lobby','rules','moving','round_intro','round_playing','round_results','bet_reveal','duel_intro','duel_setup','duel_playing','duel_result','blitz_intro','blitz_playing','blitz_results','potato_intro','potato_playing','potato_result','finished'));"`;
    
    console.log('Running migration...\n');
    const { code } = await runCmd(conn, cmd);
    
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
