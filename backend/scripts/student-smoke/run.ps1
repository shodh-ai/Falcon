param([switch]$Apply, [switch]$Repeat, [switch]$Browser, [switch]$CopyStudentPassword)
$ErrorActionPreference = 'Stop'
$smokeLocal = Join-Path $PSScriptRoot 'local'
$smokeCredentialPath = Join-Path $smokeLocal 'credential.clixml'
$smokeStudentCredentialPath = Join-Path $smokeLocal 'student-credential.clixml'
if ($CopyStudentPassword) {
  if (-not (Test-Path -LiteralPath $smokeCredentialPath)) { throw 'Run the guarded seed first.' }
  $smokePasswordCopyPath = if (Test-Path -LiteralPath $smokeStudentCredentialPath) { $smokeStudentCredentialPath } else { $smokeCredentialPath }
  $smokeCredential = Import-Clixml -LiteralPath $smokePasswordCopyPath
  Set-Clipboard -Value $smokeCredential.GetNetworkCredential().Password
  Write-Output 'Synthetic test password copied to clipboard; paste into the local test login and clear the clipboard afterward.'
  exit
}
if (-not $Apply) { throw 'Use -Apply only after confirming the authorized local development database.' }
if (-not (Test-Path -LiteralPath $smokeLocal)) { New-Item -ItemType Directory -Path $smokeLocal | Out-Null }
if (Test-Path -LiteralPath $smokeCredentialPath) {
  $smokeCredential = Import-Clixml -LiteralPath $smokeCredentialPath
} else {
  $smokeSecretBytes = [byte[]]::new(32)
  [Security.Cryptography.RandomNumberGenerator]::Fill($smokeSecretBytes)
  $smokeSecretText = [Convert]::ToBase64String($smokeSecretBytes) + '!9a'
  $smokeSecure = ConvertTo-SecureString -String $smokeSecretText -AsPlainText -Force
  $smokeCredential = [Management.Automation.PSCredential]::new('student@falcon-smoke.invalid', $smokeSecure)
  $smokeCredential | Export-Clixml -LiteralPath $smokeCredentialPath
  $smokeSecretText = $null
}
$smokePriorPassword = [Environment]::GetEnvironmentVariable('FALCON_SMOKE_PASSWORD')
$smokePriorEnable = [Environment]::GetEnvironmentVariable('FALCON_SMOKE_ENABLE')
$smokePriorNodeEnv = [Environment]::GetEnvironmentVariable('NODE_ENV')
$smokePriorPython = [Environment]::GetEnvironmentVariable('FALCON_SMOKE_PYTHON')
$smokePriorStudentPassword = [Environment]::GetEnvironmentVariable('FALCON_SMOKE_STUDENT_PASSWORD')
try {
  $env:FALCON_SMOKE_ENABLE = '1'
  $env:NODE_ENV = 'test'
  $env:FALCON_SMOKE_PASSWORD = $smokeCredential.GetNetworkCredential().Password
  if (Test-Path -LiteralPath $smokeStudentCredentialPath) {
    $smokeStudentCredential = Import-Clixml -LiteralPath $smokeStudentCredentialPath
    $env:FALCON_SMOKE_STUDENT_PASSWORD = $smokeStudentCredential.GetNetworkCredential().Password
  }
  if (-not $env:FALCON_SMOKE_PYTHON) {
    $smokeBundledPython = 'C:\Users\aksha\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
    if (Test-Path -LiteralPath $smokeBundledPython) { $env:FALCON_SMOKE_PYTHON = $smokeBundledPython }
  }
  $smokeArgs = @((Join-Path $PSScriptRoot 'seed.cjs'))
  if ($Repeat) { $smokeArgs += '--repeat' }
  if ($Browser) { $smokeArgs += '--browser' }
  & node @smokeArgs
  if ($LASTEXITCODE -ne 0) { throw 'Seed stopped; inspect the redacted local report. No credentials were logged.' }
} finally {
  [Environment]::SetEnvironmentVariable('FALCON_SMOKE_PASSWORD', $smokePriorPassword)
  [Environment]::SetEnvironmentVariable('FALCON_SMOKE_ENABLE', $smokePriorEnable)
  [Environment]::SetEnvironmentVariable('NODE_ENV', $smokePriorNodeEnv)
  [Environment]::SetEnvironmentVariable('FALCON_SMOKE_PYTHON', $smokePriorPython)
  [Environment]::SetEnvironmentVariable('FALCON_SMOKE_STUDENT_PASSWORD', $smokePriorStudentPassword)
}
