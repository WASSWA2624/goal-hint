#Requires -Version 5.1
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'release-common.ps1')

$root = Get-GoalHintInstallRoot
$receipt = Read-InstallReceipt $root
Assert-AppClosed $root
$versionsRoot = Get-PackagePath $root 'versions'
$versions = @()
foreach ($directory in Get-ChildItem -LiteralPath $versionsRoot -Directory -Force) {
    $safe = Assert-ChildPath $directory.FullName $versionsRoot
    if (Test-Path -LiteralPath (Join-Path $safe 'manifest.json') -PathType Leaf) {
        $manifest = Read-ReleaseManifest $safe
        if ($manifest.version -ne $directory.Name) { throw 'Managed version directory does not match its manifest.' }
        $versions += [pscustomobject]@{ root = $safe; manifest = $manifest }
    }
}
if ($receipt.version -notin @($versions | ForEach-Object { $_.manifest.version })) {
    throw 'Active managed version is missing; retain files for manual recovery.'
}

$shell = New-Object -ComObject WScript.Shell
try {
    foreach ($folder in @('Programs', 'DesktopDirectory')) {
        $file = Join-Path ([Environment]::GetFolderPath($folder)) 'Goal Hint.lnk'
        Assert-NoReparsePoint $file
        if (Test-Path -LiteralPath $file -PathType Leaf) {
            $shortcut = $shell.CreateShortcut($file)
            if ($shortcut.TargetPath.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) {
                Remove-Item -LiteralPath $file
            }
        }
    }
} finally { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) | Out-Null }

foreach ($version in $versions) {
    # Each path is validated against the fixed per-user install root immediately
    # before deletion. Unlisted files and all external browser data stay intact.
    $directories = @($version.root)
    foreach ($entry in $version.manifest.files) {
        $file = Get-PackagePath $version.root $entry.path
        $null = Assert-ChildPath $file $root
        if (Test-Path -LiteralPath $file -PathType Leaf) { Remove-Item -LiteralPath $file }
        $parent = [IO.Path]::GetDirectoryName($file)
        while ($parent -ne $version.root) {
            $directories += $parent
            $parent = [IO.Path]::GetDirectoryName($parent)
        }
    }
    $manifestFile = Get-PackagePath $version.root 'manifest.json'
    Remove-Item -LiteralPath $manifestFile
    Remove-EmptyPackageDirectories $directories $root
}
Remove-EmptyPackageDirectories @($versionsRoot) $root
$receiptFile = Get-PackagePath $root 'installation.json'
Remove-Item -LiteralPath $receiptFile
if (@(Get-ChildItem -LiteralPath $root -Force).Count -eq 0) { Remove-Item -LiteralPath $root }
else { Write-Warning "Unlisted files remain untouched in $root" }
Write-Output 'Goal Hint application files removed. Browser profiles were retained.'
