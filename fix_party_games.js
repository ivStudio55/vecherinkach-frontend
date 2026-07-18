const fs = require('fs');
let code = fs.readFileSync('app/page.tsx', 'utf8');

code = code.replace(/const miniGames: Array<\{/g, 'const partyGames: Array<{');
code = code.replace(
  'id: "uno" | "risunkach" | "jokester" | "creativach";',
  'id: "uno" | "risunkach" | "jokester" | "creativach" | "survivach";'
);
code = code.replace(/handleMiniGameClick/g, 'handlePartyGameClick');

code = code.replace(
  /const handlePartyGameClick = \([\s\S]*?=> \{/m,
  'const handlePartyGameClick = (gameId: "uno" | "risunkach" | "jokester" | "creativach" | "survivach") => {'
);

const partyGamesArrayMatch = code.match(/const partyGames.*?=\s*\[([\s\S]*?)\];/m);

if (partyGamesArrayMatch) {
  const gamesContent = partyGamesArrayMatch[1];
  if (!gamesContent.includes('id: "survivach"')) {
    const newGamesContent = `
    {
      id: "survivach",
      title: "Выживач",
      subtitle: "Классическая викторина",
      description: "Отвечайте на вопросы, используйте подсказки и выживайте до конца!",
      badge: "хит",
      version: "версия 1.0",
    },` + gamesContent;
    code = code.replace(gamesContent, newGamesContent);
  }
}

// remove duplicate survivach ifs
code = code.replace(
  `    if (gameId === "survivach") {
      choosePackAndGoHost("classic");
    } else if (gameId === "survivach") {
      choosePackAndGoHost("classic");
    } else`,
  `    if (gameId === "survivach") {
      navigateWithExit(() => router.push("/survivach"));
    } else`
);

// if survivach check doesn't navigate to survivach, fix it
code = code.replace(
  `if (gameId === "survivach") {
      choosePackAndGoHost("classic");
    } else if`,
  `if (gameId === "survivach") {
      navigateWithExit(() => router.push("/survivach"));
    } else if`
);

fs.writeFileSync('app/page.tsx', code, 'utf8');
console.log('Fixed partyGames and routing');
