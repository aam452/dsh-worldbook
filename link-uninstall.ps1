# 卸载 dsh-worldbook 插件。自动识别安装方式：
#   - 软连接（dependencies 值为 link:...）：卸载后额外清理残留的符号链接
#   - 普通安装（registry / github 等）：仅卸载
#   - 未安装：提示并退出
# 用法: powershell -ExecutionPolicy Bypass -File .\link-uninstall.ps1 [profile名]（默认 web）

param(
    [string]$Profile = 'web'
)

$ErrorActionPreference = 'Stop'
$ProfileDir = Join-Path $env:USERPROFILE ".dsh\profiles\$Profile"
$ManifestPath = Join-Path $ProfileDir 'package.json'
$Plugin = 'dsh-worldbook'

if (-not (Test-Path $ManifestPath)) {
    Write-Error "[link-uninstall] profile 不存在: $ProfileDir"
    exit 1
}

$manifest = Get-Content -Raw $ManifestPath | ConvertFrom-Json
$installed = $manifest.dependencies.$Plugin

if ($null -eq $installed) {
    Write-Error "[link-uninstall] 「$Plugin」未安装（profile $Profile 的依赖中无此插件）"
    exit 1
}

$isLink = ([string]$installed).StartsWith('link:')
$method = if ($isLink) { '软连接（' + $installed + '）' } else { '普通安装（' + $installed + '）' }
Write-Host "[link-uninstall] 检测到安装方式: $method"

Write-Host "[link-uninstall] 卸载中: dsh plugin --profile $Profile remove $Plugin ..."
dsh plugin --profile $Profile remove $Plugin
if ($LASTEXITCODE -ne 0) { Write-Error '[link-uninstall] 卸载命令执行失败'; exit 1 }

if ($isLink) {
    # pnpm 对 link: 依赖卸载时可能残留 node_modules 里的符号链接，这里兜底清理
    $linkDir = Join-Path $ProfileDir "node_modules\$Plugin"
    if (Test-Path $linkDir) {
        Remove-Item -Recurse -Force $linkDir
        Write-Host "[link-uninstall] 已清理残留软连接: $linkDir"
    }
}

$after = Get-Content -Raw $ManifestPath | ConvertFrom-Json
if ($null -eq $after.dependencies.$Plugin) {
    Write-Host "[link-uninstall] 完成：$Plugin 已从 profile $Profile 卸载"
} else {
    Write-Error "[link-uninstall] 卸载后依赖中仍存在 $Plugin，请检查"
    exit 1
}
