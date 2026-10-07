param(
    [string]$Binary = "",
    [string]$BufferKey = "",
    [switch]$EstimateOnly,
    [switch]$UseRpc
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$targetRoot = Join-Path $projectRoot 'blockchain\solana\target'
$solana = Join-Path $targetRoot 'tools\solana-release\bin\solana.exe'
$keygen = Join-Path $targetRoot 'tools\solana-release\bin\solana-keygen.exe'
$programKey = Join-Path $targetRoot 'deploy\finance_hub-keypair.json'
$payerKey = Join-Path $targetRoot 'deploy\finance_payer-keypair.json'
$expectedProgram = 'C4Ys1SQk5PXcPD5GfLP1RL7FdiL54A4mhv49cDf7rYW6'
$expectedPayer = 'AsaP4StyFykojoPcJtWAmqDAohQN6mNFNLKThLvvbhdv'
if (-not $Binary) { $Binary = Join-Path $targetRoot 'deploy\finance_hub.so' }
if (-not $BufferKey) { $BufferKey = Join-Path $targetRoot 'deploy\finance_buffer-keypair.json' }

foreach ($path in @($solana, $keygen, $programKey, $payerKey, $Binary)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Thiếu tệp: $path"
    }
}

$actualProgram = (& $keygen pubkey $programKey).Trim()
$actualPayer = (& $keygen pubkey $payerKey).Trim()
if ($actualProgram -ne $expectedProgram -or $actualPayer -ne $expectedPayer) {
    throw 'Keypair không khớp địa chỉ chương trình/ví triển khai đã công bố.'
}
$bytes = (Get-Item -LiteralPath $Binary).Length
if ($bytes -lt 10000) { throw 'Tệp SBF quá nhỏ hoặc không hợp lệ.' }
$bufferRentText = & $solana --url devnet rent --lamports ($bytes + 37)
$programRentText = & $solana --url devnet rent --lamports ($bytes + 45)
$programAccountRentText = & $solana --url devnet rent --lamports 36
$payerBalanceText = & $solana --url devnet balance --lamports $expectedPayer
function Read-Lamports([string]$result) {
    if ($result -notmatch '(\d+) lamports') { throw "Không đọc được số lamports: $result" }
    return [long]$Matches[1]
}
$bufferRent = Read-Lamports $bufferRentText
$programRent = Read-Lamports $programRentText
$programAccountRent = Read-Lamports $programAccountRentText
$payerBalance = Read-Lamports $payerBalanceText
$peakEstimate = $bufferRent + $programRent + $programAccountRent + 50000000
Write-Output "Program ID: $expectedProgram"
Write-Output "Payer: $expectedPayer"
Write-Output "SBF size: $bytes bytes"
Write-Output "Devnet balance: $($payerBalance / 1000000000) SOL"
Write-Output "Conservative peak estimate: $($peakEstimate / 1000000000) SOL"
if ($EstimateOnly) { return }
if ($payerBalance -lt $peakEstimate) {
    throw 'Số dư ví triển khai thấp hơn mức ước tính. Nạp thêm SOL Devnet trước khi chạy lại.'
}

if (-not (Test-Path -LiteralPath $BufferKey -PathType Leaf)) {
    & $keygen new --silent --no-bip39-passphrase --outfile $BufferKey
    if ($LASTEXITCODE -ne 0) { throw 'Không tạo được keypair buffer cục bộ.' }
}
$bufferPublicKey = (& $keygen pubkey $BufferKey).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Không đọc được public key của buffer.' }
Write-Output "Buffer: $bufferPublicKey"
$deployArgs = @('--url', 'devnet', '--keypair', $payerKey, 'program', 'deploy', '--buffer', $BufferKey, '--program-id', $programKey, $Binary)
if ($UseRpc) { $deployArgs += '--use-rpc' }
& $solana @deployArgs
if ($LASTEXITCODE -ne 0) { throw 'Lệnh triển khai Solana thất bại.' }
& $solana --url devnet --keypair $payerKey program show $expectedProgram
if ($LASTEXITCODE -ne 0) { throw 'Chưa xác minh được chương trình sau triển khai.' }
