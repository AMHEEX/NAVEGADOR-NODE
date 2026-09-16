'use strict';

/**
 * ============================================================
 * 🚀 NAVEGADOR-NODE
 * PHP LOCALHOST + TERMUX
 * ============================================================
 *
 * FLUXO:
 * 1. Inicia PHP
 * 2. Aguarda localhost responder
 * 3. Redireciona pelo Termux
 * 4. Abre http://127.0.0.1:8000
 *
 * SEM:
 * - LocalTunnel
 * - IP da rede
 * - URL pública
 * - Flood de logs
 * - Polling contínuo
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const http = require('http');

/* ============================================================
   CONFIGURAÇÃO
   ============================================================ */

const BASE_DIR = path.resolve(
    process.env.BASE_DIR || __dirname
);

const PORT = Number(process.env.PORT || 8000);
const HOST = '127.0.0.1';

const TMP_DIR = path.join(BASE_DIR, 'tmp');
const SESSION_DIR = path.join(TMP_DIR, 'sessions');
const UPLOAD_DIR = path.join(TMP_DIR, 'uploads');

const PHP_LOG = path.join(TMP_DIR, 'php-error.log');
const INDEX_FILE = path.join(BASE_DIR, 'index.php');

const LOCAL_URL = `http://${HOST}:${PORT}`;

/* ============================================================
   ESTADO
   ============================================================ */

let phpProcess = null;
let phpStarted = false;
let browserOpened = false;
let shuttingDown = false;
let restartTimer = null;

/* ============================================================
   DIRETÓRIOS
   ============================================================ */

function ensureDir(dir) {
    try {
        fs.mkdirSync(dir, {
            recursive: true,
            mode: 0o777
        });
    } catch (_) {}
}

ensureDir(BASE_DIR);
ensureDir(TMP_DIR);
ensureDir(SESSION_DIR);
ensureDir(UPLOAD_DIR);

/* ============================================================
   VERIFICA INDEX.PHP
   ============================================================ */

if (!fs.existsSync(INDEX_FILE)) {

    console.error('');
    console.error('❌ index.php não encontrado!');
    console.error('');
    console.error(INDEX_FILE);
    console.error('');

    process.exit(1);
}

/* ============================================================
   PREPARA LOG
   ============================================================ */

function prepareLog() {

    try {

        if (
            fs.existsSync(PHP_LOG) &&
            fs.statSync(PHP_LOG).size > 10 * 1024 * 1024
        ) {
            fs.writeFileSync(PHP_LOG, '');
        }

        if (!fs.existsSync(PHP_LOG)) {
            fs.writeFileSync(PHP_LOG, '');
        }

        try {
            fs.chmodSync(PHP_LOG, 0o666);
        } catch (_) {}

    } catch (_) {}
}

prepareLog();

/* ============================================================
   TESTA LOCALHOST
   ============================================================ */

function checkLocalhost() {

    return new Promise((resolve) => {

        let finished = false;
        let req = null;
        let timer = null;

        function done(result) {

            if (finished) {
                return;
            }

            finished = true;

            if (timer) {
                clearTimeout(timer);
            }

            resolve(result);
        }

        try {

            req = http.get(
                LOCAL_URL,
                {
                    timeout: 1500,
                    headers: {
                        'Connection': 'close'
                    }
                },
                (res) => {

                    res.resume();

                    res.on('end', () => {
                        done(true);
                    });
                }
            );

            req.on('error', () => {
                done(false);
            });

            req.on('timeout', () => {

                try {
                    req.destroy();
                } catch (_) {}

                done(false);
            });

        } catch (_) {

            done(false);
        }

        timer = setTimeout(() => {

            try {
                if (req) {
                    req.destroy();
                }
            } catch (_) {}

            done(false);

        }, 2500);
    });
}

/* ============================================================
   AGUARDA LOCALHOST
   ============================================================ */

async function waitForLocalhost() {

    /*
     * Somente durante a inicialização.
     * Depois de conectado NÃO fica fazendo polling.
     */

    for (let i = 0; i < 30; i++) {

        if (shuttingDown) {
            return false;
        }

        if (await checkLocalhost()) {
            return true;
        }

        await new Promise((resolve) => {
            setTimeout(resolve, 500);
        });
    }

    return false;
}

/* ============================================================
   MATA PHP ANTIGO
   ============================================================ */

function killOldPHP() {

    try {

        cp.execSync(
            `pkill -f "php -S .*:${PORT}" 2>/dev/null || true`,
            {
                stdio: 'ignore',
                timeout: 3000
            }
        );

    } catch (_) {}
}

/* ============================================================
   INICIA PHP
   ============================================================ */

