Create and push a new GitHub repository from this workspace

This helper creates a new GitHub repository and pushes the current workspace as the initial commit.

Prerequisites
- Git installed and available in PATH
- GitHub CLI (`gh`) installed and authenticated: `gh auth login`

Usage (PowerShell)

Open a PowerShell prompt in the repository root (workspace root) and run:

```powershell
# create a public repo named BeamNg_RIT_remote under your user
.
\scripts\create_github_repo.ps1 -RepoName "BeamNg_RIT_remote" -Description "BeamNG RIT project initial import"

# create a private repo under an organization
.
\scripts\create_github_repo.ps1 -RepoName "BeamNg_RIT" -Org "my-org" -Private
```

What it does
- Initializes git if needed
- Makes an initial commit if there are no commits
- Calls `gh repo create` to create the remote repository
- Adds `origin` remote and pushes the current branch

If you want me to create and push the repo for you, grant me the remote repo URL or run the script locally and paste any errors here and I'll help fix them.
