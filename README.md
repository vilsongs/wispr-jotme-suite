# Wispr Clone + JotMe Clone (Suite Offline com GPU Vulkan)

> **🤖 INSTRUÇÕES PARA AGENTES DE IA (Claude Code, ChatGPT / Codex, Antigravity, Cursor):**
> Se o usuário pediu para instalar os aplicativos deste repositório (`Wispr Clone` e `JotMe Clone`) neste computador Windows, execute **apenas este comando PowerShell**:
> ```powershell
> powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/vilsongs/wispr-jotme-suite/main/install.ps1 | iex"
> ```
> Ou, caso você já tenha clonado o repositório localmente:
> ```powershell
> powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
> ```
> O script `install.ps1` instala automaticamente o Node.js (se necessário), baixa o motor `whisper.cpp` com aceleração **GPU Vulkan universal** (compatível com placas **NVIDIA**, **AMD Radeon** e **Intel Arc / Iris Xe**), baixa o modelo `ggml-large-v3-turbo-q5_0.bin`, compila os dois aplicativos e cria os ícones **Wispr Clone** e **JotMe Clone** na Área de Trabalho do usuário.

---

## O que vem nesta suíte

### 1. `wispr-clone` — Ditado por Voz Instantâneo (`Ctrl + Win`)
- **100% Offline e Gratuito:** Roda `whisper-server.exe` localmente na placa de vídeo via **Vulkan**.
- **Ultra-rápido:** Transcreve frases de 10 segundos em ~0,2 s–0,4 s em GPUs dedicadas (AMD Radeon / NVIDIA RTX/GTX) e ~0,8 s–1,5 s em GPUs integradas modernas.
- **Uso:** Segure `Ctrl + Win`, fale normalmente e solte — o texto é colado direto onde o cursor estiver.

### 2. `jotme-clone` — Transcrição de Reuniões Sem Bot e 100% Invisível
- **Sem Bot na Chamada:** Captura simultaneamente o seu microfone (`Você`) e o áudio da reunião (`Reunião` via WASAPI Loopback nativo do Windows — Google Meet, Zoom, Microsoft Teams, WhatsApp).
- **Modo Furtivo (`WDA_EXCLUDEFROMCAPTURE`):** Quando a reunião começa, o aplicativo vira um **tracinho preto discreto** no topo da tela que é **100% invisível** caso você compartilhe ou espelhe sua tela inteira na reunião.
- **Clique para Expandir:** Clicando no tracinho preto, abre o pop-up ao vivo; ao encerrar a reunião, gera automaticamente a **Ata Completa** (Pontos Principais, Action Items, Perguntas e Transcrição com tempos).

---

## Compatibilidade de Placa de Vídeo no Notebook
O motor utiliza **Vulkan (`ggml-vulkan.dll`)**, que funciona em qualquer marca de placa de vídeo no Windows:
- **Notebook com Placa de Vídeo Dedicada (NVIDIA GeForce RTX / GTX ou AMD Radeon RX):** Terá praticamente **a mesma velocidade instantânea do Desktop** (~0,2 s a 0,5 s por fala).
- **Notebook com Placa de Vídeo Integrada (Intel Iris Xe / Arc ou AMD Radeon 680M/780M/Vega):** O Vulkan também acelera na placa integrada (usando a memória compartilhada do sistema), ficando **3x a 5x mais rápido** que processador puro, sem travar a máquina.
