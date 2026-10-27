# Wispr Clone

Ditado por voz **100% offline** para Windows, em português com termos em inglês. Segure o atalho, fale e solte: o texto aparece onde está o cursor, em qualquer programa.

Inspirado no comportamento do Wispr Flow. O código, os sons, os ícones e o visual são próprios. A transcrição roda localmente com o [whisper.cpp](https://github.com/ggml-org/whisper.cpp), e nada vai para a internet.

## Como usar

| Ação | Atalho |
|---|---|
| Ditar | **segure Ctrl + Win**, fale e solte |
| Modo mãos-livres | **toque rápido** em Ctrl + Win; toque de novo para terminar |
| Cancelar | **Esc** durante a gravação |

- Uma pílula na parte de baixo da tela mostra o estado: ouvindo, mãos-livres, transcrevendo ou erro.
- O ícone na bandeja do sistema abre o painel com **Histórico**, **Dicionário** e **Ajustes**.
- **Dicionário → Vocabulário**: nomes e siglas que o Whisper deve grafar certo (ex.: `Previplan`).
- **Dicionário → Substituições**: correções aplicadas depois, no formato `errado => certo`.
- Atalho alternativo nos Ajustes: **Ctrl direito** sozinho.

## Rodando

Requisitos: Node.js 22+ e os arquivos do Whisper em `whisper/` (já baixados nesta máquina):

```
whisper/bin/whisper-server.exe (+ DLLs)   ← whisper-blas-bin-x64.zip + ggml-vulkan.dll (release b5454)
whisper/models/ggml-large-v3-turbo-q5_0.bin ← huggingface.co/ggerganov/whisper.cpp
```

```bash
npm install
npm start          # compila e abre o app
npm run start:dry  # igual, mas só registra no log o que colaria (para testes)
```

## Desempenho medido (Radeon RX 6750 XT via Vulkan + Ryzen 7 5700X3D)

| Fala | Antes (só CPU) | Agora (GPU Vulkan + otimizações) |
|---|---|---|
| 11,5 s | ~3,37 s | **~0,24 s (239 ms)** |

O modelo carrega uma vez (< 1 s) na VRAM da GPU (~573 MB) e fica pronto na memória. O silêncio nas pontas é aparado antes do envio e a janela de áudio do Whisper é ajustada à duração da fala (mínimo 256 posições, com 3 s de folga e Flash Attention).

## Arquitetura

```
src/core/       lógica pura e testada (atalho, ditado, limpeza, WAV, Whisper, colagem, ajustes, histórico)
src/electron/   processo principal: bandeja, janelas, user32.dll via koffi, whisper-server
src/renderer/   telas: gravador oculto (AudioWorklet 16 kHz), pílula de status, painel
tests/          testes unitários (vitest) e de integração com o Whisper real
```

Fluxo de um ditado: o vigia do teclado consulta `GetAsyncKeyState` a cada 15 ms. A janela oculta grava o microfone em PCM. O áudio vai para o `whisper-server`, que atende só em `127.0.0.1`. O texto passa pela limpeza local (hesitações, alucinações de silêncio, dicionário). Depois ele vai para a área de transferência, o app envia **Ctrl+V** via `SendInput` e restaura a área de transferência anterior.

## Testes

```bash
npm test          # 94 testes unitários
npm run test:cov  # cobertura do núcleo (meta 80%)
npm run test:int  # integração com o whisper-server real (~5 s)
npm run typecheck
```

## Limitações conhecidas

- **Apps como administrador**: o Windows bloqueia o envio de teclas para eles (UIPI). O texto não é colado e a pílula avisa.
- **GPU via Vulkan**: usa `ggml-vulkan.dll` automaticamente em placas compatíveis (AMD/Intel/NVIDIA); se não houver GPU Vulkan disponível, faz fallback automático para a CPU.
- Atalhos do Windows com Ctrl+Win (ex.: **Ctrl+Win+D**) continuam funcionando: a gravação é cancelada em silêncio quando outra tecla entra junto.
- O texto colado passa pela área de transferência e, por isso, também aparece no histórico **Win+V** do Windows (que fica só nesta máquina, a não ser que a sincronização na nuvem do Windows esteja ligada).
- O app espera 250 ms antes de restaurar a área de transferência. Em programas muito lentos (área de trabalho remota, VMs), pode ser colado o conteúdo antigo. Nesse caso, desligue "Restaurar a área de transferência" nos Ajustes.

## Arquivos do usuário

`%APPDATA%\wispr-clone\`: `settings.json`, `history.json` (últimos 500 ditados) e `logs\wispr-clone.log`.
