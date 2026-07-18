const fs = require('fs');
let code = fs.readFileSync('page_original_utf8.tsx', 'utf8');

const m = code.match(/<form[\s\S]{0,1000}<\/form>/);
if(m) {
  console.log(m[0].replace(/[^\x00-\x7F]/g, '*'));
} else {
  console.log('no form');
}
