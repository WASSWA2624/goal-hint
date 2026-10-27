#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$Flutter = 'flutter',
    [Parameter(Mandatory = $true)][string]$RedistDirectory,
    [switch]$SkipBuild,
    [switch]$Force
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'release-common.ps1')
. (Join-Path $PSScriptRoot 'setup-builder.ps1')
$project = Get-FullPath (Join-Path $PSScriptRoot '../..')
$pin = Get-Content -LiteralPath (Join-Path $project 'release-toolchain.json') -Raw | ConvertFrom-Json
$sdkJson = & $Flutter --version --machine
if ($LASTEXITCODE -ne 0) { throw 'Flutter SDK inspection failed.' }
$sdk = ($sdkJson -join "`n") | ConvertFrom-Json
if ($sdk.frameworkVersion -ne $pin.flutter.version -or $sdk.frameworkRevision -ne $pin.flutter.revision -or
    ($sdk.dartSdkVersion -split ' ')[0] -ne $pin.dart.version) {
    throw 'Flutter/Dart SDK differs from release-toolchain.json.'
}

$staging = $null
Push-Location $project
try {
    if (-not $SkipBuild) {
        & $Flutter build windows --release --target=lib/main.dart --dart-define=APP_ENV=production
        if ($LASTEXITCODE -ne 0) { throw 'Windows Release build failed.' }
    }
    # The generated native configuration must describe this normal entry point,
    # production environment and toolchain, even when packaging a previous build.
    $config = Get-Content -LiteralPath 'windows/flutter/ephemeral/generated_config.cmake' -Raw
    Assert-ProductionBuildConfiguration $config $pin
    $bundle = Join-Path $project 'build/windows/x64/runner/Release'
    $exe = Join-Path $bundle 'goal_hint.exe'
    foreach ($required in @('goal_hint.exe', 'flutter_windows.dll', 'WebView2Loader.dll', 'data/app.so', 'data/icudtl.dat')) {
        if (-not (Test-Path -LiteralPath (Get-PackagePath $bundle $required) -PathType Leaf)) {
            throw "Missing Release build output: $required"
        }
    }
    $pubspec = Get-Content -LiteralPath 'pubspec.yaml' -Raw
    if ($pubspec -notmatch '(?m)^version:\s*(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\+\d+)\s*$') { throw 'Expected semantic version plus numeric build number.' }
    $version = $Matches[1]
    if ((Get-Item -LiteralPath $exe).VersionInfo.ProductVersion -ne $version -or
        (Get-Item -LiteralPath $exe).VersionInfo.ProductName -ne 'Goal Hint') {
        throw 'Executable identity/version differs from pubspec.yaml.'
    }
    $redist = Get-FullPath $RedistDirectory
    Assert-NoReparsePoint $redist
    if ($redist.Replace('\', '/') -notmatch '/VC/Redist/MSVC/[0-9.]+/x64/Microsoft\.VC[0-9]+\.CRT$') {
        throw 'Use the x64 CRT directory under the installed Visual Studio VC/Redist/MSVC version, not System32 or Debug files.'
    }
    foreach ($required in @('msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll')) {
        if (-not (Test-Path -LiteralPath (Join-Path $redist $required) -PathType Leaf)) { throw "Missing redistributable: $required" }
    }
    $releaseVersion = ($version -split '\+')[0]
    $releaseName = "goal-hint-windows-$releaseVersion"
    $output = Get-FullPath (Join-Path $project '../deploy')
    $stagingRoot = Get-PackagePath $output '.staging'
    $staging = Get-PackagePath $stagingRoot ('windows-' + [Guid]::NewGuid().ToString('N'))
    $package = Get-PackagePath $staging 'payload'
    $zip = Get-PackagePath $output ($releaseName + '.zip')
    if ((Test-Path -LiteralPath $zip) -and -not $Force) {
        throw 'Release archive already exists. Use -Force to replace the unpublished package explicitly.'
    }
    # Traverse before copying to reject linked assets and unexpected files.
    $null = @(Get-PackageFiles $bundle)
    New-Item -ItemType Directory -Path $package -Force | Out-Null
    Copy-Item -LiteralPath $exe -Destination $package
    Get-ChildItem -LiteralPath $bundle -Filter '*.dll' -File | Copy-Item -Destination $package
    Copy-Item -LiteralPath (Join-Path $bundle 'data') -Destination $package -Recurse
    $crtFiles = @(Get-ChildItem -LiteralPath $redist -Filter '*.dll' -File)
    foreach ($file in $crtFiles) {
        $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
        if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation(?:,|$)') {
            throw "Redistributable must have a valid Microsoft signature: $($file.Name)"
        }
        Copy-Item -LiteralPath $file.FullName -Destination $package
    }
    foreach ($script in @('install.ps1', 'uninstall.ps1', 'release-common.ps1')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $script) -Destination $package
    }
    @'
