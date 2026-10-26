param(
    [string]$CompanyRoot = (Split-Path -Parent $PSScriptRoot),
    [string[]]$Only = @()
)

$ErrorActionPreference = 'Stop'
$qaRoot = Join-Path $CompanyRoot '.work/qa'
New-Item -ItemType Directory -Path $qaRoot -Force | Out-Null
$manifest = Get-Content -LiteralPath (Join-Path $CompanyRoot '.work/document-manifest.json') -Raw | ConvertFrom-Json
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$word.AutomationSecurity = 3
try {
    foreach ($entry in $manifest) {
        $inputPath = Join-Path $CompanyRoot $entry.path
        $name = [System.IO.Path]::GetFileNameWithoutExtension($inputPath)
        if ($Only.Count -gt 0 -and $name -notin $Only) { continue }
        $outputDir = Join-Path $qaRoot $name
        New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
        $pdfPath = Join-Path $outputDir "$name.pdf"
        $document = $null
        try {
            $document = $word.Documents.Open($inputPath, $false, $true, $false)
            $document.Fields.Update() | Out-Null
            $document.ExportAsFixedFormat($pdfPath, 17)
            Write-Output "Rendered $name"
        }
        finally {
            if ($null -ne $document) {
                $document.Close(0)
                [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) | Out-Null
            }
        }
    }
}
finally {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) | Out-Null
}
