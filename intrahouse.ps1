$Host.UI.RawUI.BackgroundColor = ($bckgrnd = 'Black')
Clear-Host

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

#-------------- options
$name_service="ih-v5"

$root_path="$($env:LOCALAPPDATA)\$($name_service)"
$data_path="C:\ProgramData\$($name_service)"

if ( $args ) {
$lang = switch ( $args )
    {
        ru { 'ru' }
        en { 'en' }
        default { 'en' }
    }
} else {
$lang = switch ( $l )
    {
        ru { 'ru' }
        en { 'en' }
        default { 'en' }
    }
}

#-------------- end


#-------------- creation of structures

Remove-Item -Force -Recurse -ErrorAction SilentlyContinue $root_path
New-Item -ItemType Directory -Force -Path $root_path | Out-Null
New-Item -ItemType Directory -Force -Path "$root_path\tools" | Out-Null
New-Item -ItemType Directory -Force -Path "$root_path\temp" | Out-Null

#-------------- end


#-------------- check root

$currentUser = New-Object Security.Principal.WindowsPrincipal $([Security.Principal.WindowsIdentity]::GetCurrent())
$testadmin = $currentUser.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if ($testadmin -eq $false) {
[IO.File]::WriteAllLines("$root_path\install.ps1", (New-Object System.Net.WebClient).DownloadString('https://git.io/JYpbW'))
$arg="-NoProfile -InputFormat None -ExecutionPolicy Bypass -NoExit -file $root_path\install.ps1 $l"
Start-Process powershell.exe -Verb RunAs -ArgumentList($arg)
exit $LASTEXITCODE
}
#-------------- end


#-------------- check service

if (Get-NetFirewallRule -DisplayName "$name_service" -ErrorAction SilentlyContinue) {
} else {
New-NetFirewallRule -DisplayName "$name_service" -Direction Inbound -Program "$root_path\node-v14.15.1-win-x64\node.exe" -RemoteAddress ANY -Action Allow | Out-Null
}

if (Get-Service -Name "$name_service" -ErrorAction SilentlyContinue) {
cmd /c "SC STOP ihv5.exe" | Out-Null
}
#-------------- end


#-------------- logo

Write-Host -ForegroundColor Blue "





  _____ _   _ _______ _____              _    _  ____  _    _  _____ ______ 
 |_   _| \ | |__   __|  __ \     /\     | |  | |/ __ \| |  | |/ ____|  ____|
   | | |  \| |  | |  | |__) |   /  \    | |__| | |  | | |  | | (___ | |__   
   | | | . ` |  | |  |  _  /   / /\ \   |  __  | |  | | |  | |\___ \|  __|  
  _| |_| |\  |  | |  | | \ \  / ____ \  | |  | | |__| | |__| |____) | |____ 
 |_____|_| \_|  |_|  |_|  \_\/_/    \_\ |_|  |_|\____/ \____/|_____/|______|



                            Software for Automation Systems                          
--------------------------------------------------------------------------------------

"

#-------------- end


#-------------- check dependencies
Write-Host -ForegroundColor DarkYellow "`r`nCheck dependencies:`r`n"
Write-Host "get 7-Zip"
Invoke-WebRequest -Uri "https://github.com/develar/7zip-bin/raw/master/win/ia32/7za.exe" -OutFile "$root_path\tools\7z.exe"

Write-Host "get script"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/intrahouseio/ih-v5/main/script.js" -OutFile "$root_path\script.js"

#-------------- end


#-------------- download files
Write-Host "get nodeJS"
Invoke-WebRequest -Uri "https://github.com/intrahouseio/ih-v5/releases/download/v0.0.0/node-win-x64.zip" -OutFile "$root_path\node.zip"


#-------------- end


#-------------- deploy
Write-Host -ForegroundColor DarkYellow "`r`nDeploy:`r`n"
cmd /c "$root_path\tools\7z.exe" x -y "$root_path\node.zip" -o"$root_path\"

Remove-Item -Force -Recurse -ErrorAction SilentlyContinue "$root_path\node.zip"
Remove-Item -Force -Recurse -ErrorAction SilentlyContinue "$root_path\install.ps1"

Set-Location "$root_path"
cmd /c "$root_path\node-v14.15.1-win-x64\node.exe" "$root_path\node-v14.15.1-win-x64\node_modules\npm\bin\npm-cli.js" i node-windows --only=prod --no-save --loglevel=error
cmd /c "$root_path\node-v14.15.1-win-x64\node.exe" "$root_path\script.js" intrahouse $lang

#-------------- end
