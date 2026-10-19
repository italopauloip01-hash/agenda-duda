# Publica uma alteração do Bellisa: sobe a versão do app, confere o código e manda para o ar.
# Uso: powershell -File tools\publicar.ps1 "Descrição da alteração"
param([Parameter(Mandatory = $true)][string]$Mensagem)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
Set-Location $raiz
$utf8 = New-Object Text.UTF8Encoding $false

# 1. versão: bellisa-vN no service worker (força o celular a baixar a nova) e 3.N no app
$sw = [IO.File]::ReadAllText("$raiz\sw.js", $utf8)
$n = [int]([regex]::Match($sw, "'bellisa-v(\d+)'").Groups[1].Value) + 1
$sw = $sw -replace "'bellisa-v\d+'", "'bellisa-v$n'"
[IO.File]::WriteAllText("$raiz\sw.js", $sw, $utf8)
$agora = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'E. South America Standard Time').ToString('dd/MM/yyyy HH:mm')
$idx = [IO.File]::ReadAllText("$raiz\index.html", $utf8)
$idx = $idx -replace "const VERSAO_APP='[^']*'; const VERSAO_DATA='[^']*';", "const VERSAO_APP='3.$n'; const VERSAO_DATA='$agora';"
[IO.File]::WriteAllText("$raiz\index.html", $idx, $utf8)

# 2. confere se o JavaScript das páginas está sem erro de sintaxe
$tmp = Join-Path ([IO.Path]::GetTempPath()) 'bellisa-check.js'
foreach ($f in 'index.html', 'agendar.html') {
  $t = [IO.File]::ReadAllText("$raiz\$f", $utf8)
  [IO.File]::WriteAllText($tmp, [regex]::Matches($t, '(?s)<script>(.*?)</script>')[0].Groups[1].Value, $utf8)
  node --check $tmp; if ($LASTEXITCODE) { throw "Erro de sintaxe em $f — nada foi publicado" }
}
node --check "$raiz\sw.js"; if ($LASTEXITCODE) { throw 'Erro de sintaxe em sw.js — nada foi publicado' }

# 3. commit e envio (a Vercel e o GitHub Pages publicam sozinhos)
$msg = Join-Path ([IO.Path]::GetTempPath()) 'bellisa-msg.txt'
[IO.File]::WriteAllText($msg, "$Mensagem (versão 3.$n)`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`n", $utf8)
git add -A; git commit -q -F $msg; git push -q origin main
Write-Output "Publicado: versão 3.$n ($agora) — $(git log --oneline -1)"
