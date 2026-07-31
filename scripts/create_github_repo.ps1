param(
    [Parameter(Mandatory=$true)][string]$RepoName,
    [string]$Description = "BeamNG project repository",
    [switch]$Private,
    [string]$Org = ""
)

# Create a new GitHub repo using gh and push current workspace as initial commit.
# Requires GitHub CLI (gh) authenticated (run `gh auth login` beforehand).

function Write-ErrAndExit($msg) {
    Write-Host $msg -ForegroundColor Red
    exit 1
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-ErrAndExit "GitHub CLI 'gh' not found. Install it from https://cli.github.com/ and run 'gh auth login' first."
}

# Ensure we are in the repo root
$cwd = Get-Location
Write-Host "Creating GitHub repo '$RepoName' from: $cwd"

# Initialize git if needed
if (-not (Test-Path -Path .git)) {
    git init || Write-ErrAndExit "git init failed"
}

# Add all files and commit if no commits exist
$hasCommits = $false
try {
    git rev-parse --is-inside-work-tree | Out-Null
    $hasCommits = (git rev-parse --verify HEAD 2>$null) -ne $null
} catch {
    $hasCommits = $false
}

if (-not $hasCommits) {
    git add .
    git commit -m "chore: initial commit"
    Write-Host "Created initial commit"
} else {
    Write-Host "Repository already has commits; will push current branch as-is"
}

# Build gh create command
$createArgs = @($RepoName)
if ($Org -ne "") { $createArgs = @("$Org/$RepoName") }
if ($Private) { $createArgs += "--private" } else { $createArgs += "--public" }
$createArgs += "--description"; $createArgs += $Description

Write-Host "Running: gh repo create $($createArgs -join ' ')"
$createResult = gh repo create @createArgs 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-ErrAndExit "gh repo create failed: $createResult"
}

# Get remote url and push
$remote = "origin"
$branch = git rev-parse --abbrev-ref HEAD
Write-Host "Setting remote $remote and pushing branch $branch"

git remote add $remote "git@github.com:$($Org -ne "" ? "$Org/" : "")$RepoName.git" 2>$null
if ($LASTEXITCODE -ne 0) {
    # maybe HTTPS remote
    $url = gh repo view --json sshUrl -q .sshUrl
    if ($url) { git remote add $remote $url }
}

git push -u $remote $branch --force
if ($LASTEXITCODE -ne 0) {
    Write-ErrAndExit "git push failed"
}

Write-Host "Repository created and pushed: https://github.com/" + ($Org -ne "" ? "$Org/" : "") + $RepoName
