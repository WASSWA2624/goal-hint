#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Origin,
    [string]$Flutter = 'flutter',
    [switch]$SkipBuild,
    [switch]$Force
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'release-common.ps1')
. (Join-Path $PSScriptRoot 'setup-builder.ps1')
$project = Get-FullPath (Join-Path $PSScriptRoot '../..')
$output = Get-FullPath (Join-Path $project '../deploy')
$stagingRoot = Get-PackagePath $output '.staging'
$staging = $null
$uri = $null
if (-not [Uri]::TryCreate($Origin, [UriKind]::Absolute, [ref]$uri) -or
    $uri.Scheme -notin @('http', 'https') -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or
    $uri.AbsolutePath -ne '/' -or $Origin -match '[\s\\]') { throw 'Supply a public development HTTP(S) origin without credentials or path.' }
$Origin = $uri.GetLeftPart([UriPartial]::Authority)
$pin = Get-Content -LiteralPath (Join-Path $project 'release-toolchain.json') -Raw | ConvertFrom-Json
$sdkJson = & $Flutter --version --machine
if ($LASTEXITCODE -ne 0) { throw 'Flutter SDK inspection failed.' }
$sdk = ($sdkJson -join "`n") | ConvertFrom-Json
if ($sdk.frameworkVersion -ne $pin.flutter.version -or $sdk.frameworkRevision -ne $pin.flutter.revision -or
    ($sdk.dartSdkVersion -split ' ')[0] -ne $pin.dart.version) { throw 'Flutter/Dart SDK differs from release-toolchain.json.' }
