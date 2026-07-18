const fs = require('fs');
let code = fs.readFileSync('app/page.tsx', 'utf8');

const startMarker = '<div className={panelEnterClass(panelStage >= 3)} style={panelEnterStyle(panelStage >= 3, 280)}>';
const endMarker = '{/* Streams modal */}';
const idxStart = code.indexOf(startMarker);
let idxEnd = code.indexOf(endMarker, idxStart);

if (idxStart !== -1 && idxEnd !== -1) {
  // Go back to the end of the `hasStarted` branch
  idxEnd = code.lastIndexOf(')}', idxEnd);

  const newPanel = `
          <div className={panelEnterClass(panelStage >= 3)} style={panelEnterStyle(panelStage >= 3, 280)}>
            <section className="comic-panel bg-white p-4 sm:p-6 w-full flex-1 flex flex-col justify-center h-full">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-xl sm:text-2xl font-black text-[#142a45] uppercase tracking-wide">Коллекция игр</h2>
                <span className="text-xs font-semibold tracking-[0.3em] text-[#142a45]/70">ПОЛНОЦЕННЫЕ ХИТЫ</span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 h-full">
                {partyGames.map((game, index) => {
                  const isDisabled = Boolean(game.isSoon);
                  const isExitingState = isExiting ? 'scale-95 opacity-70' : cardsVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0 translate-y-3';
                  
                  const emoji = 
                    game.id === 'survivach' ? '🔥' :
                    game.id === 'uno' ? '🃏' :
                    game.id === 'risunkach' ? '🎨' :
                    game.id === 'jokester' ? '🤡' :
                    game.id === 'creativach' ? '✍️' : null;

                  return (
                    <button
                      key={game.id}
                      type="button"
                      onClick={() => handlePartyGameClick(game.id)}
                      disabled={isDisabled}
                      className={\`rounded-3xl border-[3px] border-[#142a45] bg-[#fff] p-4 flex flex-col justify-between items-start text-left gap-2 min-h-[140px] \${isMobile ? 'h-full' : 'h-[220px]'} transition-transform hover:scale-105 hover:-translate-y-1 \${isDisabled ? 'opacity-50 cursor-not-allowed' : ''} \${isExitingState}\`}
                      style={{ transitionDelay: \`\${index * 50}ms\` }}
                    >
                      <div className="w-full">
                        <p className="retro-heading text-[10px] sm:text-xs tracking-[0.2em] text-[#142a45]/70 truncate">{game.subtitle}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {emoji && <span className="text-xl sm:text-2xl" aria-hidden="true">{emoji}</span>}
                          <h3 className="text-lg sm:text-xl font-black text-[#142a45] leading-none">{game.title}</h3>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {game.badge && (
                            <span className="rounded-full border-[2px] border-[#142a45] bg-[#ffe184] px-2 py-0.5 text-[10px] font-black tracking-widest text-[#142a45]">
                              {game.badge}
                            </span>
                          )}
                          {game.version && (
                            <span className="rounded-full border-[2px] border-[#142a45] bg-[#eef5fc] px-2 py-0.5 text-[10px] font-black tracking-widest text-[#142a45]">
                              {game.version}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {!isMobile && (
                        <p className="text-xs sm:text-sm text-[#142a45]/80 line-clamp-3 leading-snug">
                          {game.description}
                        </p>
                      )}

                      <div className="flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-[#1f6ac6] w-full mt-auto">
                        <span className="truncate flex-1">
                          {game.id === 'survivach' ? 'перейти к настройкам' : 
                          game.id === 'uno' ? '4 режима' :
                          game.id === 'risunkach' ? '3 уровня' : 'играть'}
                        </span>
                        <span className="shrink-0">{game.isSoon ? '🔒' : '▶'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        `;
  code = code.substring(0, idxStart) + newPanel + code.substring(idxEnd);
} else {
  console.log('Could not find markers', idxStart, idxEnd);
}

fs.writeFileSync('app/page.tsx', code, 'utf8');
console.log('done updating DOM');
