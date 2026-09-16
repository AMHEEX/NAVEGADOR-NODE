# README - NAVEGADOR-NODE (Auto-Automatização Termux com Chromium)

## Descrição
Este é o **NAVEGADOR-NODE**, um navegador **Node.js** feito especialmente para o **Termux** no Android.  
Ele automatiza sites de forma completa usando **Chromium** (renderizador de páginas), com suporte total a:
- **Script PHP** (acesso direto via PHP Control)
- **Automatização de cliques**
- **Inserção de texto**
- **Navegação automática** (acessa a página automaticamente toda vez que você executa o comando)

Com ele você pode rodar qualquer site de forma **100% automática** (ex: automação de IAMEGM, tarefas repetitivas, scripts de preenchimento, etc.).

## Funcionalidades Principais
- Navegador Chromium nativo no Termux (rápido e leve)
- Controle via **PHP** (qualquer script PHP roda direto no navegador)
- Automatiza cliques, digitação de texto, espera, etc.
- Modo headless ou visível (escolha no script)
- Instalação automática em 1 comando

## Requisitos
- **Termux** atualizado
- Android 7+ (melhor em Android 10+)
- Permissões de armazenamento e rede

## Instalação (1 comando - Funciona agora!)

Abra o **Termux** e execute **exatamente** este comando:

```bash
pkg update && pkg upgrade -y
pkg install x11-repo chromium -y
bash <(curl -s https://raw.githubusercontent.com/AMHEEX/NAVEGADOR-NODE/main/index.sh)