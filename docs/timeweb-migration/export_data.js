// Export data from Supabase REST API and generate SQL for Timeweb import
const https = require('https');
const fs = require('fs');
const path = require('path');

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxcnNwaW1maGltbnRicnd4dnZpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzkwMDM5MywiZXhwIjoyMDc5NDc2MzkzfQ.q2A26NeBbD_6P_l0tOvijSCFpgA-xu_L4xIApYOSytw';
const SUPABASE_URL = 'https://vqrspimfhimntbrwxvvi.supabase.co/rest/v1';
const OUT_FILE = path.join(__dirname, 'dump', 'data_export.sql');

function fetchTable(table) {
  return new Promise((resolve) => {
    const url = `${SUPABASE_URL}/${table}?select=*&limit=5000`;
    const req = https.request(url, {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Prefer': 'count=exact'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const rows = JSON.parse(data);
          console.log(`  ${table}: ${rows.length} rows`);
          resolve(rows);
        } else {
          console.log(`  ${table}: ERROR ${res.statusCode} - ${data.substring(0, 100)}`);
          resolve([]);
        }
      });
    });
    req.on('error', (e) => {
      console.log(`  ${table}: NETWORK ERROR - ${e.message}`);
      resolve([]);
    });
    req.end();
  });
}

function escapeSql(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  // Escape single quotes
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function toInsertSql(table, rows) {
  if (!rows || rows.length === 0) {
    return `-- No data for ${table}`;
  }
  const cols = Object.keys(rows[0]);
  const valueLines = rows.map(row => {
    const vals = cols.map(col => escapeSql(row[col]));
    return `  (${vals.join(', ')})`;
  });
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES\n${valueLines.join(',\n')}\nON CONFLICT DO NOTHING;`;
}

async function main() {
  console.log('Exporting data from Supabase REST API...');
  
  const tables = [
    'questions',
    'app_settings',
  ];
  
  const parts = [
    `-- Data export from Supabase -> Timeweb`,
    `-- Generated: ${new Date().toISOString()}`,
    `-- Tables: ${tables.join(', ')}`,
    '',
    'SET client_encoding = \'UTF8\';',
    ''
  ];
  
  for (const table of tables) {
    const rows = await fetchTable(table);
    parts.push(`-- TABLE: ${table} (${rows.length} rows)`);
    parts.push(toInsertSql(`public.${table}`, rows));
    parts.push('');
  }
  
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, parts.join('\n'), 'utf8');
  
  const sizeKB = Math.round(fs.statSync(OUT_FILE).size / 1024 * 10) / 10;
  console.log(`\nSaved: ${OUT_FILE} (${sizeKB} KB)`);
  console.log('Next: apply with psql --file=dump/data_export.sql');
}

main().catch(console.error);
