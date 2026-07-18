const fs = require('fs');
let code = fs.readFileSync('app/page.tsx', 'utf8');

code = code.replace(
  /<\/div>\s*{\/\* Streams modal \*\//,
  `</div>
        </div>
      )}
      {/* Streams modal */`
);

fs.writeFileSync('app/page.tsx', code, 'utf8');
