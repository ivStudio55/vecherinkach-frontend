const fs = require('fs');
let code = fs.readFileSync('page_original_utf8.tsx', 'utf8');

const s1 = code.indexOf('<div className="grid lg:grid-cols-[1.15fr,0.95fr]');
console.log(code.substring(s1, s1+3000).replace(/[^\x00-\x7F]/g, '*'));
