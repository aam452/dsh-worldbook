# 一键软连接安装 dsh-worldbook 到 dsh profile（同 mindlink 的 link: 方式）。
# 用法: powershell -ExecutionPolicy Bypass -File .\link-install.ps1 [profile名]（默认 web）
# 若已安装（软连接或普通安装），提示并退出，不重复建立软连接。

param(
    [string]$Profile = 'web'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProfileDir = Join-Path $env:USERPROFILE ".dsh\profiles\$Profile"
$ManifestPath = Join-Path $ProfileDir 'package.json'
$Plugin = 'dsh-worldbook'

if (-not (Test-Path $ManifestPath)) {
    Write-Error "[link-install] profile 不存在: $ProfileDir（先初始化 profile 再安装）"
    exit 1
}

$manifest = Get-Content -Raw $ManifestPath | ConvertFrom-Json
$installed = $manifest.dependencies.$Plugin

if ($null -ne $installed) {
    Write-Host "[link-install] 「$Plugin」已安装（$installed）。如要改为软连接安装，请先卸载："
    Write-Host "  dsh plugin --profile $Profile remove $Plugin"
    Write-Host "  或运行: .\link-uninstall.ps1 $Profile"
    exit 1
}

Write-Host "[link-install] 构建最新产物 lib/ ..."
Push-Location $ProjectRoot
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'build failed' }
} finally {
    Pop-Location
}

# Windows 下 pnpm 的 link: 路径用正斜杠
$spec = 'link:' + ($ProjectRoot.Replace('\', '/'))

Write-Host "[link-install] 建立软连接: $spec -> profile $Profile"
dsh plugin --profile $Profile add $spec
if ($LASTEXITCODE -ne 0) { Write-Error '[link-install] 软连接安装失败'; exit 1 }

$linkDir = Join-Path $ProfileDir "node_modules\$Plugin"
if (Test-Path $linkDir) {
    Write-Host "[link-install] 完成：$Plugin 已通过软连接安装 -> $ProjectRoot"
    Write-Host "  下次修改代码后执行 npm run build 并重启 dsh 即可生效"
} else {
    Write-Error "[link-install] 未检测到 $linkDir，请检查安装结果"
    exit 1
}
