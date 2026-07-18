const fs = require('fs');
let code = fs.readFileSync('app/page.tsx', 'utf8');

code = code.replace(
  /const partyGames: Array<\{[\s\S]*?id: 'uno' \| 'risunkach' \| 'jokester' \| 'creativach';/,
  `const partyGames: Array<{
    id: 'survivach' | 'uno' | 'risunkach' | 'jokester' | 'creativach';`
);

code = code.replace(
  /isSoon\?: boolean;/,
  `isSoon?: boolean;
    version?: string;`
);

code = code.replace(
  /\] = \[\s*\{\s*id: 'uno',/,
  `] = [
    {
      id: 'survivach',
      title: 'Выживач',
      subtitle: 'Главный хит',
      description: 'Оригинальный квиз с выбыванием участников! Выживет только умнейший.',
      badge: 'v 1.0',
      version: 'v 1.0',
    },
    {
      id: 'uno',`
);

code = code.replace(
  /const handlePartyGameClick = \(gameId: 'uno' \| 'risunkach' \| 'jokester' \| 'creativach'\) => \{/,
  `const handlePartyGameClick = (gameId: 'survivach' | 'uno' | 'risunkach' | 'jokester' | 'creativach') => {`
);

code = code.replace(
  /if \(gameId === 'uno'\) \{/,
  `if (gameId === 'survivach') {
      choosePackAndGoHost('classic');
    } else if (gameId === 'uno') {`
);

code = code.replace(
  `<div className="text-sm comic-font uppercase tracking-[0.3em]">v 2.0</div>`,
  `<div className="text-sm comic-font uppercase tracking-[0.3em]">v 2.1</div>`
);

fs.writeFileSync('app/page.tsx', code, 'utf8');
console.log('done!');
