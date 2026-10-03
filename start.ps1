$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $projectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Host "Create the local environment first: python -m venv .venv; .\.venv\Scripts\python -m pip install -r requirements.txt"
    exit 1
}
if (-not (Test-Path (Join-Path $projectRoot "client\dist\client\index.html"))) {
    Push-Location (Join-Path $projectRoot "client")
    npm run build
    Pop-Location
}
& $python -m uvicorn server.main:app --host 127.0.0.1 --port 8000
