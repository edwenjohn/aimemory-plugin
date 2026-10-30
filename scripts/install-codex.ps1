# Install the aimemory plugin into Codex (CLI, desktop app and IDE extension share ~/.codex).
#
# 1. Copies this repo to ~/.codex/plugins/aimemory
# 2. Adds an "aimemory" entry to ~/.agents/plugins/marketplace.json (merging, never clobbering other entries)
# 3. Prints the remaining manual steps (enable, run setup, trust hooks)
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\install-codex.ps1

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
$pluginDir = Join-Path (Join-Path $codexHome 'plugins') 'aimemory'
$marketplaceDir = Join-Path $env:USERPROFILE '.agents\plugins'
$marketplaceFile = Join-Path $marketplaceDir 'marketplace.json'

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
    source   = [ordered]@{ source = 'local'; path = $pluginDir }
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
($market | ConvertTo-Json -Depth 6) | Out-File -FilePath $marketplaceFile -Encoding utf8
Write-Host "Marketplace entry written to $marketplaceFile"

Write-Host ''
Write-Host 'Next steps in Codex:'
Write-Host '  1. Restart Codex (CLI, desktop app or IDE extension).'
Write-Host '  2. Open the plugin browser, find "AI Memory" (aimemory) and enable it.'
Write-Host '  3. Run its setup (the onboarding skill) and give it your memory folder, e.g. F:\AI Memory Framework.'
Write-Host '     Or in any session: $aimemory-path F:\AI Memory Framework'
Write-Host '  4. Run /hooks and trust the aimemory hooks; they are skipped until you do.'
Write-Host '  5. Check with $aimemory-status.'
