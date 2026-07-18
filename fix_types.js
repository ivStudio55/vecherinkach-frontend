const fs = require('fs');
let code = fs.readFileSync('app/page.tsx', 'utf8');

// 1. Fix types (GameId missing "survivach", duplicate "version?: string;")
code = code.replace(
  'type GameId = "uno" | "risunkach" | "jokester" | "creativach";',
  'type GameId = "uno" | "risunkach" | "jokester" | "creativach" | "survivach";'
);
code = code.replace(
  `  version?: string;\n  version?: string;`,
  `  version?: string;`
);
code = code.replace(
  `    version?: string;\n    version?: string;`,
  `    version?: string;`
);

fs.writeFileSync('app/page.tsx', code, 'utf8');
console.log('Fixed simple types');
