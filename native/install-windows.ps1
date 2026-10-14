param([ValidateSet('Chrome','Edge','Both')][string]$Browser='Both')
$ErrorActionPreference='Stop'
# Derived from extension/manifest.json public key; checked during build.
$ExtensionId='kejpkbdliekmgpagfceglikahmchoabg'
$destination=Join-Path (Join-Path $env:LOCALAPPDATA 'CipherRoute\native') ([guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $destination -Force | Out-Null
foreach($name in @('cipher-route-host.exe','http-capture-httpcloak.exe','http-capture-httpcloak.json')) {
 $source=Join-Path $PSScriptRoot $name
 if(!(Test-Path -LiteralPath $source)){throw "Missing package file: $name"}
 if([IO.Path]::GetFullPath($source) -ne [IO.Path]::GetFullPath((Join-Path $destination $name))){Copy-Item -LiteralPath $source -Destination $destination -Force}
}
$origin="chrome-extension://$ExtensionId/"
$utf8=New-Object System.Text.UTF8Encoding($false)
$config=@{allowedOrigins=@($origin);dataDir=(Join-Path $env:LOCALAPPDATA 'CipherRoute\data')}
[IO.File]::WriteAllText((Join-Path $destination 'cipher-route-host.config.json'),($config|ConvertTo-Json),$utf8)
$manifest=@{name='io.cipherroute.host';description='CipherRoute TLS forwarding host';path=(Join-Path $destination 'cipher-route-host.exe');type='stdio';allowed_origins=@($origin)}
$manifestPath=Join-Path $destination 'io.cipherroute.host.json'
[IO.File]::WriteAllText($manifestPath,($manifest|ConvertTo-Json),$utf8)
foreach($targetBrowser in $(if($Browser -eq 'Both'){@('Chrome','Edge')}else{@($Browser)})){
$vendor=if($targetBrowser -eq 'Chrome'){'Google\Chrome'}else{'Microsoft\Edge'}
$key="HKCU:\Software\$vendor\NativeMessagingHosts\io.cipherroute.host"
New-Item -Path $key -Force | Out-Null
Set-Item -Path $key -Value $manifestPath
}
Write-Output 'Registered for the fixed CipherRoute extension ID. No CA installed. Reload extension and use Detect local kernel / View CA information.'
