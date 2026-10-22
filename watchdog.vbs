Set sh = CreateObject("Wscript.Shell")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & Replace(WScript.ScriptFullName, ".vbs", ".ps1") & """", 0, False
