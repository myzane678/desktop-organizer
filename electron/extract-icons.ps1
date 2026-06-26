# extract-icons.ps1
param([string]$Paths)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing

$files = $Paths | ConvertFrom-Json
if ($files -isnot [array]) { $files = @($files) }
$result = @{}

for ($i = 0; $i -lt $files.Length; $i++) {
    $fp = $files[$i].Replace('/', '\')
    try {
        if (-not (Test-Path $fp)) { continue }
        $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($fp)
        if ($null -eq $icon) { continue }

        $bmp = New-Object System.Drawing.Bitmap(64, 64)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $rect = New-Object System.Drawing.Rectangle(0, 0, 64, 64)
        $g.DrawIcon($icon, $rect)
        $g.Dispose()

        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $bytes = $ms.ToArray()
        $ms.Dispose()
        $bmp.Dispose()
        $icon.Dispose()

        if ($bytes.Length -gt 100) {
            $b64 = [Convert]::ToBase64String($bytes)
            $result[$files[$i]] = "data:image/png;base64,$b64"
        }
    } catch {}
}

$result | ConvertTo-Json -Compress -Depth 1
