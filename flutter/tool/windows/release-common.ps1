#Requires -Version 5.1
Set-StrictMode -Version Latest

$script:GoalHintAppId = 'com.goalhint.goal_hint'
$script:GoalHintOrigin = 'https://goalhint.com'

function Get-FullPath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if ($full -eq [IO.Path]::GetPathRoot($full)) { return $full }
    $full.TrimEnd([char[]]'\/')
}

function Assert-NoReparsePoint([string]$Path) {
    $current = Get-FullPath $Path
    while ($current) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Linked paths are not accepted: $current"
            }
        }
        $parent = [IO.Path]::GetDirectoryName($current)
        if ($parent -eq $current) { break }
        $current = $parent
    }
}

function Assert-ChildPath([string]$Path, [string]$Root) {
    $full = Get-FullPath $Path
    $base = (Get-FullPath $Root) + [IO.Path]::DirectorySeparatorChar
    if (-not $full.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path must remain inside $Root"
    }
    Assert-NoReparsePoint $full
    $full
}

function Get-PackagePath([string]$Root, [string]$RelativePath) {
    if ([string]::IsNullOrWhiteSpace($RelativePath) -or $RelativePath.Contains('\') -or
        $RelativePath.Contains(':') -or $RelativePath.StartsWith('/')) {
        throw 'Invalid package-relative path.'
    }
    foreach ($part in $RelativePath.Split('/')) {
        if ($part -in @('', '.', '..') -or $part -match '[<>"|?*\x00-\x1f]' -or
            $part -match '[. ]$' -or $part -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)') {
            throw 'Invalid package path segment.'
        }
    }
    Assert-ChildPath (Join-Path $Root $RelativePath) $Root
}

function Get-PackageFiles([string]$Root) {
    Assert-NoReparsePoint $Root
    foreach ($item in Get-ChildItem -LiteralPath $Root -Force) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw "Linked package content is not accepted: $($item.FullName)"
        }
        if ($item.PSIsContainer) { Get-PackageFiles $item.FullName }
        else { $item }
    }
}

function Get-FileDigest([string]$Path) {
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-ProductionBuildConfiguration([string]$Configuration, [object]$Pin) {
    $target = [regex]::Matches($Configuration, '"FLUTTER_TARGET=([^"\r\n]+)"')
    $encoded = [regex]::Matches($Configuration, '"DART_DEFINES=([^"\r\n]+)"')
    if ($target.Count -ne 1 -or $target[0].Groups[1].Value -ne 'lib/main.dart' -or $encoded.Count -ne 1) {
        throw 'The native configuration must select the normal lib/main.dart entry point.'
    }
    $defines = @{}
    foreach ($value in $encoded[0].Groups[1].Value.Split(',')) {
        $decoded = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($value))
        $parts = $decoded -split '=', 2
        if ($parts.Count -ne 2 -or $defines.ContainsKey($parts[0]) -or
            $parts[0] -notmatch '^(?:APP_ENV|FLUTTER_(?:VERSION|CHANNEL|GIT_URL|FRAMEWORK_REVISION|ENGINE_REVISION|DART_VERSION))$') {
            throw 'Refusing duplicate, development, test or unknown Dart defines.'
        }
        $defines[$parts[0]] = $parts[1]
    }
    if ($defines['APP_ENV'] -ne 'production' -or $defines['FLUTTER_VERSION'] -ne $Pin.flutter.version -or
        $defines['FLUTTER_DART_VERSION'] -ne $Pin.dart.version -or
        -not $defines.ContainsKey('FLUTTER_FRAMEWORK_REVISION') -or
        $defines['FLUTTER_FRAMEWORK_REVISION'] -notmatch '^[0-9a-f]{10,40}$' -or
        -not $Pin.flutter.revision.StartsWith($defines['FLUTTER_FRAMEWORK_REVISION'], [StringComparison]::Ordinal)) {
        throw 'Generated production configuration/toolchain differs from the release pin.'
    }
}

