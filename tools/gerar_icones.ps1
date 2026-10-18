# Gera os ícones PNG do app Bellisa (lírio de três pétalas) a partir das
# mesmas curvas de icons/bellisa.svg. Uso: powershell -File tools\gerar_icones.ps1
Add-Type -AssemblyName System.Drawing
$raiz = Split-Path $PSScriptRoot -Parent
$pasta = Join-Path $raiz 'icons'
New-Item -ItemType Directory -Force $pasta | Out-Null

function Cor($hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }

# desenha no espaço 96x96; $arred = cantos arredondados; $escala = tamanho do lírio
function Icone($tam, $arred, $escala, $arquivo) {
  $bmp = New-Object System.Drawing.Bitmap $tam, $tam
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.PixelOffsetMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.ScaleTransform($tam / 96, $tam / 96)

  $fundo = New-Object System.Drawing.SolidBrush (Cor '#B85E78')
  if ($arred) {
    $r = 26; $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddArc(0, 0, 2*$r, 2*$r, 180, 90); $p.AddArc(96-2*$r, 0, 2*$r, 2*$r, 270, 90)
    $p.AddArc(96-2*$r, 96-2*$r, 2*$r, 2*$r, 0, 90); $p.AddArc(0, 96-2*$r, 2*$r, 2*$r, 90, 90)
    $p.CloseFigure(); $g.FillPath($fundo, $p)
  } else { $g.FillRectangle($fundo, 0, 0, 96, 96) }

  # centraliza o lírio (desenho ocupa ~y 18..74) e aplica a escala
  $g.TranslateTransform(48, 46); $g.ScaleTransform($escala, $escala); $g.TranslateTransform(-48, -46)

  $creme = New-Object System.Drawing.SolidBrush (Cor '#FFF8F6')
  $blush = New-Object System.Drawing.SolidBrush (Cor '#F6D9DF')
  $ouro  = New-Object System.Drawing.SolidBrush (Cor '#E8C487')
  function Petala($pts, $pincel) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddBeziers([System.Drawing.PointF[]]$pts); $p.CloseFigure(); $g.FillPath($pincel, $p)
  }
  $P = { param($x,$y) New-Object System.Drawing.PointF $x, $y }
  # M48 18 C59 31 60 50 48 66 C36 50 37 31 48 18
  Petala @((& $P 48 18),(& $P 59 31),(& $P 60 50),(& $P 48 66),(& $P 36 50),(& $P 37 31),(& $P 48 18)) $creme
  # M44 66 C30 65 20 53 21 38 C33 42 42 52 44 66
  Petala @((& $P 44 66),(& $P 30 65),(& $P 20 53),(& $P 21 38),(& $P 33 42),(& $P 42 52),(& $P 44 66)) $blush
  # M52 66 C66 65 76 53 75 38 C63 42 54 52 52 66
  Petala @((& $P 52 66),(& $P 66 65),(& $P 76 53),(& $P 75 38),(& $P 63 42),(& $P 54 52),(& $P 52 66)) $blush
  if ($tam -ge 48) {  # linha dourada some em tamanhos muito pequenos
    $b = New-Object System.Drawing.Drawing2D.GraphicsPath
    $b.AddArc(34, 70, 4, 4, 90, 180); $b.AddArc(58, 70, 4, 4, 270, 180); $b.CloseFigure(); $g.FillPath($ouro, $b)
  }
  $g.Dispose()
  $bmp.Save((Join-Path $pasta $arquivo), [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  "ok $arquivo"
}

Icone 192 $true  1.0  'icon-192.png'
Icone 512 $true  1.0  'icon-512.png'
Icone 512 $false 0.82 'maskable-512.png'     # Android recorta em círculo/squircle
Icone 180 $false 0.92 'apple-touch-icon.png' # iPhone arredonda sozinho
Icone 32  $true  1.0  'favicon-32.png'
