#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('GoalHint-setup-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
    Expand-Archive -LiteralPath (Join-Path $PSScriptRoot 'payload.zip') -DestinationPath $temporary
    & (Join-Path $temporary 'payload/install.ps1') -DesktopShortcut
} finally {
    # This unique temporary directory was created by this setup process.
    $boundary = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    $resolved = [IO.Path]::GetFullPath($temporary)
    if (-not $resolved.StartsWith($boundary, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid setup temporary directory.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
