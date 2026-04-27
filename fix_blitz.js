
const fs = require("fs");

let file = "app/survivach/host/[code]/page.tsx";
let code = fs.readFileSync(file, "utf8");

// Load blitz questions explicitly from specific URL
code = code.replace(
  `const qBank = questions ?? await loadPackQuestions(pack.base_url, mode);`,
  `const qBank = questions ?? (mode === "blitz" ? await loadPackQuestions("https://storage.yandexcloud.net/vecherinkach/json/survivach", "blitz") : await loadPackQuestions(pack.base_url, mode));`
);

// Background music
code = code.replace(
  `const lBgm = LOBBY_THEME;`,
  `const lBgm = room?.current_mode === "blitz" ? "https://storage.yandexcloud.net/vecherinkach/json/survivach/soundtrack/blitz.mp3" : LOBBY_THEME;`
);

// Start Audio + change leader audio - this would take some more lines. Let`s do basic changes first.
fs.writeFileSync(file, code, "utf8");
console.log("Patched host page for blitz.");

