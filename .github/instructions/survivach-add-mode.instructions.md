---
description: "Use when adding a new game mode to Survivach: registering a mode, writing question logic, adding host/player UI, deploying. Covers the full extensibility contract."
applyTo: "app/survivach/**,src/lib/survivach/**"
---

# Survivach — How to Add a New Game Mode

## Architecture Overview

Pre-blitz modes are selected **randomly** at runtime using a weighted registry.  
The core selection algorithm (`getRandomMode`) never changes — only the registry grows.

```
types.ts          ← RoundMode union (canonical type)
gameModes.ts      ← GAME_MODE_REGISTRY + getRandomMode() algorithm
host/[code]/page.tsx
  handleMoveAnimDone()  ← question data is built here
  <RoundPlayingView>    ← question is displayed here (host TV screen)
room/[code]/page.tsx
  <RoundPlayingView>    ← player interaction UI
```

**Blitz (`blitz`) is special** — it lives in fixed cells (≥ BLITZ_START = 19) and is handled by `advanceBlitzRound`. It must NOT be added to `GAME_MODE_REGISTRY`.

---

## Step-by-Step: Adding a New Mode

### Step 1 — Register the type

File: `src/lib/survivach/types.ts`, `RoundMode` union (around line 25):

```typescript
export type RoundMode =
  | 'umnik'
  | 'mathematician'
  | 'art_historian'
  | 'interpreter'
  | 'memory_diary'
  | 'tag_puzzle'
  | 'my_new_mode'   // ← add here
  | 'blitz';
```

### Step 2 — Add to the registry

File: `src/lib/survivach/gameModes.ts`, inside `GAME_MODE_REGISTRY` array:

```typescript
{
  id: 'my_new_mode',
  label: 'Мой Режим',        // displayed in UI via MODE_LABELS fallback
  color: '#34d399',           // hex, used for UI accents
  emoji: '🎯',
  category: 'NORMAL',         // 'NORMAL' | 'SPECIAL' | 'DUEL'
  timerSec: 30,               // default timer in seconds
  weight: 2,                  // 1 = rare, 2 = normal, 3 = frequent
},
```

**Weight guide:**
- `weight: 3` — appears ~3× more often than weight 1 (e.g. `umnik`)
- `weight: 2` — standard (most modes)
- `weight: 1` — rare / complex modes (e.g. `tag_puzzle`)

**Category guide:**
- `NORMAL` — standard Q&A or task
- `SPECIAL` — complex mechanic with long timer (puzzle, memory)
- `DUEL` — reserved for future PvP duels

### Step 3 — Build question data in `handleMoveAnimDone`

File: `app/survivach/host/[code]/page.tsx`, inside `handleMoveAnimDone` callback.  
Find the chain of `else if (mode === '...')` blocks (around line 1200–1240) and add:

```typescript
} else if (mode === 'my_new_mode') {
  // Option A: load from a question pack JSON
  const qBank = await loadPackQuestions(pack.base_url, mode);
  const list = (qBank as { questions: unknown[] })?.questions ?? [];
  const available = list.filter((q: unknown) => !usedQIds.has((q as { id: number }).id));
  const q = (available.length > 0 ? available : list)[Math.floor(Math.random() * (available.length || list.length))];
  if (q) {
    setUsedQIds(s => new Set(s).add((q as { id: number }).id));
    questionData = { ...(q as Record<string, unknown>), mode: 'my_new_mode' };
  }

  // Option B: generate data procedurally (no JSON pack needed)
  // questionData = { mode: 'my_new_mode', someField: generateSomething() };
}
```

Also update the `timerSec` fallback just below the if-chain if the mode uses a non-standard timer:

```typescript
// Current line (around 1250):
const timerSec = mode === 'mathematician' ? 60 : mode === 'tag_puzzle' ? 120 : 30;
// After change:
const timerSec = mode === 'mathematician' ? 60
  : mode === 'tag_puzzle' ? 120
  : mode === 'my_new_mode' ? 45   // ← add if non-standard
  : 30;
```

> **Tip:** `questionData` is stored in `room.question_data` (Supabase) and synced to all clients via Centrifuge. Keep it serializable (plain objects/arrays/primitives).

### Step 4 — Host TV screen: display the question

File: `app/survivach/host/[code]/page.tsx`, inside the `round_playing` JSX block (around line 2700+).

Find the pattern `{room.current_mode === 'tag_puzzle' && (...)}` and add a sibling block:

```tsx
{room.current_mode === 'my_new_mode' && currentQ && (
  <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
    {/* Your host TV UI — large text, images, etc. */}
    <h2 className="text-4xl font-black text-white text-center">
      {(currentQ as { question: string }).question}
    </h2>
  </div>
)}
```

