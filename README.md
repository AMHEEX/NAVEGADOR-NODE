# NAVEGADOR-NODE — IAMEGM AUTOAGENT (Takeshi Bot no Navegador Termux)

**IAMEGM AUTOAGENT**  
O Takeshi Bot convertido para **NAVEGADOR-NODE** + Chromium no Termux.

Tudo que você precisa para automatizar sites (IAMEGM, painéis, formulários, multas, etc.) com cliques, digitação, scripts PHP e navegação automática.

---

## 🚀 IAMEGM NO TOPO DO REPOSITÓRIO

A imagem que está na pasta **`assets/index.png`** é **o dashboard principal do IAMEGM AutoAgent**.

- **O que ela mostra?**  
  O navegador Node.js rodando o IAMEGM AutoAgent em execução (com cliques, texto, scripts e automações carregadas).

- **Como usar?**  
  Abra ela sempre que quiser ver o estado atual do navegador em tempo real.

- **Para atualizar a imagem:**  
  Toque no ícone flutuante (ícone amarelo) > **🔄 Virar Tela** ou execute o comando PHP `screenshot()`.

---

## Instalação (1 comando único)

```bash
termux-setup-storage && pkg update -y && pkg upgrade -y && pkg install -y tur-repo x11-repo root-repo build-essential git wget curl zip unzip tar python nodejs clang make cmake libxml2 libxslt openssl readline zlib termux-tools php && cd /sdcard/ && if [ -d "NAVEGADOR-NODE" ]; then cd NAVEGADOR-NODE; else git clone https://github.com/AMHEEX/NAVEGADOR-NODE.git && cd NAVEGADOR-NODE ; fi && npm start