Push-Location $project
try {
    $pubspec = Get-Content -LiteralPath 'pubspec.yaml' -Raw
    if ($pubspec -notmatch '(?m)^version:\s*(\d+\.\d+\.\d+)\+(\d+)\s*$') { throw 'Expected semantic version plus numeric build number.' }
    $releaseVersion = $Matches[1]
    $version = $Matches[1] + '+' + $Matches[2]
    $releaseName = "goal-hint-windows-$releaseVersion-dev"
    $zip = Get-PackagePath $output ($releaseName + '.zip')
    if ((Test-Path -LiteralPath $zip) -and -not $Force) { throw 'Development ZIP exists. Use -Force to replace it explicitly.' }
    if (-not $SkipBuild) {
        & $Flutter build windows --debug --target=lib/main.dart --dart-define=APP_ENV=development "--dart-define=DEV_APP_ORIGIN=$Origin"
        if ($LASTEXITCODE -ne 0) { throw 'Windows Debug build failed.' }
    }
    $configuration = Get-Content -LiteralPath 'windows/flutter/ephemeral/generated_config.cmake' -Raw
    if ($configuration -notmatch '"FLUTTER_TARGET=lib/main.dart"') { throw 'Expected the normal development application entry point.' }
    $encoded = [regex]::Match($configuration, '"DART_DEFINES=([^"\r\n]+)"').Groups[1].Value
    $defines = @($encoded.Split(',') | ForEach-Object { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($_)) })
    if ('APP_ENV=development' -notin $defines -or "DEV_APP_ORIGIN=$Origin" -notin $defines) { throw 'Debug build does not match the requested development origin.' }
    $bundle = Join-Path $project 'build/windows/x64/runner/Debug'
    foreach ($relative in @('goal_hint.exe', 'flutter_windows.dll', 'WebView2Loader.dll', 'data/icudtl.dat', 'data/flutter_assets/kernel_blob.bin')) {
        if (-not (Test-Path -LiteralPath (Get-PackagePath $bundle $relative) -PathType Leaf)) { throw "Missing Debug output: $relative" }
    }
    if ((Get-Item -LiteralPath (Join-Path $bundle 'goal_hint.exe')).VersionInfo.ProductVersion -ne $version) { throw 'Debug executable version differs from pubspec.yaml.' }
    $staging = Get-PackagePath $stagingRoot ('windows-dev-' + [Guid]::NewGuid().ToString('N'))
    $payload = Get-PackagePath $staging 'payload'
    New-Item -ItemType Directory -Path $payload -Force | Out-Null
    $null = @(Get-PackageFiles $bundle)
    Copy-Item -LiteralPath (Join-Path $bundle 'goal_hint.exe') -Destination $payload
    Get-ChildItem -LiteralPath $bundle -Filter '*.dll' -File | Copy-Item -Destination $payload
    Copy-Item -LiteralPath (Join-Path $bundle 'data') -Destination $payload -Recurse
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'install-development.ps1') -Destination (Join-Path $payload 'install.ps1')
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'uninstall-development.ps1') -Destination (Join-Path $payload 'uninstall.ps1')
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'release-common.ps1') -Destination $payload
    $base = (Get-FullPath $payload) + [IO.Path]::DirectorySeparatorChar
    $files = @(Get-PackageFiles $payload | Sort-Object FullName | ForEach-Object {
        [ordered]@{ path = $_.FullName.Substring($base.Length).Replace('\', '/'); length = $_.Length; sha256 = Get-FileDigest $_.FullName }
    })
    if (@($files | Where-Object { $_.path -match '(?i)(?:^|/)\.env|\.(?:pdb|jks|keystore)$|integration_test|(?:msvcp140d|vcruntime140d|vcruntime140_1d|ucrtbased)\.dll$' }).Count) {
        throw 'Private files, symbols, test targets and non-redistributable Debug CRT must not enter the development bundle.'
    }
    $manifest = [ordered]@{
        schema = 1; platform = 'windows'; appId = $script:GoalHintAppId; mode = 'debug'; environment = 'development'
        version = $version; origin = $Origin; entryPoint = 'lib/main.dart'; architecture = 'x64'
        sourceRevision = (& git rev-parse HEAD).Trim(); skippedBuild = [bool]$SkipBuild
        sourceDirty = @(& git status --porcelain=v1 --untracked-files=all).Count -gt 0
        toolchain = [ordered]@{ flutter = $sdk.frameworkVersion; dart = ($sdk.dartSdkVersion -split ' ')[0] }
        files = $files
    }
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $payload 'development-manifest.json') -Encoding UTF8
    $installer = Get-PackagePath $staging 'installer'
    $delivery = Get-PackagePath $staging 'delivery'
    New-Item -ItemType Directory -Path $installer, $delivery | Out-Null
    Compress-Archive -LiteralPath $payload -DestinationPath (Join-Path $installer 'payload.zip') -CompressionLevel Optimal
    New-GoalHintSetup $installer (Join-Path $delivery "Goal-Hint-Development-Setup-$releaseVersion.exe")
    @"
Goal Hint $releaseVersion WINDOWS DEVELOPMENT BUILD (Debug x64)
Extract this ZIP, then run Goal-Hint-Development-Setup-$releaseVersion.exe.
Requires the development website at $Origin, WebView2 Runtime, and Visual Studio C++ Debug runtime on the developer's computer.
Start the website using npm --prefix next-js run dev.
Installs separately under LocalAppData/Programs/Goal Hint Development with separate shortcuts.
No Debug CRT DLLs are redistributed. This unsigned installer is for developer machines, not production distribution.
"@ | Set-Content -LiteralPath (Join-Path $delivery 'README.txt') -Encoding UTF8
    Copy-Item -LiteralPath (Join-Path $payload 'development-manifest.json') -Destination $delivery
    $temporaryZip = Join-Path $staging ($releaseName + '.zip')
    Compress-Archive -Path (Join-Path $delivery '*') -DestinationPath $temporaryZip -CompressionLevel Optimal
    $checksum = Join-Path $staging ($releaseName + '.zip.sha256')
    (Get-FileDigest $temporaryZip) + '  ' + [IO.Path]::GetFileName($zip) | Set-Content -LiteralPath $checksum -Encoding ASCII
    Move-Item -LiteralPath $temporaryZip -Destination $zip -Force:$Force
    Move-Item -LiteralPath $checksum -Destination ($zip + '.sha256') -Force:$Force
    Write-Output "Archive: $zip"
} finally {
    Pop-Location
    if ($staging -and (Test-Path -LiteralPath $staging)) {
        $safe = Assert-ChildPath $staging $stagingRoot
        Remove-Item -LiteralPath $safe -Recurse -Force
    }
}