function startPHP() {

    if (shuttingDown) {
        return;
    }

    if (phpStarted && phpProcess) {
        return;
    }

    phpStarted = true;

    prepareLog();

    const args = [

        '-S',
        `${HOST}:${PORT}`,

        '-t',
        BASE_DIR,

        '-d',
        `sys_temp_dir=${TMP_DIR}`,

        '-d',
        `session.save_path=${SESSION_DIR}`,

        '-d',
        `upload_tmp_dir=${UPLOAD_DIR}`,

        '-d',
        'file_uploads=On',

        '-d',
        'upload_max_filesize=512M',

        '-d',
        'post_max_size=512M',

        '-d',
        'max_execution_time=0',

        '-d',
        'max_input_time=0',

        '-d',
        'memory_limit=512M',

        '-d',
        'log_errors=1',

        '-d',
        'display_errors=0',

        '-d',
        'display_startup_errors=0',

        '-d',
        `error_log=${PHP_LOG}`,

        '-d',
        'opcache.enable=0',

        '-d',
        'opcache.enable_cli=0'
    ];

    const env = {
        ...process.env,

        BASE_DIR: BASE_DIR,

        TMPDIR: TMP_DIR,
        TMP: TMP_DIR,
        TEMP: TMP_DIR
    };

    try {

        phpProcess = cp.spawn(
            'php',
            args,
            {
                cwd: BASE_DIR,
                env: env,

                /*
                 * Não mostra os logs do PHP no terminal.
                 */
                stdio: [
                    'ignore',
                    'ignore',
                    'ignore'
                ]
            }
        );

    } catch (error) {

        phpStarted = false;
        phpProcess = null;

        console.error(
            '❌ Erro ao iniciar PHP:',
            error.message
        );

        scheduleRestart();

        return;
    }

    phpProcess.on('error', (error) => {

        if (!shuttingDown) {
            console.error(
                '❌ Erro PHP:',
                error.message
            );
        }
    });

    phpProcess.on('exit', (code, signal) => {

        phpProcess = null;
        phpStarted = false;

        if (shuttingDown) {
            return;
        }

        console.log(
            `⚠️ PHP encerrado (${code || 0})`
        );

        scheduleRestart();
    });
}

/* ============================================================
   REINÍCIO DO PHP
   ============================================================ */

function scheduleRestart() {

    if (shuttingDown) {
        return;
    }

    if (restartTimer) {
        return;
    }

    restartTimer = setTimeout(() => {

        restartTimer = null;

        if (!shuttingDown) {
            startPHP();
        }

    }, 2000);
}

/* ============================================================
   ABRE PELO TERMUX
   ============================================================ */

function openWithTermux() {

    if (browserOpened) {
        return;
    }

    browserOpened = true;

    console.log('');
    console.log('============================================');
    console.log('🌐 LOCALHOST ONLINE');
    console.log('============================================');
    console.log(`🔗 ${LOCAL_URL}`);
    console.log('============================================');
    console.log('📱 Abrindo pelo Termux...');
    console.log('');

    /*
     * Redirecionamento automático para o navegador
     * usando Termux.
     */

    try {

        cp.exec(
            `termux-open-url "${LOCAL_URL}"`,
            {
                stdio: 'ignore'
            }
        );

    } catch (_) {

        console.log(
            `➡️ Abra manualmente: ${LOCAL_URL}`
        );
    }
}

/* ============================================================
   MAIN
   ============================================================ */

async function main() {

    console.log('');
    console.log('============================================');
    console.log('🚀 NAVEGADOR-NODE');
    console.log('============================================');
    console.log(`📁 BASE_DIR : ${BASE_DIR}`);
    console.log(`📄 INDEX    : ${INDEX_FILE}`);
    console.log(`📂 TMP      : ${TMP_DIR}`);
    console.log(`🔌 PORTA    : ${PORT}`);
    console.log(`🌐 LOCAL    : ${LOCAL_URL}`);
    console.log('============================================');
    console.log('');

    /*
     * Remove PHP antigo.
     */
    killOldPHP();

    await new Promise((resolve) => {
        setTimeout(resolve, 500);
    });

    /*
     * Inicia PHP.
     */
    startPHP();

    /*
     * Aguarda o localhost somente uma vez.
     */
    const online = await waitForLocalhost();

    if (!online) {

        console.error('');
        console.error(
            '❌ O localhost não respondeu.'
        );
        console.error('');
        console.error(
            `📄 Log: ${PHP_LOG}`
        );
        console.error('');

        return;
    }

    /*
     * Conectou → abre uma única vez.
     */
    openWithTermux();
}

/* ============================================================
   ENCERRAMENTO
   ============================================================ */

function shutdown(signal) {

    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    console.log('');
    console.log(
        `🛑 Encerrando (${signal})...`
    );

    if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
    }

    try {

        if (
            phpProcess &&
            !phpProcess.killed
        ) {
            phpProcess.kill('SIGTERM');
        }

    } catch (_) {}

    phpProcess = null;
    phpStarted = false;

    setTimeout(() => {
        process.exit(0);
    }, 300);
}

process.on('SIGINT', () => {
    shutdown('SIGINT');
});

process.on('SIGTERM', () => {
    shutdown('SIGTERM');
});

/* ============================================================
   EXECUTA
   ============================================================ */

main().catch((error) => {

    console.error('');
    console.error('❌ Erro fatal:');
    console.error(error);
    console.error('');

    shutdown('ERROR');
});
