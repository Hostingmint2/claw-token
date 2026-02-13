param(
  [Parameter(Mandatory=$true)] [string] $repo
)
# Usage: .\scripts\create-github-repo.ps1 -repo 'youruser/yourrepo'
# Requires: gh CLI installed and authenticated
gh repo create $repo --private --source . --remote origin --push
Write-Host "Repository created and pushed: https://github.com/$repo"
Write-Host "If GitHub Pages is used, enable Pages in repository Settings or let Actions publish automatically."