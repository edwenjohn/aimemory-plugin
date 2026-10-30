# Install the aimemory plugin into Codex (CLI, desktop app and IDE extension share ~/.codex).
#
# 1. Copies this repo to ~/.agents/plugins/aimemory (next to the personal marketplace file,
#    so the marketplace entry can use the documented "./"-relative path)
# 2. Adds an "aimemory" entry to ~/.agents/plugins/marketplace.json (merging, never clobbering other entries)
# 3. Prints the remaining manual steps (enable, run setup, trust hooks)
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\install-codex.ps1

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$marketplaceDir = Join-Path $env:USERPROFILE '.agents\plugins'
$marketplaceFile = Join-Path $marketplaceDir 'marketplace.json'
$pluginDir = Join-Path $marketplaceDir 'aimemory'

Write-Host "Installing aimemory from $repo"

# 1. Copy the plugin (excluding git metadata, tests and scratch).
New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null
$exclude = @('.git', '.superpowers', 'node_modules', 'tests')
Get-ChildItem -Path $repo -Force | Where-Object { $exclude -notcontains $_.Name } | ForEach-Object {
    $dest = Join-Path $pluginDir $_.Name
    if ($_.PSIsContainer) {
        if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
        Copy-Item -Recurse -Force $_.FullName $dest
    } else {
        Copy-Item -Force $_.FullName $dest
    }
}
Write-Host "Copied to $pluginDir"

# 2. Merge the marketplace entry.
New-Item -ItemType Directory -Force -Path $marketplaceDir | Out-Null
$entry = [ordered]@{
    name     = 'aimemory'
    source   = [ordered]@{ source = 'local'; path = './aimemory' }
    policy   = [ordered]@{ installation = 'AVAILABLE'; authentication = 'ON_INSTALL' }
    category = 'Productivity'
}
if (Test-Path $marketplaceFile) {
    $market = Get-Content -Raw -Path $marketplaceFile | ConvertFrom-Json
    if (-not $market.plugins) { $market | Add-Member -NotePropertyName plugins -NotePropertyValue @() }
    $others = @($market.plugins | Where-Object { $_.name -ne 'aimemory' })
    $market.plugins = @($others + $entry)
} else {
    $market = [ordered]@{ name = 'personal'; plugins = @($entry) }
}
# Plain UTF-8 without a BOM: Out-File -Encoding utf8 writes a BOM on PowerShell 5.1, which strict JSON parsers reject.
[System.IO.File]::WriteAllText($marketplaceFile, (($market | ConvertTo-Json -Depth 6) + "`n"), (New-Object System.Text.UTF8Encoding $false))
Write-Host "Marketplace entry written to $marketplaceFile"

Write-Host ''
Write-Host 'Next steps in Codex:'
Write-Host '  1. Restart Codex (CLI, desktop app or IDE extension).'
Write-Host '  2. Open the plugin browser, find "AI Memory" (aimemory) and enable it.'
Write-Host '  3. Run its setup (the onboarding skill) and give it your memory folder (the one holding Projects.md).'
Write-Host '     Or in any session: $aimemory-path <path to your memory folder>'
Write-Host '  4. Run /hooks and trust the aimemory hooks; they are skipped until you do.'
Write-Host '  5. Check with $aimemory-status.'
