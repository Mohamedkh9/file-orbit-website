param(
 [Parameter(Mandatory=$true)][string]$Installer,
 [string]$ReleaseTag,
 [string]$ReleaseNotes='File Orbit update'
)
$ErrorActionPreference='Stop'
$publisherRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$publisherConfigPath=Join-Path $publisherRoot 'site.config.json'
$publisherConfig=Get-Content -LiteralPath $publisherConfigPath -Raw | ConvertFrom-Json
$publisherInstaller=(Resolve-Path -LiteralPath $Installer).Path
$publisherSignature=Get-AuthenticodeSignature -LiteralPath $publisherInstaller
if($publisherSignature.Status -ne 'Valid' -or $null -eq $publisherSignature.SignerCertificate){throw 'The installer must have a real, valid Windows publisher signature before activating automatic updates.'}
$publisherInfo=[Diagnostics.FileVersionInfo]::GetVersionInfo($publisherInstaller)
if($publisherInfo.ProductName -ne 'File Orbit'){throw 'Select a File Orbit installer.'}
$publisherVersion=[Version]$publisherInfo.FileVersion
$publisherDisplay=$publisherVersion.Major.ToString()+'.'+$publisherVersion.Minor
if($publisherVersion.Build -gt 0){$publisherDisplay+='.'+$publisherVersion.Build}
if($publisherVersion.Revision -gt 0){$publisherDisplay+='.'+$publisherVersion.Revision}
if(-not $ReleaseTag){$ReleaseTag='v'+$publisherDisplay}
if($ReleaseTag -notmatch '^[A-Za-z0-9_.-]+$'){throw 'Use a release tag without slashes or spaces.'}
$publisherSha=[Security.Cryptography.SHA256]::Create()
try{$publisherPin=[BitConverter]::ToString($publisherSha.ComputeHash($publisherSignature.SignerCertificate.RawData)).Replace('-','')}finally{$publisherSha.Dispose()}
$publisherFileHash=(Get-FileHash -LiteralPath $publisherInstaller -Algorithm SHA256).Hash
$publisherFilename=[IO.Path]::GetFileName($publisherInstaller)
$publisherAssetUrl='https://github.com/'+$publisherConfig.github.owner+'/'+$publisherConfig.github.releasesRepo+'/releases/download/'+$ReleaseTag+'/'+$publisherFilename
$publisherManifest=[ordered]@{Version=$publisherInfo.FileVersion;InstallerUrl=$publisherAssetUrl;Sha256=$publisherFileHash;Notes=$ReleaseNotes}
$publisherManifestPath=Join-Path $publisherRoot 'release\signed-manifest.json'
[IO.File]::WriteAllText($publisherManifestPath,($publisherManifest | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
$publisherConfig.release.version=$publisherInfo.FileVersion
$publisherConfig.release.displayVersion=$publisherDisplay
$publisherConfig.release.tag=$ReleaseTag
$publisherConfig.release.installer=$publisherFilename
$publisherConfig.release.runtime='FileOrbit-'+$publisherDisplay+'-Public.zip'
$publisherConfig.release.checksums='FileOrbit-'+$publisherDisplay+'-SHA256.txt'
$publisherConfig.release.installerBytes=(Get-Item -LiteralPath $publisherInstaller).Length
$publisherConfig.release.signatureStatus='signed'
$publisherConfig.release | Add-Member -MemberType NoteProperty -Name installerSha256 -Value $publisherFileHash -Force
$publisherConfig.updates | Add-Member -MemberType NoteProperty -Name mode -Value 'authenticode' -Force
$publisherConfig.updates.enabled=$true
$publisherConfig.updates.publisherCertificateSha256=$publisherPin
$publisherTemp=$publisherConfigPath+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
try{[IO.File]::WriteAllText($publisherTemp,($publisherConfig | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false));[IO.File]::Replace($publisherTemp,$publisherConfigPath,$null)}finally{if(Test-Path -LiteralPath $publisherTemp){Remove-Item -LiteralPath $publisherTemp}}
Write-Output 'Verified signed release. Upload this exact signed installer to the configured GitHub Release, then rebuild and deploy the website. Configure File Orbit with the stable production HTTPS /updates/latest.json URL and the certificate SHA-256.'
Write-Output ('Publisher certificate SHA-256: '+$publisherPin)