For modes that show a question in the **header bar**, also add to the header condition (around line 2637):

```tsx
{(room.current_mode === 'umnik' || room.current_mode === 'blitz' || room.current_mode === 'my_new_mode') && (
  <h2 ...>{(currentQ as { question: string }).question}</h2>
)}
```

### Step 5 — Player screen: interaction UI

File: `app/survivach/room/[code]/page.tsx`, inside the `round_playing` JSX block.

Find the chain of mode blocks (around line 851+) and add:

```tsx
{/* ── MY NEW MODE ── */}
{room.current_mode === 'my_new_mode' && (
  <div className="flex flex-col gap-4">
    <h2 className="text-xl font-bold text-center">{qData.question as string}</h2>

    {/* Choice answer (like umnik): */}
    {(qData.options as string[]).map((opt, i) => (
      <button
        key={i}
        onClick={() => submitChoiceAnswer(i, idx => idx === (qData.correct as number))}
        className="px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-semibold"
      >
        {opt}
      </button>
    ))}

    {/* OR text answer (like art_historian / interpreter): */}
    <input
      type="text"
      value={textAnswer}
      onChange={e => setTextAnswer(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && submitTextAnswerFn(qData.accept_answer as string[])}
      className="bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white"
    />
    <button onClick={() => submitTextAnswerFn(qData.accept_answer as string[])}>OK</button>
  </div>
)}
```

**Available submit helpers (already defined in room page):**

| Helper | When to use |
|---|---|
| `submitChoiceAnswer(idx, isCorrectFn)` | Multiple-choice (like `umnik`) |
| `submitTextAnswerFn(acceptList)` | Free-text answer matched against a list |
| `submitAnswer(roomId, playerId, round, { answer_data, is_correct })` | Full manual control |

### Step 6 — Scoring logic (if non-standard)

File: `app/survivach/host/[code]/page.tsx`, inside `processRoundResults` callback (around line 1350+).

Most modes use the **default scoring path** at the bottom of the function (correct → +1 position, wrong → -1 life). Only add a custom block if your mode has special rules (like `mathematician` or `blitz`):

```typescript
} else if (mode === 'my_new_mode') {
  // custom scoring — same shape as the mathematician block
  for (const p of nonHostPlayers) {
    const ans = finalAnswers.find(x => x.player_id === p.id);
    const isCorr = ans?.is_correct ?? false;
    const posChange = isCorr ? 1 : 0;
    const livesChange = isCorr ? 0 : -1;
    // ...build the result object
  }
}
```

### Step 7 — `upload_files.js` (if new files added)

If you created **new source files**, add them to the `FILES` array in `upload_files.js`:

```js
{ local: 'src/lib/survivach/my_new_helper.ts', remote: '/opt/vecherinkach-app/src/lib/survivach/my_new_helper.ts' },
```

Files already in the list (always uploaded):
- `app/survivach/page.tsx`
- `app/survivach/host/[code]/page.tsx`
- `app/survivach/room/[code]/page.tsx`
- `src/lib/survivach/audio.ts`
- `src/lib/survivach/gameModes.ts`
- `src/lib/survivach/types.ts`
- `app/globals.css`

---

## Checklist

```
[ ] 1. RoundMode union updated in types.ts
[ ] 2. GameModeDescriptor added to GAME_MODE_REGISTRY in gameModes.ts
[ ] 3. Question data built in handleMoveAnimDone (host page)
[ ] 4. Host TV UI added to round_playing block (host page)
[ ] 5. Player interaction UI added to round_playing block (room page)
[ ] 6. Custom scoring added to processRoundResults (if needed)
[ ] 7. New source files added to upload_files.js FILES array (if any)
[ ] 8. TypeScript check: npx tsc --noEmit
[ ] 9. Upload: node upload_files.js
[  ] 10. Deploy: node deploy_ssh.js "cd /opt/vecherinkach && docker compose build --no-cache nextjs && docker compose up -d nextjs"
```

---

## Key Invariants — Do Not Break

- `blitz` must never be in `GAME_MODE_REGISTRY` — it is handled separately by `advanceBlitzRound`
- `getRandomMode()` in `gameModes.ts` never needs to change when adding a new mode
- `usedModesHistoryRef` in the host page tracks played modes to prevent back-to-back repeats — no changes needed
- `getModeForCell()` in `board.ts` is only used for blitz cells (position ≥ BLITZ_START) — leave it unchanged
- `questionData` stored in Supabase must be JSON-serializable (no class instances, no functions)
- The `mode` field inside `questionData` must always equal the `RoundMode` id string
