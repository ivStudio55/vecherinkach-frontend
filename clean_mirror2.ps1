$fp = "c:\Users\Alekzander\apps\vecherinkach-frontend\app\host\[roomId]\page.tsx"
$c = [IO.File]::ReadAllText($fp, [Text.UTF8Encoding]::new($false))
Write-Host "Initial: $($c.Length)"

# 1. Remove isMirrorRef.current block in round-end effect
$old1 = "    if (isMirrorRef.current) {`r`n      // Mirror: play between audio first, then the round-end ceremony (round1end voice + jingle).`r`n      void playBetweenAudioForPercent(correctAnswerPercentage, {`r`n        onEnded: () => {`r`n          if (roundEndLockQuestionRef.current !== questionKey) return;`r`n          playRound1EndCeremonyAudio();`r`n        },`r`n      });`r`n      return;`r`n    }`r`n`r`n    roundEndButtonSetterRef"
$new1 = "    roundEndButtonSetterRef"
if ($c.Contains($old1)) { $c = $c.Replace($old1, $new1); Write-Host "1: removed isMirrorRef round-end block" } else { Write-Host "1: NOT FOUND" }

# 2. Open room button: {isMirror ? 'X' : 'Y'} => 'Y'  (takes the false/non-mirror branch)
$before2 = $c.Length
$c = [regex]::Replace($c, '\{isMirror \? ''[^'']+'' : (''[^'']+'')\}', '$1')
Write-Host "2: open room button. Length change: $(($c.Length - $before2))"

# 3. Simple && guard removals
$pairs = @(
  @("{showMobilePrompt && !isMirror ? (", "{showMobilePrompt ? ("),
  @("{round3AudioBlocked && !isMirror && (", "{round3AudioBlocked && ("),
  @("{isJoinQrModalOpen && !isMirror && (", "{isJoinQrModalOpen && ("),
  @(") : isFinalRoundAvailable && !isMirror && (", ") : isFinalRoundAvailable && (")
)
foreach ($pair in $pairs) {
  if ($c.Contains($pair[0])) {
    $c = $c.Replace($pair[0], $pair[1])
    Write-Host "Replaced: $($pair[0].Substring(0, 60))"
  } else {
    Write-Host "NOT FOUND: $($pair[0].Substring(0, 60))"
  }
}

[IO.File]::WriteAllText($fp, $c, [Text.UTF8Encoding]::new($false))
Write-Host "Final: $($c.Length)"
