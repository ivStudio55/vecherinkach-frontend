$fp = "c:\Users\Alekzander\apps\vecherinkach-frontend\app\host\[roomId]\page.tsx"
$c = [IO.File]::ReadAllText($fp, [Text.UTF8Encoding]::new($false))

Write-Host "Initial length: $($c.Length)"

# ─── A: Mirror broadcast channel section ───
$sm = "`r`n`r`n  // " + [char]0x2500 + [char]0x2500 + [char]0x2500 + " Mirror broadcast channel"
$em = "  }, [isMirror, isCountdownVisible, countdownValue, countdownContext]);"
$si = $c.IndexOf($sm); $ei = $c.IndexOf($em)
if ($si -ge 0 -and $ei -gt $si) {
  $c = $c.Substring(0, $si) + $c.Substring($ei + $em.Length)
  Write-Host "A: removed broadcast channel. Length: $($c.Length)"
} else { Write-Host "A: NOT FOUND si=$si ei=$ei" }

# ─── B: Mirror countdown beep useEffect ───
$bStart = "`r`n`r`n  useEffect(() => {`r`n    if (!isMirror || !isCountdownVisible) {"
$bEnd = "  }, [countdownValue, isCountdownVisible, isMirror, playBeep]);"
$si = $c.IndexOf($bStart); $ei = $c.IndexOf($bEnd)
if ($si -ge 0 -and $ei -gt $si) {
  $c = $c.Substring(0, $si) + $c.Substring($ei + $bEnd.Length)
  Write-Host "B: removed countdown beep. Length: $($c.Length)"
} else { Write-Host "B: NOT FOUND si=$si ei=$ei" }

# ─── C: Mirror auto-open useEffect ───
$cStart = "  useEffect(() => {`r`n    if (isMirror && !isRoomOpened) {"
$cEnd = "  }, [isMirror, isRoomOpened]);"
$si = $c.IndexOf($cStart); $ei = $c.IndexOf($cEnd)
if ($si -ge 0 -and $ei -gt $si) {
  # Also eat the preceding newlines
  $prevTwo = "`r`n`r`n"
  if ($si -ge 2 -and $c.Substring($si - 2, 2) -eq "`r`n") {
    $si = $si - 2
  }
  $c = $c.Substring(0, $si) + $c.Substring($c.IndexOf($cEnd) + $cEnd.Length)
  Write-Host "C: removed auto-open. Length: $($c.Length)"
} else { Write-Host "C: NOT FOUND si=$si ei=$ei" }

# ─── D: Mirror-only round2 audio useEffect (guard: !isMirrorRef.current || round2CurrentIndex === null) ───
$dStart = "    if (!isMirrorRef.current || round2CurrentIndex === null) {`r`n      return;`r`n    }"
$dEnd = "  }, [`r`n    playRound2ExplanationAudio,`r`n    playRound2FactAudio,`r`n    playRound2FictionExplanationAudio,"
# We need to find the useEffect that CONTAINS $dStart, then remove it entirely
$dIdx = $c.IndexOf($dStart)
if ($dIdx -ge 0) {
  # Find start of this useEffect (find last "  useEffect(() => {" before $dIdx)
  $ueMarker = "  useEffect(() => {"
  $scanFrom = $dIdx - 2000
  if ($scanFrom -lt 0) { $scanFrom = 0 }
  $lastUe = -1
  $pos = $scanFrom
  while ($true) {
    $found = $c.IndexOf($ueMarker, $pos)
    if ($found -lt 0 -or $found -gt $dIdx) { break }
    $lastUe = $found
    $pos = $found + 1
  }
  # Find end of this useEffect (the closing ], [...]);)
  $dEndFull = "    round2ShowingFact,`r`n  ]);"
  $dEndIdx = $c.IndexOf($dEndFull, $dIdx)
  if ($lastUe -ge 0 -and $dEndIdx -gt $lastUe) {
    # eat preceding blank line
    $removeStart = $lastUe
    if ($removeStart -ge 2 -and $c.Substring($removeStart - 2, 2) -eq "`r`n") { $removeStart -= 2 }
    $removeEnd = $dEndIdx + $dEndFull.Length
    $c = $c.Substring(0, $removeStart) + $c.Substring($removeEnd)
    Write-Host "D: removed round2 mirror audio. Length: $($c.Length)"
  } else { Write-Host "D: could not find end. lastUe=$lastUe dEndIdx=$dEndIdx" }
} else { Write-Host "D: guard marker NOT FOUND" }

