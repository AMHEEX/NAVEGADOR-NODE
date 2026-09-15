# Configura o armazenamento interno do Termux (se necessário)
termux-setup-storage

# Verifica se a pasta do projeto já existe no armazenamento interno
if [ -d "/sdcard/NAVEGADOR-NODE" ]; then
    echo "Pasta do projeto já encontrada localmente. Acessando e iniciando..."
    cd /sdcard/NAVEGADOR-NODE
    npm start
else
    echo "Primeira execução detectada. Atualizando pacotes e instalando dependências..."
    pkg update -y && pkg upgrade -y
    pkg install -y tur-repo x11-repo root-repo build-essential git wget curl zip unzip tar python nodejs clang make cmake libxml2 libxslt openssl readline zlib termux-tools php
    
    echo "Baixando o repositório..."
    cd /sdcard/
    rm -rf NAVEGADOR-NODE
    git clone https://github.com/AMHEEX/NAVEGADOR-NODE.git
    
    echo "Instalando dependências do Node e iniciando..."
    cd NAVEGADOR-NODE
    npm install
    npm start
fi
