#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'release-common.ps1')
$root = Get-FullPath (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs/Goal Hint Development')
$null = Assert-ChildPath $PSScriptRoot $root
Assert-AppClosed $root
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'development-manifest.json') -Raw | ConvertFrom-Json
if ($manifest.environment -ne 'development' -or $manifest.appId -ne $script:GoalHintAppId -or
    (Get-FullPath $PSScriptRoot) -ne (Get-PackagePath $root ('versions/' + $manifest.version))) { throw 'Invalid managed development installation.' }
$shell = New-Object -ComObject WScript.Shell
try {
    foreach ($folder in @('Programs', 'DesktopDirectory')) {
        $shortcut = Join-Path ([Environment]::GetFolderPath($folder)) 'Goal Hint Development.lnk'
        if ((Test-Path -LiteralPath $shortcut) -and $shell.CreateShortcut($shortcut).TargetPath.StartsWith($PSScriptRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $shortcut }
    }
} finally { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) | Out-Null }
$directories = @()
foreach ($relative in @($manifest.files.path) + 'development-manifest.json') {
    $file = Get-PackagePath $PSScriptRoot $relative
    if (Test-Path -LiteralPath $file -PathType Leaf) { Remove-Item -LiteralPath $file }
    $parent = [IO.Path]::GetDirectoryName($file)
    while ($parent -ne $PSScriptRoot) { $directories += $parent; $parent = [IO.Path]::GetDirectoryName($parent) }
}
Remove-EmptyPackageDirectories $directories $PSScriptRoot
if (@(Get-ChildItem -LiteralPath $PSScriptRoot -Force).Count -eq 0) { Remove-Item -LiteralPath $PSScriptRoot }
$receipt = Join-Path $root 'installation.json'
if ((Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json).version -eq $manifest.version) { Remove-Item -LiteralPath $receipt }
Write-Output 'Removed the development application files and shortcuts. Browser profile data is preserved.'
