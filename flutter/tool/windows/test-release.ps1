#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'release-common.ps1')
$project = Get-FullPath (Join-Path $PSScriptRoot '../..')
$testRoot = Get-PackagePath (Join-Path $project '.dart_tool') ('windows-release-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$script:checks = 0
function Assert-Throws([scriptblock]$Action) {
    $failed = $false
    try { & $Action | Out-Null } catch { $failed = $true }
    if (-not $failed) { throw 'Expected the operation to reject unsafe input.' }
    $script:checks++
}
function Assert-True([bool]$Value) {
    if (-not $Value) { throw 'Assertion failed.' }
    $script:checks++
}

$bundle = Get-PackagePath $testRoot 'bundle'
New-Item -ItemType Directory -Path $bundle | Out-Null
$manifest = [ordered]@{
    schema = 1; appId = $script:GoalHintAppId; displayName = 'Goal Hint'; version = '0.1.0+1'
    architecture = 'x64'; mode = 'release'; origin = $script:GoalHintOrigin; entryPoint = 'lib/main.dart'
    files = @()
}
foreach ($name in @('goal_hint.exe', 'flutter_windows.dll', 'WebView2Loader.dll', 'msvcp140.dll',
    'vcruntime140.dll', 'vcruntime140_1.dll', 'data/app.so', 'data/icudtl.dat',
    'install.ps1', 'uninstall.ps1', 'release-common.ps1')) {
    $file = Get-PackagePath $bundle $name
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($file)) -Force | Out-Null
    [IO.File]::WriteAllText($file, 'synthetic fixture, not an executable')
    $manifest.files += [ordered]@{ path = $name; length = (Get-Item -LiteralPath $file).Length; sha256 = Get-FileDigest $file }
}
function Write-TestManifest {
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $bundle 'manifest.json') -Encoding UTF8
}
Write-TestManifest
$null = Read-ReleaseManifest $bundle -VerifyFiles
$script:checks++

foreach ($path in @('../outside', 'data/../../outside', '/absolute', 'data\outside', 'C:/outside',
    'data//file', 'data/./file', 'data/name.', 'data/name ', 'data/NUL.txt', 'data/COM1', 'data/file:stream')) {
    Assert-Throws { Get-PackagePath $bundle $path }
}
Assert-Throws { Assert-ChildPath ($bundle + '-sibling/file') $bundle }
Assert-Throws { Assert-ChildPath $bundle $bundle }

$saved = $manifest.files[0].path
$manifest.files[0].path = '../outside'
Write-TestManifest
Assert-Throws { Read-ReleaseManifest $bundle -VerifyFiles }
$manifest.files[0].path = $saved
$manifest.files += $manifest.files[0]
Write-TestManifest
Assert-Throws { Read-ReleaseManifest $bundle -VerifyFiles }
$manifest.files = @($manifest.files | Select-Object -SkipLast 1)
Write-TestManifest
[IO.File]::WriteAllText((Join-Path $bundle 'goal_hint.exe'), 'changed')
Assert-Throws { Read-ReleaseManifest $bundle -VerifyFiles }
$manifest.files[0].length = (Get-Item -LiteralPath (Join-Path $bundle 'goal_hint.exe')).Length
$manifest.files[0].sha256 = Get-FileDigest (Join-Path $bundle 'goal_hint.exe')
Write-TestManifest
[IO.File]::WriteAllText((Join-Path $bundle 'unknown.txt'), 'preserve me')
Assert-Throws { Read-ReleaseManifest $bundle -VerifyFiles }
Remove-Item -LiteralPath (Get-PackagePath $bundle 'unknown.txt')
$manifest.origin = 'http://localhost:3000'
Write-TestManifest
Assert-Throws { Read-ReleaseManifest $bundle }
$manifest.origin = $script:GoalHintOrigin
Write-TestManifest

$outside = Get-PackagePath $testRoot 'outside'
New-Item -ItemType Directory -Path $outside | Out-Null
[IO.File]::WriteAllText((Join-Path $outside 'keep.txt'), 'outside link target')
$junction = Get-PackagePath $bundle 'linked'
New-Item -ItemType Junction -Path $junction -Target $outside | Out-Null
Assert-Throws { Get-PackagePath $bundle 'linked/keep.txt' }
Assert-Throws { Get-PackageFiles $bundle }
[IO.Directory]::Delete($junction)
Assert-True (Test-Path -LiteralPath (Join-Path $outside 'keep.txt'))

