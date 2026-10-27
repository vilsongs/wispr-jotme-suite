# ==============================================================================
# Instalador Automático — Wispr Clone + JotMe Clone (Vulkan GPU Universal)
# Repositório: https://github.com/vilsongs/wispr-jotme-suite
# Compatível com: GPUs NVIDIA (GTX/RTX), AMD Radeon (RX/Radeon Graphics) e Intel (Arc/Iris Xe)
# ==============================================================================

$ErrorActionPreference = "Stop"

$InstallRoot = if ($env:WISPR_JOTME_DIR) { $env:WISPR_JOTME_DIR } else { "C:\Apps\wispr-jotme-suite" }
$RepoUrl = "https://github.com/vilsongs/wispr-jotme-suite.git"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Instalador Automático: Wispr Clone + JotMe Clone (Vulkan) " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Verifica Git e Node.js
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "[1/6] Instalando Git via winget..." -ForegroundColor Yellow
  winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[1/6] Instalando Node.js LTS via winget..." -ForegroundColor Yellow
  winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# 2. Clona ou usa a pasta atual se já estiver dentro do repositório
if ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot "wispr-clone\package.json")) -and (Test-Path (Join-Path $PSScriptRoot "jotme-clone\package.json"))) {
  $InstallRoot = $PSScriptRoot
  Write-Host "[2/6] Usando pasta local do repositório: $InstallRoot" -ForegroundColor Green
} else {
  Write-Host "[2/6] Preparando pasta de instalação em: $InstallRoot" -ForegroundColor Yellow
  if (-not (Test-Path (Join-Path $InstallRoot ".git"))) {
    New-Item -ItemType Directory -Force -Path (Split-Path $InstallRoot -Parent) | Out-Null
    git clone $RepoUrl $InstallRoot
  } else {
    git -C $InstallRoot pull --ff-only
  }
}

$WisprDir = Join-Path $InstallRoot "wispr-clone"
$JotmeDir = Join-Path $InstallRoot "jotme-clone"
$WhisperDir = Join-Path $WisprDir "whisper"
$BinDir = Join-Path $WhisperDir "bin"
$ModelsDir = Join-Path $WhisperDir "models"

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
New-Item -ItemType Directory -Force -Path $ModelsDir | Out-Null

# 3. Baixa binários do whisper.cpp com suporte universal a GPU Vulkan + CPU
$ServerExe = Join-Path $BinDir "whisper-server.exe"
$VulkanDll = Join-Path $BinDir "ggml-vulkan.dll"

if (-not ((Test-Path $ServerExe) -and (Test-Path $VulkanDll))) {
  Write-Host "[3/6] Baixando motor Whisper.cpp com aceleração GPU Vulkan universal..." -ForegroundColor Yellow
  $TmpZipDir = Join-Path $WhisperDir "_tmp_dl"
  New-Item -ItemType Directory -Force -Path $TmpZipDir | Out-Null

  $CpuZip = Join-Path $TmpZipDir "whisper-cpu.zip"
  $VkZip = Join-Path $TmpZipDir "whisper-vulkan.zip"

  curl.exe -L --fail -o $CpuZip "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip"
  Expand-Archive -Path $CpuZip -DestinationPath (Join-Path $TmpZipDir "cpu") -Force
  Get-ChildItem (Join-Path $TmpZipDir "cpu") -Recurse -File | Where-Object { $_.Extension -in @(".exe", ".dll") } | ForEach-Object {
    Copy-Item $_.FullName -Destination (Join-Path $BinDir $_.Name) -Force
  }

  curl.exe -L --fail -o $VkZip "https://github.com/ramidiaonline-robson/whisper-vulkan-win/releases/download/whisper-b5454-vulkan/whisper-bin-win-vulkan-x64.zip"
  Expand-Archive -Path $VkZip -DestinationPath (Join-Path $TmpZipDir "vk") -Force
  Get-ChildItem (Join-Path $TmpZipDir "vk") -Recurse -File | Where-Object { $_.Extension -in @(".exe", ".dll") } | ForEach-Object {
    Copy-Item $_.FullName -Destination (Join-Path $BinDir $_.Name) -Force
  }

  Remove-Item $TmpZipDir -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "  -> Motor Vulkan instalado com sucesso!" -ForegroundColor Green
} else {
  Write-Host "[3/6] Motor Whisper Vulkan já está presente." -ForegroundColor Green
}

