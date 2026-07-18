const fs = require('fs');
let code = fs.readFileSync('page_original_utf8.tsx', 'utf8');
const idx = code.indexOf('lg:grid-cols-[1.15fr,0.95fr]');
fs.writeFileSync('col2.txt', code.substring(idx, idx + 4000), 'utf8');
