const fs = require('fs');
let code = fs.readFileSync('app/page.tsx', 'utf8');

// Find the start of Control panel
const s1 = code.indexOf('<div\n            className={panelEnterClass(panelStage >= 2)}');
// Find the start of Games panel
const s2 = code.indexOf('<div\n            className={panelEnterClass(panelStage >= 3)}', s1);

if (s1 !== -1 && s2 !== -1) {
  // Find the end of Games panel
  const endGames = code.indexOf('{/* Streams modal */}', s2);
  
  if (endGames !== -1) {
    const controlPanelHtml = code.substring(s1, s2);
    // Remove the comment {/* Отдельная панель выбора пакета вопросов */} or similar if it is between them
    // Actually, s2 includes that comment if we search carefully.
    
    // We want to extract:
    // A: control panel (s1 to s2)
    const panelA = code.substring(s1, s2);
    // B: games panel (s2 to endGames)
    const panelB = code.substring(s2, endGames);
    
    // Replace: put B before A.
    // Replace panelStage >= 3 in games to panelStage >= 2
    // Replace panelStage >= 2 in control to panelStage >= 3
    const newPanelB = panelB.replace(/panelStage >= 3/g, 'panelStage >= 2').replace(/280\)/g, '140)');
    const newPanelA = panelA.replace(/panelStage >= 2/g, 'panelStage >= 3').replace(/140\)/g, '280)');
    
    code = code.substring(0, s1) + newPanelB + newPanelA + code.substring(endGames);
    fs.writeFileSync('app/page.tsx', code, 'utf8');
    console.log('Swapped successfully');
  } else {
    console.log('endGames not found');
  }
} else {
  console.log('s1 or s2 not found');
  
  // try without newlines
  const sl1 = code.indexOf('className={panelEnterClass(panelStage >= 2)}');
  const sl2 = code.indexOf('className={panelEnterClass(panelStage >= 3)}');
  console.log({ sl1, sl2 });
}
