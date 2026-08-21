# 一键安装 dsh-worldbook 到 dsh profile，操作方式交互式选择：
#   [1] 软连接安装（link: 指向本地项目目录，改代码 build 后实时生效，适合开发）
#   [2] GitHub 安装（github:aam452/dsh-worldbook，适合线上部署；使用仓库里已提交的 lib/ 产物）
#   [3] 更新插件（dsh plugin --profile <profile> update dsh-worldbook）
# 用法: powershell -ExecutionPolicy Bypass -File .\link-install.ps1 [profile名]（默认 web）
#   可选 -Method 1|2|3 跳过交互式选择（非交互环境用，1=软连接 2=GitHub 3=更新）
# 安装（1/2）时若已安装，提示并退出，不重复安装。

param(
    [string]$Profile = 'web',
    [ValidateSet('1', '2', '3')][string]$Method = ''
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

# ── 交互式选择操作方式 ──
if ($Method -eq '') {
    if ([Console]::IsInputRedirected) {
        Write-Error '[link-install] 检测到非交互式终端（stdin 被重定向），无法交互选择。请显式加参数：-Method 1（软连接）或 -Method 2（GitHub）或 -Method 3（更新）'
        exit 1
    }
    while ($Method -ne '1' -and $Method -ne '2' -and $Method -ne '3') {
        Write-Host ''
        Write-Host '请选择操作方式：'
        Write-Host '  [1] 软连接安装（本地开发，改代码实时生效）'
        Write-Host '  [2] GitHub 安装（github:aam452/dsh-worldbook，用仓库已提交的 lib/）'
        Write-Host '  [3] 更新插件（dsh plugin --profile ... update dsh-worldbook）'
        $Method = Read-Host '输入 1、2 或 3'
    }
}
Write-Host ''

# ── 更新插件 ──
if ($Method -eq '3') {
    Write-Host "[link-install] 更新插件 $Plugin ..."
    dsh plugin --profile $Profile update dsh-worldbook
    if ($LASTEXITCODE -ne 0) { Write-Error '[link-install] 更新失败'; exit 1 }
    Write-Host "[link-install] 完成：$Plugin 已更新"
    exit 0
}

# ── 安装（1/2）：若已安装则提示并退出 ──
$installed = $manifest.dependencies.$Plugin
if ($null -ne $installed) {
    Write-Host "[link-install] 「$Plugin」已安装（$installed）。如需重新安装，请先卸载："
    Write-Host "  .\link-uninstall.ps1 $Profile"
    exit 1
}

if ($Method -eq '2') {
    Write-Host '[link-install] 从 GitHub 安装 ...'
    dsh plugin --profile $Profile add github:aam452/dsh-worldbook
    if ($LASTEXITCODE -ne 0) { Write-Error '[link-install] GitHub 安装失败'; exit 1 }

    $installDir = Join-Path $ProfileDir "node_modules\$Plugin"
    if (Test-Path $installDir) {
        Write-Host "[link-install] 完成：$Plugin 已从 GitHub 安装 -> $installDir"
        Write-Host '  注意：GitHub 安装使用仓库里已提交的 lib/ 产物。'
        Write-Host '  本地源码修改后须 npm run build 并提交 lib/，再到 dsh 更新插件才生效。'
    } else {
        Write-Error "[link-install] 未检测到 $installDir，请检查安装结果"
        exit 1
    }
    exit 0
}

# ── 软连接安装 ──
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
    Write-Host '  下次修改代码后执行 npm run build 并重启 dsh 即可生效'
} else {
    Write-Error "[link-install] 未检测到 $linkDir，请检查安装结果"
    exit 1
}
