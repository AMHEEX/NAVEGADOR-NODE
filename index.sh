pkg instal x11-repo -y chromium -y

termux-setup-storage && pkg update -y && pkg upgrade -y && pkg install -y tur-repo x11-repo root-repo build-essential git wget curl zip unzip tar python nodejs clang make cmake libxml2 libxslt openssl readline zlib termux-tools php && cd /sdcard/ && if [ -d "NAVEGADOR-NODE" ]; then cd NAVEGADOR-NODE; else git clone https://github.com/AMHEEX/NAVEGADOR-NODE.git && cd NAVEGADOR-NODE ; fi && npm start