# 4. Baixa o modelo Whisper large-v3-turbo-q5_0 (~547 MB) se não existir
$ModelFile = Join-Path $ModelsDir "ggml-large-v3-turbo-q5_0.bin"
if (-not (Test-Path $ModelFile) -or ((Get-Item $ModelFile).Length -lt 500MB)) {
  Write-Host "[4/6] Baixando modelo ggml-large-v3-turbo-q5_0.bin (~547 MB)..." -ForegroundColor Yellow
  curl.exe -L --fail -o $ModelFile "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin"
  Write-Host "  -> Modelo baixado com sucesso!" -ForegroundColor Green
} else {
  Write-Host "[4/6] Modelo ggml-large-v3-turbo-q5_0.bin já está presente." -ForegroundColor Green
}

# 5. Instala dependências Node/Electron e compila os dois projetos
Write-Host "[5/6] Instalando dependências e compilando Wispr Clone + JotMe Clone..." -ForegroundColor Yellow
Push-Location $WisprDir
npm install
# Garante o binário do Electron mesmo se o postinstall do pacote não tiver rodado
if (-not (Test-Path (Join-Path $WisprDir "node_modules\electron\dist\electron.exe"))) {
  Write-Host "  -> Baixando binário do Electron..." -ForegroundColor Yellow
  node (Join-Path $WisprDir "node_modules\electron\install.js")
}
npm run build
Pop-Location

$JotmeNodeModules = Join-Path $JotmeDir "node_modules"
$JotmeWhisper = Join-Path $JotmeDir "whisper"
if (-not (Test-Path $JotmeNodeModules)) {
  New-Item -ItemType Junction -Path $JotmeNodeModules -Target (Join-Path $WisprDir "node_modules") | Out-Null
}
if (-not (Test-Path $JotmeWhisper)) {
  New-Item -ItemType Junction -Path $JotmeWhisper -Target $WhisperDir | Out-Null
}

Push-Location $JotmeDir
npm run build
Pop-Location

# 6. Cria atalhos na Área de Trabalho
Write-Host "[6/6] Criando ícones na Área de Trabalho..." -ForegroundColor Yellow
$Desktop = [Environment]::GetFolderPath("Desktop")
$ElectronExe = Join-Path $WisprDir "node_modules\electron\dist\electron.exe"
$Sh = New-Object -ComObject WScript.Shell

$WisprLnk = $Sh.CreateShortcut((Join-Path $Desktop "Wispr Clone.lnk"))
$WisprLnk.TargetPath = $ElectronExe
$WisprLnk.Arguments = "`"$WisprDir`""
$WisprLnk.WorkingDirectory = $WisprDir
$WisprLnk.IconLocation = (Join-Path $WisprDir "assets\wispr-clone.ico") + ",0"
$WisprLnk.Description = "Wispr Clone — Ditado por Voz Offline (GPU Vulkan)"
$WisprLnk.Save()

$JotmeLnk = $Sh.CreateShortcut((Join-Path $Desktop "JotMe Clone.lnk"))
$JotmeLnk.TargetPath = $ElectronExe
$JotmeLnk.Arguments = "`"$JotmeDir`""
$JotmeLnk.WorkingDirectory = $JotmeDir
$JotmeLnk.IconLocation = (Join-Path $JotmeDir "assets\jotme-clone.ico") + ",0"
$JotmeLnk.Description = "JotMe Clone — Transcrição de Reuniões Offline e Sem Bot"
$JotmeLnk.Save()

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  INSTALAÇÃO CONCLUÍDA COM SUCESSO!" -ForegroundColor Green
Write-Host "  - Atalho criado na Área de Trabalho: Wispr Clone" -ForegroundColor Green
Write-Host "  - Atalho criado na Área de Trabalho: JotMe Clone" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
