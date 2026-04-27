
const fs = require("fs");
const file = "app/survivach/host/[code]/page.tsx";
const code = fs.readFileSync(file, "utf8");
const lines = code.split("\n");

let inMainReturn = false;
let foundLobby = false;
let foundRanked = false;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(`className="min-h-screen bg-gray-950 text-white"`)) {
    lines[i] = lines[i].replace(`min-h-screen`, `h-[100dvh] flex flex-col overflow-hidden`);
    inMainReturn = true;
  }
  
  if (inMainReturn && lines[i].includes(`{/* `) && lines[i].includes(` LOBBY `) && !foundLobby) {
    foundLobby = true;
    lines.splice(i, 0,
`      {/* --- PERSISTENT BOARD VIEW --- */}
      {!["lobby", "rules", "finished"].includes(room.status) && (
        <div className="shrink-0 w-full z-40 bg-[#0c0418] shadow-2xl relative pt-2 px-2 md:pt-4 md:px-4">
          <BoardView players={players.filter(p => !p.is_host)} leaderPosition={room.leader_position} />
        </div>
      )}

      {/* --- SCROLLABLE CONTENT AREA --- */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative flex flex-col">`);
    i += 9;
  }

  if (inMainReturn && lines[i].includes(`{/* `) && lines[i].includes(` Floating leaderboard sidebar `) && !foundRanked) {
    foundRanked = true;
    lines.splice(i, 0, `      </div>\n`);
    i += 2;
  }

  if (inMainReturn && lines[i].includes(`<BoardView players={players.filter`) && lines[i-2].includes(`Передвижение`)) {
    lines[i] = `          {/* BoardView moved to persistent layout */}`;
  }
}

// Convert back to string and replace inner min-h-screens using regex but only inside the scrollable content area.
// It is easier to just map through lines again.
let inScrollable = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("SCROLLABLE CONTENT AREA")) inScrollable = true;
  if (lines[i].includes("Floating leaderboard sidebar")) inScrollable = false;

  // For lobby we keep it relative, but change min-h-screen to min-h-full h-full so it fills the screen
  if (inScrollable && lines[i].includes("min-h-screen")) {
    lines[i] = lines[i].replace("min-h-screen", "min-h-full h-full");
  }
}

fs.writeFileSync(file, lines.join("\n"), "utf8");
console.log("Done refactoring layout 2.");