$known = Get-PackagePath $bundle 'known-empty'
$sameLength = Get-PackagePath $bundle 'other-empty'
$unknown = Get-PackagePath $bundle 'unknown-empty'
New-Item -ItemType Directory -Path $known, $sameLength, $unknown | Out-Null
Remove-EmptyPackageDirectories @($known, $sameLength, $known) $bundle
Assert-True (-not (Test-Path -LiteralPath $known))
Assert-True (-not (Test-Path -LiteralPath $sameLength))
Assert-True (Test-Path -LiteralPath $unknown)
Assert-Throws { Remove-EmptyPackageDirectories @($outside) $bundle }

$receiptRoot = Get-PackagePath $testRoot 'receipt'
New-Item -ItemType Directory -Path $receiptRoot | Out-Null
$receipt = [ordered]@{ schema = 1; appId = $script:GoalHintAppId; version = '0.1.0+1' }
Write-InstallReceipt $receiptRoot $receipt
Assert-True ((Read-InstallReceipt $receiptRoot).version -eq '0.1.0+1')
$outsideReceipt = Get-PackagePath $outside 'receipt.json'
Copy-Item -LiteralPath (Join-Path $receiptRoot 'installation.json') -Destination $outsideReceipt
Remove-Item -LiteralPath (Get-PackagePath $receiptRoot 'installation.json')
# Directory junctions require no administrator privilege. A linked receipt root
# must be rejected before either read or atomic write, leaving its target intact.
$receiptLink = Get-PackagePath $testRoot 'linked-receipt'
New-Item -ItemType Junction -Path $receiptLink -Target $outside | Out-Null
Assert-Throws { Read-InstallReceipt $receiptLink }
Assert-Throws { Write-InstallReceipt $receiptLink $receipt }
[IO.Directory]::Delete($receiptLink)
Assert-True ((Get-Content -LiteralPath $outsideReceipt -Raw | ConvertFrom-Json).version -eq '0.1.0+1')

$pin = [pscustomobject]@{ flutter = [pscustomobject]@{ version = '3.44.6'; revision = 'ee80f08bbf97172ec030b8751ceab557177a34a6' }; dart = [pscustomobject]@{ version = '3.12.2' } }
function New-TestConfiguration([string[]]$Defines, [string]$Target = 'lib/main.dart') {
    $encoded = @($Defines | ForEach-Object { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($_)) }) -join ','
    '"FLUTTER_TARGET=' + $Target + '"' + "`n" + '"DART_DEFINES=' + $encoded + '"'
}
$defines = @('APP_ENV=production', 'FLUTTER_VERSION=3.44.6', 'FLUTTER_DART_VERSION=3.12.2', 'FLUTTER_FRAMEWORK_REVISION=ee80f08bbf')
Assert-ProductionBuildConfiguration (New-TestConfiguration $defines) $pin
$script:checks++
Assert-Throws { Assert-ProductionBuildConfiguration (New-TestConfiguration $defines 'integration_test/identity_test.dart') $pin }
Assert-Throws { Assert-ProductionBuildConfiguration (New-TestConfiguration ($defines + 'DEV_APP_ORIGIN=http://localhost:3000')) $pin }
Assert-Throws { Assert-ProductionBuildConfiguration (New-TestConfiguration ($defines + 'APP_ENV=production')) $pin }
Assert-Throws { Assert-ProductionBuildConfiguration (New-TestConfiguration ($defines -replace 'ee80f08bbf', 'aaaaaaaaaa')) $pin }
$originalRuntime = (Get-Item Function:Get-WebView2Version).ScriptBlock
try {
    function Get-WebView2Version { $null }
    Assert-Throws { Assert-WindowsRuntime }
} finally { Set-Item Function:Get-WebView2Version $originalRuntime }

# Test output lives below this known ignored directory. Avoid recursive deletion;
# delete only enumerated fixture files, then remove known directories if empty.
$null = Assert-ChildPath $testRoot (Join-Path $project '.dart_tool')
$directories = @($bundle, $outside, $unknown, $receiptRoot, (Join-Path $bundle 'data'))
foreach ($file in @(Get-PackageFiles $testRoot)) {
    $safe = Assert-ChildPath $file.FullName $testRoot
    Remove-Item -LiteralPath $safe
}
Remove-EmptyPackageDirectories $directories $testRoot
if (@(Get-ChildItem -LiteralPath $testRoot -Force).Count -eq 0) { Remove-Item -LiteralPath $testRoot }
Write-Output "$script:checks Windows release safety checks passed."
