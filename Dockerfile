# ============================================================
# CONTAINER OPTIMIZED - NODE 24 + MEDIA TOOLS + CHROMIUM
# DEBIAN BOOKWORM + FFMPEG + SHARP
# RENDER / DOCKER DEPLOY
# ============================================================

FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=America/Sao_Paulo

WORKDIR /var/www/html

# ============================================================
# DEPENDÊNCIAS DO SISTEMA (UTILITÁRIOS, MÍDIAS E CHROMIUM)
# ============================================================

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    gnupg \
    git \
    unzip \
    zip \
    build-essential \
    python3 \
    ffmpeg \
    imagemagick \
    webp \
    libvips-dev \
    procps \
    file \
    libpq5 \
    dbus \
    # Chromium e dependências para suporte Headless/Puppeteer
    chromium \
    chromium-sandbox \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# VARIÁVEIS DE AMBIENTE (CONFIGURAÇÃO CHROMIUM)
# ============================================================

ENV NODE_ENV=production
ENV TMPDIR=/tmp
ENV TMP=/tmp
ENV TEMP=/tmp

# Aponta o Puppeteer/Biblioteca para usar o Chromium do sistema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# ============================================================
# NODE.JS 24
# ============================================================

RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g npm@latest
RUN npm config set ignore-scripts false

# ============================================================
# ESTRUTURA DE DIRETÓRIOS DO PROJETO
# ============================================================

RUN mkdir -p \
    /var/www/html/assets \
    /var/www/html/assets/database \
    /var/www/html/session \
    /var/www/html/temp \
    /var/www/html/database

# ============================================================
# COPIAR PROJETO
# ============================================================

COPY . /var/www/html

# ============================================================
# INSTALAÇÃO DAS DEPENDÊNCIAS DO PROJETO (NPM)
# ============================================================

RUN cd /var/www/html \
    && npm install --omit=dev --force \
    puppeteer-core@latest \
    qrcode-terminal@latest \
    pino@latest \
    pino-pretty@latest \
    express@latest \
    axios@latest \
    fluent-ffmpeg@latest \
    sharp@latest \
    jimp@latest \
    file-type@latest \
    mime-types@latest \
    dotenv@latest \
    form-data@latest \
    node-fetch@latest \
    cfonts@latest \
    chalk@latest \
    cheerio@latest \
    jsdom@latest \
    ws@latest \
    lowdb@latest \
    sqlite3@latest \
    link-preview-js@latest \
    awesome-phonenumber@latest \
    node-webpmux@latest \
    moment-timezone@latest \
    human-readable@latest

# ============================================================
# PERMISSÕES E EXPOSIÇÃO DE PORTA
# ============================================================

RUN chmod -R 777 /var/www/html

EXPOSE 10000

CMD ["npm", "start"]
