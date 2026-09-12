# ========================================================

termux-setup-storage

# ========================================================

pkg update -y && pkg upgrade -y && pkg install -y tur-repo x11-repo root-repo build-essential git wget curl zip unzip tar python nodejs clang make cmake libxml2 libxslt openssl readline zlib termux-tools && termux-setup-storage

pkg update -y
pkg install php -y

# ========================================================
 
# 1. Atualiza o Termux
pkg update && pkg upgrade -y

# 2. Ativa o repositório X11 (necessário para o Chromium)
pkg install x11-repo -y

# 3. Instala o Chromium
pkg install chromium -y

# 4. Verifica se instalou
which chromium-browser
chromium-browser --version

# ========================================================

rm -rf ~/storage/shared
ln -s /storage/emulated/0 ~/storage/shared
cd ~/storage/shared
ls -la


cd /data/data/com.termux/files/home/storage/shared/NAVEGADOR-NODE

# ========================================================
