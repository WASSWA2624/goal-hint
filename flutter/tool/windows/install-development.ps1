#Requires -Version 5.1
param([switch]$DesktopShortcut)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'release-common.ps1')
$null = Assert-WindowsRuntime
foreach ($runtime in @('msvcp140d.dll', 'vcruntime140d.dll', 'vcruntime140_1d.dll', 'ucrtbased.dll')) {
    if (-not (Test-Path -LiteralPath (Join-Path $env:SystemRoot "System32/$runtime"))) {
        throw 'This Debug build requires a developer machine with the Visual Studio C++ Debug runtime installed.'
    }
}
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'development-manifest.json') -Raw | ConvertFrom-Json
if ($manifest.schema -ne 1 -or $manifest.environment -ne 'development' -or $manifest.mode -ne 'debug' -or
    $manifest.appId -ne $script:GoalHintAppId -or $manifest.version -notmatch '^\d+\.\d+\.\d+\+\d+$') { throw 'Invalid development package manifest.' }
$seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
if (@($manifest.files).Count -lt 8 -or @($manifest.files).Count -gt 5000) { throw 'Invalid development payload file count.' }
foreach ($entry in $manifest.files) {
    if (-not $seen.Add([string]$entry.path) -or $entry.sha256 -notmatch '^[0-9a-f]{64}$') { throw 'Invalid development manifest file.' }
    $file = Get-PackagePath $PSScriptRoot $entry.path
    if ((Get-FileDigest $file) -ne $entry.sha256 -or (Get-Item -LiteralPath $file).Length -ne $entry.length) { throw 'Development payload integrity check failed.' }
}
foreach ($required in @('goal_hint.exe', 'flutter_windows.dll', 'WebView2Loader.dll', 'data/icudtl.dat',
    'data/flutter_assets/kernel_blob.bin', 'install.ps1', 'uninstall.ps1', 'release-common.ps1')) {
    if (-not $seen.Contains($required)) { throw "Missing development package file: $required" }
}
foreach ($file in Get-PackageFiles $PSScriptRoot) {
    $relative = $file.FullName.Substring($PSScriptRoot.Length + 1).Replace('\', '/')
    if ($relative -ne 'development-manifest.json' -and -not $seen.Contains($relative)) { throw 'Unlisted development package file.' }
}
$root = Get-FullPath (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs/Goal Hint Development')
Assert-NoReparsePoint $root
Assert-AppClosed $root
$receiptPath = Get-PackagePath $root 'installation.json'
if ((Test-Path -LiteralPath $root) -and @(Get-ChildItem -LiteralPath $root -Force).Count -gt 0) {
    $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    if ($receipt.environment -ne 'development' -or $receipt.appId -ne $script:GoalHintAppId) { throw 'Preserving an unrelated existing installation directory.' }
}
$destination = Get-PackagePath $root ('versions/' + $manifest.version)
if (Test-Path -LiteralPath $destination) { throw 'This development version is already installed. Remove it using its uninstaller before replacing it.' }
$shortcuts = @((Join-Path ([Environment]::GetFolderPath('Programs')) 'Goal Hint Development.lnk'))
if ($DesktopShortcut) { $shortcuts += Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Goal Hint Development.lnk' }
$shell = New-Object -ComObject WScript.Shell
try {
    # Check every destination before copying or changing the managed receipt.
    foreach ($path in $shortcuts) {
        Assert-NoReparsePoint $path
        $shortcut = $shell.CreateShortcut($path)
        if ((Test-Path -LiteralPath $path) -and -not $shortcut.TargetPath.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Preserving an unrelated existing shortcut.' }
    }
    $temporaryRoot = Get-FullPath ([IO.Path]::GetTempPath())
    $staging = Get-PackagePath $temporaryRoot ('GoalHint-development-install-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $staging | Out-Null
    try {
        foreach ($entry in $manifest.files) {
            $target = Get-PackagePath $staging $entry.path
            New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
            Copy-Item -LiteralPath (Get-PackagePath $PSScriptRoot $entry.path) -Destination $target
            if ((Get-FileDigest $target) -ne $entry.sha256) { throw 'Staged development payload integrity check failed.' }
        }
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'development-manifest.json') -Destination $staging
        New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
        $null = Assert-ChildPath $staging $temporaryRoot
        $null = Assert-ChildPath $destination $root
        Move-Item -LiteralPath $staging -Destination $destination
    } finally {
        if (Test-Path -LiteralPath $staging) {
            $directories = @()
            foreach ($relative in @($manifest.files.path) + 'development-manifest.json') {
                $file = Get-PackagePath $staging $relative
                if (Test-Path -LiteralPath $file -PathType Leaf) { Remove-Item -LiteralPath $file }
                $parent = [IO.Path]::GetDirectoryName($file)
                while ($parent -ne $staging) { $directories += $parent; $parent = [IO.Path]::GetDirectoryName($parent) }
            }
            Remove-EmptyPackageDirectories $directories $staging
            $null = Assert-ChildPath $staging $temporaryRoot
            if (@(Get-ChildItem -LiteralPath $staging -Force).Count -eq 0) { Remove-Item -LiteralPath $staging }
        }
    }
    Write-InstallReceipt $root @{ schema = 1; appId = $script:GoalHintAppId; environment = 'development'; version = $manifest.version }
    foreach ($path in $shortcuts) {
        $shortcut = $shell.CreateShortcut($path)
        $shortcut.TargetPath = Join-Path $destination 'goal_hint.exe'
        $shortcut.WorkingDirectory = $destination
        $shortcut.IconLocation = $shortcut.TargetPath + ',0'
        $shortcut.Save()
    }
} finally { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) | Out-Null }
Write-Output "Installed Goal Hint Development $($manifest.version)."
