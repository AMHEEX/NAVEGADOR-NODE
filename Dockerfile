# ============================================================
# AMHEEX - DOCKER ROBUSTO
# PHP 8.2 + Apache + Node.js 20 + Chromium
# Render / Docker
# ============================================================

FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

WORKDIR /var/www/html

# ============================================================
# 1. SISTEMA
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
    apache2 \
    chromium \
    chromium-driver \
    fonts-liberation \
    fonts-dejavu \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# 2. PHP 8.2
# ============================================================

RUN curl -fsSL https://packages.sury.org/php/apt.gpg \
    | gpg --dearmor -o /usr/share/keyrings/php-sury.gpg

RUN echo "deb [signed-by=/usr/share/keyrings/php-sury.gpg] https://packages.sury.org/php/ bookworm main" \
    > /etc/apt/sources.list.d/php.list

RUN apt-get update && apt-get install -y --no-install-recommends \
    php8.2 \
    php8.2-cli \
    php8.2-common \
    php8.2-mbstring \
    php8.2-xml \
    php8.2-zip \
    php8.2-curl \
    php8.2-opcache \
    php8.2-bcmath \
    php8.2-intl \
    php8.2-gd \
    php8.2-mysql \
    php8.2-soap \
    php8.2-readline \
    libapache2-mod-php8.2 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# 3. NODE.JS 20
# ============================================================

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# 4. APACHE
# ============================================================

RUN a2enmod \
    rewrite \
    headers \
    expires \
    dir \
    env \
    mime \
    setenvif \
    php8.2

# ============================================================
# 5. APACHE CONFIG
# ============================================================

RUN cat > /etc/apache2/sites-available/000-default.conf <<'EOF'
<VirtualHost *:80>

    ServerName localhost

    DocumentRoot /var/www/html

    <Directory /var/www/html>
        Options +Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
        DirectoryIndex index.php index.html
    </Directory>

    ErrorLog ${APACHE_LOG_DIR}/error.log
    CustomLog ${APACHE_LOG_DIR}/access.log combined

</VirtualHost>
EOF

# ============================================================
# 6. COPIAR PROJETO (MOVIDO PARA ANTES DO NPM INSTALL)
# ============================================================

COPY . /var/www/html

# ============================================================
# 7. PERMISSÕES
# ============================================================

RUN chown -R www-data:www-data /var/www/html \
    && find /var/www/html -type d -exec chmod 755 {} \; \
    && find /var/www/html -type f -exec chmod 644 {} \;

# ============================================================
# 8. PHP
# ============================================================

RUN cat > /etc/php/8.2/apache2/conf.d/99-amheex.ini <<'EOF'
upload_max_filesize = 16000M
post_max_size = 16000M
memory_limit = 16000M

max_execution_time = 86400
max_input_time = 86400
max_input_vars = 100000

file_uploads = On
max_file_uploads = 1000

session.gc_maxlifetime = 86400
EOF

# ============================================================
# 9. NODE / PUPPETEER
# ============================================================

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROMIUM_PATH=/usr/bin/chromium

ENV TMPDIR=/tmp
ENV TMP=/tmp
ENV TEMP=/tmp

RUN mkdir -p \
    /tmp/chromium \
    /tmp/puppeteer \
    /var/tmp/puppeteer \
    && chmod 1777 \
    /tmp/chromium \
    /tmp/puppeteer \
    /var/tmp/puppeteer

# ============================================================
# 10. DEPENDÊNCIAS DO PROJETO (AGORA COM OS ARQUIVOS JÁ COPIADOS)
# ============================================================

RUN if [ -f package.json ]; then \
        npm install --omit=dev --force; \
    fi

# ============================================================
# 11. VERIFICAÇÕES
# ============================================================

RUN echo "===== VERSÕES =====" \
    && php -v \
    && node -v \
    && npm -v \
    && chromium --version

# ============================================================
# 12. PORTA
# ============================================================

EXPOSE 80

# ============================================================
# 13. START
# ============================================================

CMD ["npm", "start"]
