param(
  [string]$BaseUrl = "http://localhost:3000",
  [int]$BatchSize = 3
)

$ErrorActionPreference = "Stop"
$Endpoint = "$BaseUrl/api/sandbox/probe-lab/assets/ambientcg"

Write-Host "Analyzing ambientCG materials in batches of $BatchSize."
Write-Host "Keep the local Next.js server running for the entire operation."

while ($true) {
  $Body = @{
    action = "analyze_material_batch"
    limit = $BatchSize
  } | ConvertTo-Json

  $Result = Invoke-RestMethod `
    -Uri $Endpoint `
    -Method Post `
    -ContentType "application/json" `
    -Body $Body

  Write-Host (
    "Attempted {0}; completed {1}; failed {2}." -f `
      $Result.attempted, `
      $Result.completed, `
      $Result.failed
  )

  if ([int]$Result.attempted -eq 0) {
    Write-Host "No unanalyzed material previews remain."
    break
  }
}
