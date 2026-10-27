#Requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 3000,
    [string]$Flutter = 'flutter'
)

$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$origin = "http://localhost:$Port"

Write-Host "Starting Goal Hint Windows development at $origin"
Push-Location $project
try {
    & $Flutter run -d windows --debug --target=lib/main.dart `
        --dart-define=APP_ENV=development "--dart-define=DEV_APP_ORIGIN=$origin"
    if ($LASTEXITCODE -ne 0) {
        throw "Flutter development run failed with exit code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}
