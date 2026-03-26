param(
    [string]$OutputDir = "deploy\hf-space"
)

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRootPath = (Resolve-Path $repoRoot).Path
$targetPath = [System.IO.Path]::GetFullPath((Join-Path $repoRootPath $OutputDir))

if (-not $targetPath.StartsWith($repoRootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Output path must stay inside the repository."
}

if (Test-Path $targetPath) {
    throw "Output path already exists: $targetPath`nDelete it first or pass a different -OutputDir value."
}

New-Item -ItemType Directory -Path $targetPath | Out-Null

Copy-Item -Path (Join-Path $repoRootPath "backend") -Destination (Join-Path $targetPath "backend") -Recurse
Copy-Item -Path (Join-Path $repoRootPath "VIOLENCE") -Destination (Join-Path $targetPath "VIOLENCE") -Recurse
Copy-Item -Path (Join-Path $repoRootPath "Dockerfile") -Destination (Join-Path $targetPath "Dockerfile")
Copy-Item -Path (Join-Path $repoRootPath ".dockerignore") -Destination (Join-Path $targetPath ".dockerignore")
Copy-Item -Path (Join-Path $repoRootPath "SPACE_README.md") -Destination (Join-Path $targetPath "README.md")

$cacheDirs = Get-ChildItem -Path $targetPath -Directory -Recurse -Filter "__pycache__" -ErrorAction SilentlyContinue
foreach ($cacheDir in $cacheDirs) {
    Remove-Item -LiteralPath $cacheDir.FullName -Recurse -Force
}

Write-Host "Created Hugging Face Space bundle at $targetPath"
Write-Host "Next: create a Docker Space, then push the contents of this folder to the Space repo."
