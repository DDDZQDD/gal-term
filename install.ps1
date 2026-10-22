$ErrorActionPreference = "Stop"
$renderer = "H:\SteamLibrary\steamapps\common\OpenFront\resources\renderer"
if (-not (Test-Path $renderer)) {
  throw "Client Steam introuvable: $renderer"
}

$dest = Join-Path $renderer "of-deck"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $PSScriptRoot "mod.js") (Join-Path $dest "mod.js") -Force
Copy-Item (Join-Path $PSScriptRoot "public\deck.js") (Join-Path $dest "deck.js") -Force
Copy-Item (Join-Path $PSScriptRoot "public\deck.css") (Join-Path $dest "deck.css") -Force

$index = Join-Path $renderer "index.html"
$utf8 = New-Object System.Text.UTF8Encoding $false
$html = [IO.File]::ReadAllText($index)
if ($html -notmatch "of-deck/mod\.js") {
  $backup = "$index.ofdeck-bak"
  if (-not (Test-Path $backup)) {
    Copy-Item $index $backup
  }
  $needle = "  </body>"
  if (-not $html.Contains($needle)) {
    throw "Balise body introuvable dans index.html"
  }
  $html = $html.Replace($needle, "    <script src=`"/of-deck/mod.js`"></script>`r`n  </body>")
  [IO.File]::WriteAllText($index, $html, $utf8)
}

$startup = [Environment]::GetFolderPath("Startup")
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $startup "OF Deck.lnk"))
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "//B //nologo `"$PSScriptRoot\watchdog.vbs`""
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.WindowStyle = 7
$shortcut.Description = "OF Deck (arriere-plan)"
$shortcut.Save()

$watch = Join-Path $PSScriptRoot "watchdog.vbs"
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "//B //nologo `"$watch`"" -WorkingDirectory $PSScriptRoot
$logon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$repeat = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -MultipleInstances IgnoreNew -Hidden
Register-ScheduledTask -TaskName "OF-Deck" -Action $action -Trigger @($logon, $repeat) -Settings $settings -Force | Out-Null

node (Join-Path $PSScriptRoot "patch-template.js")
Write-Output "OF Deck installe dans $dest"
