$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Write-PortableZip($zipPath, $root, $files) {
  $zip = [IO.Compression.ZipArchive]::new([IO.File]::Open($zipPath,[IO.FileMode]::Create),[IO.Compression.ZipArchiveMode]::Create)
  try { foreach ($file in $files) {
    $name = $file.FullName.Substring($root.Length+1).Replace('\','/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$file.FullName,$name,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
  } } finally { $zip.Dispose() }
}
$files = @('package.json','package-lock.json','tsconfig.json','vite.config.ts' | ForEach-Object { Get-Item -LiteralPath (Join-Path $projectRoot $_) })
foreach ($dir in @('src','server','netlify','scripts')) { $files += @(Get-ChildItem -LiteralPath (Join-Path $projectRoot $dir) -File -Recurse) }
Write-PortableZip (Join-Path $projectRoot 'cloud-backend.zip') $projectRoot $files
$frontRoot = Join-Path $projectRoot 'release-check/cloud-frontend'
if (Test-Path -LiteralPath (Join-Path $frontRoot 'index.html')) {
 Write-PortableZip (Join-Path $projectRoot 'netlify-cloud-frontend.zip') $frontRoot @(Get-ChildItem -LiteralPath $frontRoot -File -Recurse)
}
