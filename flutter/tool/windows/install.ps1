#Requires -Version 5.1
[CmdletBinding()]
param([switch]$DesktopShortcut)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'release-common.ps1')

$runtime = Assert-WindowsRuntime
$manifest = Read-ReleaseManifest $PSScriptRoot -VerifyFiles
$root = Get-GoalHintInstallRoot
Assert-NoReparsePoint $root
Assert-AppClosed $root
if (Test-Path -LiteralPath $root) {
    if (@(Get-ChildItem -LiteralPath $root -Force).Count -gt 0) { $null = Read-InstallReceipt $root }
}

$shortcutFiles = @((Join-Path ([Environment]::GetFolderPath('Programs')) 'Goal Hint.lnk'))
if ($DesktopShortcut) { $shortcutFiles += Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Goal Hint.lnk' }
$shell = New-Object -ComObject WScript.Shell
try {
    foreach ($shortcutFile in $shortcutFiles) {
        Assert-NoReparsePoint $shortcutFile
        $shortcut = $shell.CreateShortcut($shortcutFile)
        if ((Test-Path -LiteralPath $shortcutFile) -and
            -not $shortcut.TargetPath.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) {
            throw "A different shortcut already exists: $shortcutFile"
        }
    }
} finally { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) | Out-Null }

$destination = Get-PackagePath $root ('versions/' + $manifest.version)
if (Test-Path -LiteralPath $destination) {
    $null = Read-ReleaseManifest $destination -VerifyFiles
    if ((Get-FileDigest (Join-Path $destination 'manifest.json')) -ne
        (Get-FileDigest (Join-Path $PSScriptRoot 'manifest.json'))) {
        throw 'This native version is already installed with different contents. Increment the pubspec build number.'
    }
} else {
    # Complete and verify a private staging directory before changing the active
    # installation. A failed copy never overwrites an earlier native version.
    $temporaryRoot = Get-FullPath ([IO.Path]::GetTempPath())
    $staging = Get-PackagePath $temporaryRoot ('GoalHint-install-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $staging | Out-Null
    try {
        foreach ($entry in $manifest.files) {
            $source = Get-PackagePath $PSScriptRoot $entry.path
            $target = Get-PackagePath $staging $entry.path
            New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
            Copy-Item -LiteralPath $source -Destination $target
        }
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Destination $staging
        $null = Read-ReleaseManifest $staging -VerifyFiles
        New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
        $null = Assert-ChildPath $staging $temporaryRoot
        $null = Assert-ChildPath $destination $root
        Move-Item -LiteralPath $staging -Destination $destination
    } finally {
        if (Test-Path -LiteralPath $staging) {
            # Only paths this copy created may be removed; preserve anything else.
            $directories = @()
            foreach ($relative in @($manifest.files.path) + 'manifest.json') {
                $file = Get-PackagePath $staging $relative
                if (Test-Path -LiteralPath $file -PathType Leaf) { Remove-Item -LiteralPath $file }
                $parent = [IO.Path]::GetDirectoryName($file)
                while ($parent -ne $staging) {
                    $directories += $parent
                    $parent = [IO.Path]::GetDirectoryName($parent)
                }
            }
            Remove-EmptyPackageDirectories $directories $staging
            $null = Assert-ChildPath $staging $temporaryRoot
            if (@(Get-ChildItem -LiteralPath $staging -Force).Count -eq 0) { Remove-Item -LiteralPath $staging }
        }
    }
}

$executable = Join-Path $destination 'goal_hint.exe'
$receipt = [ordered]@{
    schema = 1; appId = $script:GoalHintAppId; version = $manifest.version
    installedUtc = [DateTime]::UtcNow.ToString('o'); webView2 = $runtime
}
Write-InstallReceipt $root $receipt
$shell = New-Object -ComObject WScript.Shell
try {
    # Never replace another app's shortcut, including an older manual install.
    foreach ($shortcutFile in $shortcutFiles) {
        Assert-NoReparsePoint $shortcutFile
        $shortcut = $shell.CreateShortcut($shortcutFile)
        if ((Test-Path -LiteralPath $shortcutFile) -and
            -not $shortcut.TargetPath.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) {
            throw "A different shortcut already exists: $shortcutFile"
        }
    }
    foreach ($shortcutFile in $shortcutFiles) {
        $shortcut = $shell.CreateShortcut($shortcutFile)
        $shortcut.TargetPath = $executable
        $shortcut.Arguments = ''
        $shortcut.WorkingDirectory = $destination
        $shortcut.IconLocation = "$executable,0"
        $shortcut.Description = 'Goal Hint'
        $shortcut.Save()
    }
} finally { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) | Out-Null }

Write-Output "Installed Goal Hint $($manifest.version) for this user."
Write-Output "Run: $executable"
Write-Output "Uninstall: powershell -File `"$(Join-Path $destination 'uninstall.ps1')`""
Write-Output 'Browser profiles and previous managed versions are preserved.'
