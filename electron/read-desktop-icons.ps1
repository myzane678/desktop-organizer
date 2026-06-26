# read-desktop-icons.ps1
# Registry 方案：从 IconLayouts 读取桌面图标的名称和网格坐标

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Windows.Forms

$regPath = "HKCU:\Software\Microsoft\Windows\Shell\Bags\1\Desktop"
$iconLayouts = Get-ItemProperty -Path $regPath -Name "IconLayouts" -ErrorAction SilentlyContinue

if (-not $iconLayouts -or -not $iconLayouts.IconLayouts) {
    Write-Error "Cannot read IconLayouts"
    exit 1
}

$data = $iconLayouts.IconLayouts
$totalIcons = [BitConverter]::ToUInt32($data, 24)

# ========== 提取文件名（全数据扫描，过滤 GUID） ==========
$allNames = @()
$pos = 0

while ($pos -lt $data.Length - 16) {
    $nameLen = [BitConverter]::ToUInt32($data, $pos)

    if ($nameLen -ge 5 -and $nameLen -le 80) {
        $strStart = $pos + 8

        if ($strStart + $nameLen * 2 -le $data.Length) {
            $nameBytes = $data[$strStart..($strStart + $nameLen * 2 - 1)]
            $rawName = [System.Text.Encoding]::Unicode.GetString($nameBytes)
            $rawName = $rawName.TrimEnd([char]0)

            # Clean null bytes and control chars from start
            $rawName = $rawName.TrimStart([char]0, [char]1, [char]2, [char]3, [char]4,
                [char]5, [char]6, [char]7, [char]8, [char]9, [char]10, [char]11,
                [char]12, [char]13, [char]14, [char]15, [char]16, [char]17,
                [char]18, [char]19, [char]20, ' ', '\', [char]9)

            # Split by > or |
            $parts = $rawName -split '[>|]'

            foreach ($part in $parts) {
                # Remove ALL non-printable chars and leading junk
                $cleaned = ""
                foreach ($ch in $part.ToCharArray()) {
                    $code = [int]$ch
                    if ($code -ge 32) { $cleaned += $ch }
                }
                $part = $cleaned.Trim()
                # Remove leading backslashes and spaces (path junk)
                while ($part.Length -gt 0 -and ($part[0] -eq '\' -or $part[0] -eq ' ')) {
                    $part = $part.Substring(1)
                }
                $part = $part.Trim()

                if ($part.Length -ge 2) {
                    # 跳过 GUID 和系统标识符
                    if ($part -match '[{}]' -or $part -match '::' ) { continue }
                    # 跳过系统路径片段
                    if ($part -match '^[A-Z]:\\' -or $part -match '^\\' ) { continue }
                    # 跳过纯数字
                    if ($part -match '^\d+$') { continue }
                    # 跳过截断的名称（以.结尾表示后面被截断）
                    if ($part.EndsWith('.')) { continue }
                    # 跳过看起来像十六进制的长串
                    if ($part.Length -gt 20 -and $part -match '^[0-9A-Fa-f-]+$') { continue }

                    $allNames += $part
                }
            }
        }
    }
    $pos += 2
}

# Remove duplicates preserving order
$seen = @{}
$uniqueNames = @()
foreach ($n in $allNames) {
    if (-not $seen.ContainsKey($n)) {
        $seen[$n] = $true
        $uniqueNames += $n
    }
}

# ========== 提取网格坐标 ==========
$gridStart = 5578
$recSize = 10
$coords = @()
$pos = $gridStart

while ($pos + $recSize -le $data.Length) {
    $x = [BitConverter]::ToSingle($data, $pos + 4)
    $idx = $data[$pos + 8]

    if ($x -ge 0 -and $x -le 30 -and $x -eq [Math]::Floor($x) -and $idx -ge 1 -and $idx -le 200) {
        $y = [Math]::Floor(($idx - 1) / 10)
        $coords += @{x = $x; y = $y; idx = $idx}
    } else {
        break
    }
    $pos += $recSize
}

# ========== 屏幕和网格参数 ==========
$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$screenW = [int]$screen.Bounds.Width
$screenH = [int]$screen.Bounds.Height

$gridXs = @($coords | ForEach-Object { [int]$_.x } | Sort-Object -Unique)
$gridYs = @($coords | ForEach-Object { [int]$_.y } | Sort-Object -Unique)
$gridCols = if ($gridXs.Count -gt 0) { ([int]($gridXs | Measure-Object -Maximum).Maximum) + 1 } else { 0 }
$gridRows = if ($gridYs.Count -gt 0) { ([int]($gridYs | Measure-Object -Maximum).Maximum) + 1 } else { 0 }

$iconSpacingX = if ($gridCols -gt 0) { [Math]::Max(1, [Math]::Round($screenW / $gridCols)) } else { 1 }
$iconSpacingY = if ($gridRows -gt 0) { [Math]::Max(1, [Math]::Round($screenH / $gridRows)) } else { 1 }

# ========== 合并文件名和坐标 ==========
$icons = @()

# Pair by index: name[i] with coord[i]
$count = [Math]::Max($uniqueNames.Count, $coords.Count)

for ($i = 0; $i -lt $count; $i++) {
    $name = ""
    $gridX = 0
    $gridY = 0
    $hasPos = $false

    if ($i -lt $uniqueNames.Count) { $name = $uniqueNames[$i] }
    if ($i -lt $coords.Count) {
        $gridX = $coords[$i].x
        $gridY = $coords[$i].y
        $hasPos = $true
    }

    $pixelX = [Math]::Round($gridX * $iconSpacingX)
    $pixelY = [Math]::Round($gridY * $iconSpacingY)

    if ($name -ne "") {
        $icons += @{
            name = $name
            x = $pixelX
            y = $pixelY
            gridX = [int]$gridX
            gridY = [int]$gridY
            hasPosition = $hasPos
        }
    }
}

# ========== 输出 JSON ==========
$result = @{
    desktop = @{ x = 0; y = 0; width = $screenW; height = $screenH }
    icons = $icons
    count = $icons.Count
    iconCount = [int]$totalIcons
    coordCount = $coords.Count
    nameCount = $uniqueNames.Count
    gridCols = $gridCols
    gridRows = $gridRows
}

$result | ConvertTo-Json -Compress -Depth 3
