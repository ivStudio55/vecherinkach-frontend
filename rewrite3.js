
const fs = require("fs");
const file = "app/survivach/host/[code]/page.tsx";
const code = fs.readFileSync(file, "utf8");
const lines = code.split("\n");

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("<BoardView") && i > 1500 && i < 1600) {
    console.log("Removing BoardView at line", i+1);
    lines[i] = "          {/* BoardView moved to persistent layout */}";
  }
}

fs.writeFileSync(file, lines.join("\n"), "utf8");
console.log("Done refactoring layout 3.");

