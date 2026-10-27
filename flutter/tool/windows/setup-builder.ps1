#Requires -Version 5.1
function New-GoalHintSetup([string]$InstallerDirectory, [string]$Output, [string]$SedPath, [string]$Version) {
    $sourceDirectory = $InstallerDirectory.TrimEnd('\') + '\'
    @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=%PostInstallCmd%
AdminQuietInstCmd=%AdminQuietInstCmd%
UserQuietInstCmd=%UserQuietInstCmd%
SourceFiles=SourceFiles
[SourceFiles]
SourceFiles0=$sourceDirectory
[SourceFiles0]
%FILE0%=
%FILE1%=
%FILE2%=
[Strings]
InstallPrompt=Install Goal Hint $Version for the current user?
DisplayLicense=
FinishMessage=
TargetName=$Output
FriendlyName=Goal Hint $Version Setup
AppLaunched=cmd.exe /d /c setup.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
FILE0="payload.zip"
FILE1="setup.ps1"
FILE2="setup.cmd"
"@ | Set-Content -LiteralPath $SedPath -Encoding ASCII
    $iexpress = Join-Path $env:SystemRoot 'System32/iexpress.exe'
    if (-not (Test-Path -LiteralPath $iexpress -PathType Leaf)) { throw 'Windows IExpress is required to create the setup executable.' }
    $builder = Start-Process -FilePath $iexpress -ArgumentList @('/N', '/Q', ('"' + $SedPath + '"')) -WindowStyle Hidden -PassThru -Wait
    if ($builder.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $Output -PathType Leaf)) { throw 'IExpress setup executable creation failed.' }
}
