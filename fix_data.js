const fs = require('fs');
let code = fs.readFileSync('app/page.tsx', 'utf8');

// 1. Add 'vecherinkach' and 'survivach' to GameId type if not present
code = code.replace(
  'id: "uno" | "risunkach" | "jokester" | "creativach" | "survivach";',
  'id: "uno" | "risunkach" | "jokester" | "creativach" | "survivach" | "vecherinkach";'
);
if (!code.includes('"vecherinkach";')) {
  code = code.replace(
    'id: "uno" | "risunkach" | "jokester" | "creativach";',
    'id: "uno" | "risunkach" | "jokester" | "creativach" | "survivach" | "vecherinkach";'
  );
}

// 2. Add them to partyGames array
const newGames = `    {
      id: "vecherinkach",
      title: "Вечеринкач",
      subtitle: "Когнитивное программирование",
      description: "Классическая викторина для веселой компании с пакетами вопросов.",
      badge: "хит",
      version: "v 2.1",
    },
    {
      id: "survivach",
      title: "Выживач",
      subtitle: "Классическая викторина",
      description: "Отвечайте на вопросы, используйте подсказки и выживайте до конца!",
      badge: "хит",
      version: "v 1.0",
    },
`;

if (!code.includes('title: "Вечеринкач"')) {
  code = code.replace(
    /\]\s*=\s*\[\s*\{\s*id:\s*"uno"/,
    '] = [\n' + newGames + '    {\n      id: "uno"'
  );
}

// 3. Update handlePartyGameClick to handle vecherinkach
code = code.replace(
  'const handlePartyGameClick = (gameId: "uno" | "risunkach" | "jokester" | "creativach" | "survivach") => {',
  'const handlePartyGameClick = (gameId: "uno" | "risunkach" | "jokester" | "creativach" | "survivach" | "vecherinkach") => {'
);
if (!code.includes('if (gameId === "vecherinkach")')) {
  code = code.replace(
    'trackGameEvent("home_minigame_open", { gameId });',
    'trackGameEvent("home_minigame_open", { gameId });\n    if (gameId === "vecherinkach") {\n      choosePackAndGoHost("classic");\n    } else '
  );
}

// 4. In the DOM, update emojis mapping for the new games
if (!code.includes(`game.id === "vecherinkach"`)) {
  code = code.replace(
    'game.id === "survivach"',
    'game.id === "vecherinkach" ? "🧠" : game.id === "survivach"'
  );
}

// 5. In the DOM, update the action text
if (!code.includes(`game.id === "vecherinkach" ? 'играть'`)) {
  code = code.replace(
    `game.id === "survivach" ? "перейти к настройкам"`,
    `game.id === "vecherinkach" ? "играть" :\n                          game.id === "survivach" ? "параметры"`
  );
}

// 6. Delete Учение button
code = code.replace(
  /<button\s+type="button"\s+onClick=\{playRandomMeet\}[\s\S]*?Учение\s*<\/button>/m,
  ''
);

// 7. Rename Поддержка -> Поддержать
code = code.replace(
  />\s*Поддержка\s*<\/button>/m,
  '>\n                        Поддержать\n                      </button>'
);

// 8. Remove Эмоции div completely
// We know it starts with `<div className="rounded-3xl border-[3px] border-[#142a45] bg-[#fdd17a] p-4 space-y-3">`
// and has `<p ...>Эмоции</p>`. Let's just remove that block.
const emotionsRegex = /<div className="rounded-3xl border-\[3px\] border-\[#142a45\] bg-\[#fdd17a\] p-4 space-y-3\">[\s\S]*?Эмоции[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/m;
code = code.replace(emotionsRegex, '');

// 9. Remove lg:grid-cols-[1.15fr,0.95fr] since the grid is now just 1 column (we removed emotions). Wait, the audio channel is there!
// If audio channel is there, they were stacked vertically in "space-y-5". The grid had a second empty column.
// I can just make it max-w-lg mx-auto instead of a grid.
code = code.replace(
  /<div className="grid lg:grid-cols-\[1\.15fr,0\.95fr\] gap-6">/m,
  '<div className="flex flex-col gap-6 max-w-xl mx-auto w-full">'
);

// 10. SWAP order of "Коллекция игр" and "Панель управления"
// "Коллекция игр" starts with `<div className={panelEnterClass(panelStage >= 3)}`
// "Панель управления" starts with `<div className={panelEnterClass(panelStage >= 2)}`
// First we will change panelStage >= 2 to panelStage >= 1 (header), etc. to make them sequential if we want.
// Actually, I can literally just swap the strings!

fs.writeFileSync('app/page.tsx', code, 'utf8');
console.log('Done data and minor ui fixes');
