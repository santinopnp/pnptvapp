# QATouch test case creation -- Creator Profile redesign + Creator Studio Wizard audit
# Usage: $env:QATOUCH_TOKEN="<token>"; ./scripts/qatouch_create_creator_profile_cases.ps1
#
# Project: PNPtv (V072). Milestone: "Creator Profile & Studio Wizard - July 2026" (VgQL).
# Reads case data from qatouch_creator_profile_cases.json (kept separate from this script
# to avoid PowerShell string-parsing fragility with long descriptions).
#
# API convention (confirmed against the live API, 2026-07-20):
#   GET  https://api.qatouch.com/api/v1/getAllProjects              (headers: api-token, domain)
#   GET  https://api.qatouch.com/api/v1/getAllModules/{projectKey}
#   GET  https://api.qatouch.com/api/v1/getAllMilestones/{projectKey}
#   POST https://api.qatouch.com/api/v1/module      body: {projectKey, moduleName}
#   POST https://api.qatouch.com/api/v1/milestone   body: {projectKey, milestone}
#   POST https://api.qatouch.com/api/v1/testCase    body: {projectKey, sectionKey, milestoneKey, caseTitle, description}

$TOKEN = $env:QATOUCH_TOKEN
if (-not $TOKEN) {
  Write-Error 'Set $env:QATOUCH_TOKEN first.'
  exit 1
}

$Headers = @{ "api-token" = $TOKEN; "domain" = "easybots"; "Accept" = "application/json"; "Content-Type" = "application/json" }
$Base = "https://api.qatouch.com/api/v1"
$ProjectKey = "V072"
$MilestoneKey = "VgQL"

$Sections = @{
  "header"  = "j978d"
  "actions" = "4GJqb"
  "tabs"    = "plQZG"
  "cta"     = "LR1be"
  "api"     = "wlQ6G"
  "wizard"  = "y1499"
}

$jsonPath = Join-Path $PSScriptRoot "qatouch_creator_profile_cases.json"
$cases = Get-Content $jsonPath -Raw | ConvertFrom-Json

$created = 0
$failed = 0

foreach ($c in $cases) {
  $sectionKey = $Sections[$c.section]
  $payload = @{
    projectKey   = $ProjectKey
    sectionKey   = $sectionKey
    milestoneKey = $MilestoneKey
    caseTitle    = $c.title
    description  = $c.description
  } | ConvertTo-Json

  try {
    $resp = Invoke-RestMethod -Uri "$Base/testCase" -Headers $Headers -Method POST -Body $payload -TimeoutSec 20
    if ($resp.success) {
      Write-Output "  OK [$($c.section)]: $($c.title)"
      $created++
    } else {
      Write-Output "  FAIL [$($c.section)]: $($c.title) -> $($resp.error_msg)"
      $failed++
    }
  } catch {
    Write-Output "  FAIL [$($c.section)]: $($c.title) -> $($_.Exception.Message)"
    $failed++
  }
}

Write-Output ""
Write-Output "=============================="
Write-Output "Created: $created"
Write-Output "Failed:  $failed"
Write-Output "=============================="
