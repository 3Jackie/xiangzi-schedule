Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$outputDirectory = Join-Path $PSScriptRoot '..\src\assets'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

$bitmap = [System.Drawing.Bitmap]::new(256, 256, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.Color]::Transparent)

$path = [System.Drawing.Drawing2D.GraphicsPath]::new()
$path.AddArc(12, 12, 72, 72, 180, 90)
$path.AddArc(172, 12, 72, 72, 270, 90)
$path.AddArc(172, 172, 72, 72, 0, 90)
$path.AddArc(12, 172, 72, 72, 90, 90)
$path.CloseFigure()
$background = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 215, 109, 67))
$graphics.FillPath($background, $path)

$font = [System.Drawing.Font]::new('Microsoft YaHei UI', 116, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$foreground = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
$format = [System.Drawing.StringFormat]::new()
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$glyph = [string][char]0x5DF7
$graphics.DrawString($glyph, $font, $foreground, [System.Drawing.RectangleF]::new(24, 24, 208, 208), $format)

$pngPath = Join-Path $outputDirectory 'icon.png'
$icoPath = Join-Path $outputDirectory 'icon.ico'
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$memory = [System.IO.MemoryStream]::new()
$bitmap.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $memory.ToArray()
$stream = [System.IO.File]::Create($icoPath)
$writer = [System.IO.BinaryWriter]::new($stream)
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]1)
$writer.Write([Byte]0)
$writer.Write([Byte]0)
$writer.Write([Byte]0)
$writer.Write([Byte]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]32)
$writer.Write([UInt32]$pngBytes.Length)
$writer.Write([UInt32]22)
$writer.Write($pngBytes)
$writer.Dispose()
$stream.Dispose()
$memory.Dispose()

$format.Dispose()
$foreground.Dispose()
$font.Dispose()
$background.Dispose()
$path.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output "Created application icon assets."
