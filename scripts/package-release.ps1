$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$releaseRoot = Join-Path $projectRoot ('release-check/source-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $releaseRoot | Out-Null
$includeFiles = @('index.html','package.json','package-lock.json','netlify.toml','tsconfig.json','vite.config.ts','README.md','GAME_DESIGN.md','NETLIFY-DEPLOY.md','start-game.bat')
foreach ($file in $includeFiles) { Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $releaseRoot }
foreach ($dir in @('src','server','netlify','scripts')) { Copy-Item -LiteralPath (Join-Path $projectRoot $dir) -Destination $releaseRoot -Recurse }
$zipPath = Join-Path $projectRoot 'netlify-ready-game.zip'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$stream = [IO.File]::Open($zipPath, [IO.FileMode]::Create)
$outputZip = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($source in (Get-ChildItem -LiteralPath $releaseRoot -File -Recurse)) {
    $entryName = $source.FullName.Substring($releaseRoot.Length + 1).Replace('\','/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($outputZip, $source.FullName, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $outputZip.Dispose(); $stream.Dispose() }
$zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $entries = @($zip.Entries | ForEach-Object { $_.FullName })
  if (@($entries | Where-Object { $_.Contains('\') }).Count -gt 0) { throw 'ZIP entries must use portable forward-slash paths' }
  foreach ($required in @('netlify.toml','package.json','package-lock.json','index.html','netlify/functions/game.ts','server/netlify/handler.ts','src/connection.ts')) { if ($entries -notcontains $required) { throw "Missing package entry: $required" } }
  $forbidden = @($entries | Where-Object { $_ -match '(^|/)(node_modules|\.git|\.env|release-check|\.netlify)(/|$)|\.log$' })
  if ($forbidden.Count -gt 0) { throw "Unexpected private/cache content in archive" }
  $report = @{ archive=$zipPath; entries=$entries.Count; bytes=(Get-Item -LiteralPath $zipPath).Length; sha256=(Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash; stagedSource=$releaseRoot; verified=$true }
  $report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $projectRoot 'release-check/archive-report.json')
  $report | ConvertTo-Json
} finally { $zip.Dispose() }
