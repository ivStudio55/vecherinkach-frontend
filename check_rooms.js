const fs = require('fs');
let code = fs.readFileSync('page_original_utf8.tsx', 'utf8');

const idx = code.indexOf('roomsToday');
const lastIdx = code.lastIndexOf('roomsToday');

console.log('last usage:', code.substring(lastIdx - 100, lastIdx + 500).replace(/[^\x00-\x7F]/g, '*'));
