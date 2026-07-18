const fs = require('fs');
let code = fs.readFileSync('page_original_utf8.tsx', 'utf8');

// Find all direct children of grid
const gridStart = code.indexOf('grid lg:grid-cols');
const afterGrid = code.substring(gridStart);

console.log(afterGrid.includes('form'));
console.log(afterGrid.includes('onSubmit'));
console.log(afterGrid.includes('router.push(`/room/'));
