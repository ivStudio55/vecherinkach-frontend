const fs = require('fs');
let code = fs.readFileSync('page_original_utf8.tsx', 'utf8');

console.log(code.match(/const \[.*?(code|room|join).*?\] = useState/i) || 'no state');
