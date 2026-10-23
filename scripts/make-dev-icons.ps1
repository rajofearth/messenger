# Generates the development launcher icons from the production artwork.
# Run from the repository root:
#
#   powershell -ExecutionPolicy Bypass -File scripts/make-dev-icons.ps1
#
# The output is committed under assets/dev so a build never needs this script.
# The badge is deliberately loud: a dev APK should be unmistakable in the
# launcher and in the Android share/install dialogs.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root "assets"
$out = Join-Path $assets "dev"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$orange = [System.Drawing.Color]::FromArgb(255, 255, 90, 31)
$cream = [System.Drawing.Color]::FromArgb(255, 255, 241, 214)
$ink = [System.Drawing.Color]::FromArgb(255, 17, 24, 39)

function New-RoundedPath {
    param([float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$Radius)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $Radius * 2
    $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
    $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
    $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-DevIcon {
    param([string]$Source, [string]$Destination, [int]$Size, [string]$Kind)
    $base = [System.Drawing.Image]::FromFile((Join-Path $assets $Source))
    try {
        $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
            if ($Kind -eq "legacy") {
                $graphics.DrawImage($base, 0, 0, $Size, $Size)
                # A bottom ribbon keeps the original bubble visible while
                # surviving the circular masks launchers apply to legacy icons.
                $shadow = New-RoundedPath 198 800 628 160 80
                $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 0, 0, 0))
                try { $graphics.FillPath($shadowBrush, $shadow) } finally { $shadowBrush.Dispose(); $shadow.Dispose() }
                $ribbon = New-RoundedPath 190 790 644 160 80
                $ribbonBrush = New-Object System.Drawing.SolidBrush($orange)
                $ribbonPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 8)
                try {
                    $graphics.FillPath($ribbonBrush, $ribbon)
                    $graphics.DrawPath($ribbonPen, $ribbon)
                } finally {
                    $ribbonBrush.Dispose()
                    $ribbonPen.Dispose()
                    $ribbon.Dispose()
                }
                $font = New-Object System.Drawing.Font("Segoe UI Black", 92, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
                $format = New-Object System.Drawing.StringFormat
                try {
                    $format.Alignment = [System.Drawing.StringAlignment]::Center
                    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
                    $graphics.DrawString("DEV", $font, [System.Drawing.Brushes]::White, [System.Drawing.RectangleF]::new(190, 790, 644, 160), $format)
                } finally {
                    $font.Dispose()
                    $format.Dispose()
                }
            } elseif ($Kind -eq "foreground") {
                $graphics.DrawImage($base, 0, 0, $Size, $Size)
                # The existing bubble occupies 144..370; this pill sits below
                # it and still inside Android's adaptive-icon safe zone.
                $pill = New-RoundedPath 136 356 240 64 32
                $pillBrush = New-Object System.Drawing.SolidBrush($orange)
                try { $graphics.FillPath($pillBrush, $pill) } finally { $pillBrush.Dispose(); $pill.Dispose() }
                $font = New-Object System.Drawing.Font("Segoe UI Black", 30, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
                $format = New-Object System.Drawing.StringFormat
                try {
                    $format.Alignment = [System.Drawing.StringAlignment]::Center
                    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
                    $graphics.DrawString("DEV", $font, [System.Drawing.Brushes]::White, [System.Drawing.RectangleF]::new(136, 356, 240, 64), $format)
                } finally {
                    $font.Dispose()
                    $format.Dispose()
                }
            } else {
                $graphics.Clear($cream)
                # Warm diagonal stripe makes the dev background different even
                # before the DEV badge is read.
                $stripe = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 184, 120))
                try {
                    $points = [System.Drawing.PointF[]]@(
                        [System.Drawing.PointF]::new(0, 330),
                        [System.Drawing.PointF]::new(330, 0),
                        [System.Drawing.PointF]::new(512, 0),
                        [System.Drawing.PointF]::new(512, 70),
                        [System.Drawing.PointF]::new(70, 512),
                        [System.Drawing.PointF]::new(0, 512)
                    )
                    $graphics.FillPolygon($stripe, $points)
                } finally { $stripe.Dispose() }
                $edge = New-Object System.Drawing.SolidBrush($orange)
                try { $graphics.FillRectangle($edge, 0, $Size - 18, $Size, 18) } finally { $edge.Dispose() }
            }
            $bitmap.Save((Join-Path $out $Destination), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $graphics.Dispose()
            $bitmap.Dispose()
        }
    } finally {
        $base.Dispose()
    }
}

New-DevIcon "icon.png" "icon.png" 1024 "legacy"
New-DevIcon "android-icon-foreground.png" "android-icon-foreground.png" 512 "foreground"
New-DevIcon "android-icon-background.png" "android-icon-background.png" 512 "background"
Copy-Item (Join-Path $assets "android-icon-monochrome.png") (Join-Path $out "android-icon-monochrome.png") -Force

# Keep the web favicon in step with the installer icon. The app only targets
# Android, but Expo's web config still asks for a favicon.
$icon = [System.Drawing.Image]::FromFile((Join-Path $out "icon.png"))
try {
    $favicon = New-Object System.Drawing.Bitmap(48, 48)
    $graphics = [System.Drawing.Graphics]::FromImage($favicon)
    try {
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage($icon, 0, 0, 48, 48)
    } finally {
        $graphics.Dispose()
    }
    $favicon.Save((Join-Path $out "favicon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $favicon.Dispose()
} finally {
    $icon.Dispose()
}

Write-Host "Wrote development icons to $out"
