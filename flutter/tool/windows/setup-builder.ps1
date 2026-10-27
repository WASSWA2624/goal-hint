#Requires -Version 5.1
function New-GoalHintSetup([string]$InstallerDirectory, [string]$Output) {
    $compiler = Join-Path $env:SystemRoot 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) { throw '.NET Framework C# compiler is required to create the setup executable.' }
    $payload = Join-Path $InstallerDirectory 'payload.zip'
    & $compiler /nologo /target:exe /platform:x64 /optimize+ ('/out:' + $Output) /reference:System.IO.Compression.dll `
        ('/resource:' + $payload + ',GoalHint.Payload') (Join-Path $PSScriptRoot 'setup-bootstrap.cs')
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $Output -PathType Leaf)) { throw 'Setup executable creation failed.' }
}