function Read-ReleaseManifest([string]$Root, [switch]$VerifyFiles) {
    Assert-NoReparsePoint $Root
    $manifestFile = Get-PackagePath $Root 'manifest.json'
    if (-not (Test-Path -LiteralPath $manifestFile -PathType Leaf) -or
        (Get-Item -LiteralPath $manifestFile).Length -gt 1048576) {
        throw 'Missing or oversized release manifest.'
    }
    $manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
    if ($manifest.schema -ne 1 -or $manifest.appId -ne $script:GoalHintAppId -or
        $manifest.displayName -ne 'Goal Hint' -or $manifest.mode -ne 'release' -or
        $manifest.architecture -ne 'x64' -or $manifest.origin -ne $script:GoalHintOrigin -or
        $manifest.entryPoint -ne 'lib/main.dart' -or
        $manifest.version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\+\d+$') {
        throw 'Manifest does not describe a production Goal Hint Windows release.'
    }
    $entries = @($manifest.files)
    if ($entries.Count -lt 8 -or $entries.Count -gt 5000) { throw 'Invalid release file count.' }
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in $entries) {
        if ($entry.path -eq 'manifest.json' -or -not $seen.Add([string]$entry.path) -or
            $entry.sha256 -notmatch '^[0-9a-f]{64}$' -or
            ($entry.length -isnot [int] -and $entry.length -isnot [long]) -or
            $entry.length -lt 0 -or $entry.length -gt 2147483648) {
            throw 'Invalid or duplicate manifest file entry.'
        }
        $file = Get-PackagePath $Root $entry.path
        if ($VerifyFiles) {
            if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or
                (Get-Item -LiteralPath $file).Length -ne $entry.length -or
                (Get-FileDigest $file) -ne $entry.sha256) {
                throw "Release file failed verification: $($entry.path)"
            }
        }
    }
    foreach ($required in @('goal_hint.exe', 'flutter_windows.dll', 'WebView2Loader.dll',
        'msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll',
        'data/app.so', 'data/icudtl.dat', 'install.ps1', 'uninstall.ps1', 'release-common.ps1')) {
        if (-not $seen.Contains($required)) { throw "Missing required release file: $required" }
    }
    if ($VerifyFiles) {
        $base = (Get-FullPath $Root) + [IO.Path]::DirectorySeparatorChar
        foreach ($file in Get-PackageFiles $Root) {
            $relative = $file.FullName.Substring($base.Length).Replace('\', '/')
            if ($relative -ne 'manifest.json' -and -not $seen.Contains($relative)) {
                throw "Unlisted package file: $relative"
            }
        }
    }
    $manifest
}

function Get-WebView2Version {
    $client = 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
    foreach ($hive in @([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryHive]::LocalMachine)) {
        foreach ($view in @([Microsoft.Win32.RegistryView]::Registry32, [Microsoft.Win32.RegistryView]::Registry64)) {
            $base = $null
            $key = $null
            try {
                $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($hive, $view)
                $key = $base.OpenSubKey($client)
                $value = if ($key) { $key.GetValue('pv') } else { $null }
                $version = $null
                if ([Version]::TryParse([string]$value, [ref]$version) -and $version -gt [Version]'0.0.0.0') {
                    return $version.ToString()
                }
            } finally {
                if ($key) { $key.Dispose() }
                if ($base) { $base.Dispose() }
            }
        }
    }
    $null
}

function Assert-WindowsRuntime {
    if (-not [Environment]::Is64BitOperatingSystem -or -not [Environment]::Is64BitProcess -or
        [Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or
        [Environment]::OSVersion.Version.Major -lt 10 -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
        throw 'Use 64-bit Windows PowerShell or PowerShell on x64 Windows.'
    }
    $version = Get-WebView2Version
    if (-not $version) {
        throw 'Microsoft Edge WebView2 Evergreen Runtime is required. Install it from https://developer.microsoft.com/microsoft-edge/webview2/ and retry.'
    }
    $version
}

function Get-GoalHintInstallRoot {
    Get-FullPath (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs/Goal Hint')
}

function Read-InstallReceipt([string]$Root) {
    Assert-NoReparsePoint $Root
    $file = Get-PackagePath $Root 'installation.json'
    if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or (Get-Item -LiteralPath $file).Length -gt 65536) {
        throw 'Existing directory is not a managed Goal Hint installation.'
    }
    $receipt = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
    if ($receipt.schema -ne 1 -or $receipt.appId -ne $script:GoalHintAppId -or
        $receipt.version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\+\d+$') {
        throw 'Invalid installation receipt.'
    }
    $receipt
}

function Write-InstallReceipt([string]$Root, [object]$Receipt) {
    $file = Get-PackagePath $Root 'installation.json'
    $temporary = Get-PackagePath $Root ('.installation-' + [Guid]::NewGuid().ToString('N') + '.json')
    $Receipt | ConvertTo-Json | Set-Content -LiteralPath $temporary -Encoding UTF8
    $null = Get-PackagePath $Root 'installation.json'
    if (Test-Path -LiteralPath $file -PathType Leaf) {
        [IO.File]::Replace($temporary, $file, $null)
    } else { Move-Item -LiteralPath $temporary -Destination $file }
}

function Assert-AppClosed([string]$Root) {
    $base = (Get-FullPath $Root) + [IO.Path]::DirectorySeparatorChar
    foreach ($process in Get-Process -Name goal_hint -ErrorAction SilentlyContinue) {
        if ($process.Path -and $process.Path.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Close the installed Goal Hint window before changing its installation.'
        }
    }
}

function Remove-EmptyPackageDirectories([string[]]$Paths, [string]$Boundary) {
    # Only manifest-derived directories, deepest first; no recursive deletion.
    foreach ($directory in $Paths | Select-Object -Unique | Sort-Object { $_.Length } -Descending) {
        $safe = Assert-ChildPath $directory $Boundary
        if ((Test-Path -LiteralPath $safe -PathType Container) -and
            @(Get-ChildItem -LiteralPath $safe -Force).Count -eq 0) {
            Remove-Item -LiteralPath $safe
        }
    }
}