Goal Hint - unsigned Windows x64 production candidate
Verify the ZIP SHA256 supplied separately, extract it, and review manifest.json.
From the extracted directory run: powershell -File .\install.ps1
Use -DesktopShortcut to also create a desktop shortcut.
The installer requires x64 Windows and Microsoft Edge WebView2 Evergreen Runtime.
It makes no network downloads, certificate changes or administrator changes.
The bundled Microsoft Visual C++ runtime DLLs use application-local deployment;
the application publisher must ship updated bundles when those libraries change.
Microsoft redistribution terms: https://learn.microsoft.com/cpp/windows/redistributing-visual-cpp-files
Windows release guide: https://docs.flutter.dev/platform-integration/windows/building
The public web origin is https://goalhint.com. Runtime cookies and offline content
remain in the existing app support profile, outside the installation directory.
Start Goal Hint from its Start Menu shortcut. Close it before updating/removing.
Uninstall with the uninstall.ps1 in the installed version directory. It removes
only manifest-owned files and app-owned shortcuts, preserving unknown files and
the browser profile. This ZIP is not an MSIX, signed installer or store release.
'@ | Set-Content -LiteralPath (Join-Path $package 'README.txt') -Encoding UTF8
    $base = (Get-FullPath $package) + [IO.Path]::DirectorySeparatorChar
    $files = @(Get-PackageFiles $package | Sort-Object FullName | ForEach-Object {
        [ordered]@{ path = $_.FullName.Substring($base.Length).Replace('\', '/'); length = $_.Length; sha256 = Get-FileDigest $_.FullName }
    })
    if (@($files | Where-Object { $_.path -match '(?i)(?:^|/)(?:\.env[^/]*|kernel_blob\.bin|vm_snapshot_data|isolate_snapshot_data)$|\.(?:pdb|dill|jks|keystore)$|integration_test' }).Count -gt 0) {
        throw 'Debug, test or private files are not allowed in the release bundle.'
    }
    $revision = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Source revision inspection failed.' }
    $dirty = @(& git status --porcelain=v1 --untracked-files=all).Count -gt 0
    $manifest = [ordered]@{
        schema = 1; appId = $script:GoalHintAppId; displayName = 'Goal Hint'; version = $version
        architecture = 'x64'; mode = 'release'; origin = $script:GoalHintOrigin; entryPoint = 'lib/main.dart'
        createdUtc = [DateTime]::UtcNow.ToString('o'); signed = $false
        source = [ordered]@{ revision = $revision; dirty = $dirty }
        toolchain = [ordered]@{ flutter = $sdk.frameworkVersion; revision = $sdk.frameworkRevision; dart = ($sdk.dartSdkVersion -split ' ')[0] }
        buildConfiguration = [ordered]@{ sha256 = Get-FileDigest (Join-Path $project 'windows/flutter/ephemeral/generated_config.cmake'); skippedBuild = [bool]$SkipBuild }
        visualCRuntime = [ordered]@{ version = (Get-Item -LiteralPath (Join-Path $redist 'msvcp140.dll')).VersionInfo.FileVersion; deployment = 'application-local' }
        files = $files
    }
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $package 'manifest.json') -Encoding UTF8
    $null = Read-ReleaseManifest $package -VerifyFiles
    # The setup host wraps the verified per-user installer in a real EXE.
    # Build work stays in deploy/.staging; the only deliverable is the outer ZIP.
    $installer = Get-PackagePath $staging 'installer'
    New-Item -ItemType Directory -Path $installer | Out-Null
    Compress-Archive -LiteralPath $package -DestinationPath (Join-Path $installer 'payload.zip') -CompressionLevel Optimal
    $delivery = Get-PackagePath $staging 'delivery'
    New-Item -ItemType Directory -Path $delivery | Out-Null
    $setup = Join-Path $delivery ('Goal-Hint-Setup-' + $releaseVersion + '.exe')
    New-GoalHintSetup $installer $setup
    @"
Goal Hint $releaseVersion for Windows x64
Extract this ZIP, then run Goal-Hint-Setup-$releaseVersion.exe.
The unsigned setup installs for the current user using the bundled verified installer.
Microsoft Edge WebView2 Evergreen Runtime is required.
Source version: $version; production origin: https://goalhint.com.
"@ | Set-Content -LiteralPath (Join-Path $delivery 'README.txt') -Encoding UTF8
    $temporaryZip = Join-Path $staging ($releaseName + '.zip')
    Compress-Archive -Path (Join-Path $delivery '*') -DestinationPath $temporaryZip -CompressionLevel Optimal
    $checksum = Join-Path $staging ($releaseName + '.zip.sha256')
    (Get-FileDigest $temporaryZip) + '  ' + [IO.Path]::GetFileName($zip) | Set-Content -LiteralPath $checksum -Encoding ASCII
    Move-Item -LiteralPath $temporaryZip -Destination $zip -Force:$Force
    Move-Item -LiteralPath $checksum -Destination ($zip + '.sha256') -Force:$Force
    Write-Output "Archive: $zip"
    Write-Output "SHA256: $(Get-FileDigest $zip)"
    Write-Output "Source: $revision (dirty=$dirty); unsigned candidate, not a published release."
} finally {
    Pop-Location
    if ($staging -and (Test-Path -LiteralPath $staging)) {
        $safeStaging = Assert-ChildPath $staging $stagingRoot
        Remove-Item -LiteralPath $safeStaging -Recurse -Force
    }
}
