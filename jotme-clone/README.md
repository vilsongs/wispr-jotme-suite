# JotMe Clone

Transcrição de reuniões ao vivo **100% offline e sem bot** para Windows, com separação automática de falantes (**Você** vs. **Reunião**), modo furtivo invisível em compartilhamento de tela e geração automática de **Atas de Reunião**.

Inspirado no comportamento sem bot do JotMe, porém **sem precisar instalar drivers virtuais (`VB-Cable`)**, sem pedir permissão de Administrador e sem enviar áudio para a nuvem: toda a transcrição roda localmente na sua placa de vídeo via **Vulkan** (`whisper.cpp` + `ggml-vulkan.dll`).

## Principais Recursos

| Recurso | Como funciona |
|---|---|
| **Sem Bot na chamada** | Captura o áudio diretamente do sistema via **WASAPI Loopback** nativo do Windows (Google Meet, Zoom, Teams, WhatsApp, etc.) |
| **Separação de Falantes** | **Canal 1 (`Você`)**: seu microfone com cancelamento de eco · **Canal 2 (`Reunião`)**: áudio do sistema |
| **Modo Furtivo (`Stealth`)** | Usa `setContentProtection(true)` do Windows: a barra flutuante e o painel ficam **invisíveis** quando você compartilha a tela |
| **Atas Automáticas** | Extrai estatísticas de participação, **Próximos Passos (Action Items)**, **Perguntas Levantadas** e **Pontos Principais** |
| **Exportação** | Copia a Ata formatada para a área de transferência ou exporta em **Markdown (`.md`)** e **Texto (`.txt`)** |

## Rodando

Compartilha automaticamente a pasta `whisper/` (binários Vulkan + modelo `ggml-large-v3-turbo-q5_0.bin`) com o `wispr-clone`, sem duplicar espaço em disco:

```bash
npm start        # compila e abre o JotMe Clone
npm test         # suíte de testes unitários
npm run test:cov # cobertura do núcleo
npm run test:int # teste de integração real na GPU Vulkan
```

## Arquivos do usuário

`%APPDATA%\jotme-clone\`: `settings.json`, `meetings.json` (histórico de reuniões e atas) e `logs\jotme-clone.log`.