# ─── E: Mirror-only round4 answer useEffect (guard: !isMirrorRef.current, returns) ───
$eGuard = "    if (!isMirrorRef.current) {`r`n      return;`r`n    }"
$eEnd = "  }, [playRound4AnswerAudio, questionStartedAt, roomStatus, round4CurrentPuzzle, timeOffsetMs]);"
$eIdx = $c.IndexOf($eGuard)
if ($eIdx -ge 0) {
  $ueMarker = "  useEffect(() => {"
  $scanFrom = $eIdx - 600
  if ($scanFrom -lt 0) { $scanFrom = 0 }
  $lastUe = -1; $pos = $scanFrom
  while ($true) {
    $found = $c.IndexOf($ueMarker, $pos)
    if ($found -lt 0 -or $found -gt $eIdx) { break }
    $lastUe = $found; $pos = $found + 1
  }
  $eEndIdx = $c.IndexOf($eEnd, $eIdx)
  if ($lastUe -ge 0 -and $eEndIdx -gt $lastUe) {
    $removeStart = $lastUe
    if ($removeStart -ge 2 -and $c.Substring($removeStart - 2, 2) -eq "`r`n") { $removeStart -= 2 }
    $removeEnd = $eEndIdx + $eEnd.Length
    $c = $c.Substring(0, $removeStart) + $c.Substring($removeEnd)
    Write-Host "E: removed round4 mirror answer audio. Length: $($c.Length)"
  } else { Write-Host "E: could not find bounds. lastUe=$lastUe eEndIdx=$eEndIdx" }
} else { Write-Host "E: guard NOT FOUND" }

# ─── F: Remove all simple isMirrorRef.current guard lines (various indentation) ───
$guardPattern = '(?m)[ \t]+if \(isMirrorRef\.current\) return;\r?\n'
$before = $c.Length
$c = [regex]::Replace($c, $guardPattern, '')
Write-Host "F: removed $(($before - $c.Length)) chars of guard lines. Length: $($c.Length)"

# ─── G: Remove mirror block in between-audio callback ───
# "          if (isMirrorRef.current) {\r\n            return;\r\n          }\r\n"
$gBlock = "          if (isMirrorRef.current) {`r`n            return;`r`n          }`r`n"
$si = $c.IndexOf($gBlock)
if ($si -ge 0) {
  $c = $c.Substring(0, $si) + $c.Substring($si + $gBlock.Length)
  Write-Host "G: removed between-audio mirror block. Length: $($c.Length)"
} else { Write-Host "G: NOT FOUND" }

# ─── H: Remove mirror block in round-end effect ───
$hBlock = "    if (isMirrorRef.current) {`r`n      // Mirror: play between audio first, then the round-end ceremony"
$hEnd = "      return;`r`n    }`r`n`r`n    // Host: play between audio"
$hsi = $c.IndexOf($hBlock)
$hei = $c.IndexOf($hEnd)
if ($hsi -ge 0 -and $hei -gt $hsi) {
  # Remove the mirror block but keep the "// Host: play between audio" part
  $keepFrom = $c.IndexOf("    // Host: play between audio", $hsi)
  if ($keepFrom -gt $hsi) {
    $c = $c.Substring(0, $hsi) + $c.Substring($keepFrom)
    Write-Host "H: removed round-end mirror block. Length: $($c.Length)"
  } else { Write-Host "H: could not find host comment" }
} else { Write-Host "H: round-end mirror block NOT FOUND hsi=$hsi hei=$hei" }

Write-Host "Final length: $($c.Length)"
[IO.File]::WriteAllText($fp, $c, [Text.UTF8Encoding]::new($false))
Write-Host "DONE"
