/**
 * NAVEGADOR HEADLESS + FIREBASE DINÂMICO (DOCKER / LINUX)
 * Otimizado: Performance estável, sem estouro de RAM, salvamento local de cookies e TN1.json.
 */

const puppeteer = require("puppeteer");
const https = require("https");
const http = require("http");
const path = require("path");
const fs = require("fs");

// ===================================
// FUNÇÃO PARA OBTER O IP ATUAL DA INTERNET
// ===================================
function obterIpAtual() {
  return new Promise((resolve) => {
    https.get("https://api.ipify.org?format=json", (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json && json.ip) {
            const ipFormatado = json.ip.replace(/\./g, "-");
            resolve(ipFormatado);
          } else {
            resolve("instancia_fallback");
          }
        } catch (e) {
          resolve("instancia_fallback");
        }
      });
    }).on("error", () => {
      resolve("instancia_fallback");
    });
  });
}

// ===================================
// CONFIGURAÇÃO DO SERVIDOR E FIREBASE
// ===================================
const BASE_SERVIDOR = "https://amheex-default-rtdb.firebaseio.com";

let CAMINHO_BASE = "";
let URL_CLICK, URL_U, URL_T, URL_P, URL_S, URL_TN;

// ===================================
// GERADOR DE TEMPO FORMATADO (TN1.json)
// ===================================
function gerarTempoAtualFormatado() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  const hora = String(agora.getHours()).padStart(2, '0');
  const minuto = String(agora.getMinutes()).padStart(2, '0');
  return `${ano}${mes}${dia}${hora}${minuto}`;
}

// ===================================
// CORRETOR INTELIGENTE DE URL
// ===================================
function corrigirUrl(urlSuja) {
  if (!urlSuja || typeof urlSuja !== "string") return "";
  let url = urlSuja.trim();

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  try {
    const parsed = new URL(url);
    let host = parsed.hostname;

    const correcoesDominios = {
      "youtueb.com": "youtube.com",
      "youtbe.com": "youtube.com",
      "gogle.com": "google.com",
      "goolge.com": "google.com",
      "facebok.com": "facebook.com"
    };

    if (correcoesDominios[host]) {
      parsed.hostname = correcoesDominios[host];
    }

    return parsed.toString();
  } catch (e) {
    return url;
  }
}

// ===================================
// FIREBASE HELPERS
// ===================================
function firebaseGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url + "?t=" + Date.now(), res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    }).on("error", reject);
  });
}

function firebasePut(url, value) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(value);
    const client = url.startsWith("https") ? https : http;
    const req = client.request(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve(d));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ===================================
// CLIQUE UNIVERSAL PROFUNDO
// ===================================
async function processarCliqueUnico(page, x, y) {
  const px = Math.max(0, Math.floor(x));
  const py = Math.max(0, Math.floor(y));

  try {
    await page.mouse.move(px, py);

    await page.evaluate((xCoord, yCoord) => {
      const elemento = document.elementFromPoint(xCoord, yCoord);
      if (!elemento) return;

      const opts = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: xCoord,
        clientY: yCoord,
        screenX: xCoord,
        screenY: yCoord,
        buttons: 1
      };

      const eventos = [
        'pointerover', 'pointerenter', 'mouseover', 'mouseenter',
        'mousemove', 'mousedown', 'pointerdown', 'focus', 'focusin',
        'mouseup', 'pointerup', 'click', 'dblclick'
      ];

      eventos.forEach(tipoEvt => {
        try { elemento.dispatchEvent(new MouseEvent(tipoEvt, opts)); } catch (err) {}
      });

      if (typeof elemento.focus === 'function') {
        try { elemento.focus({ preventScroll: true }); } catch (e) {}
      }

      if (typeof TouchEvent !== 'undefined') {
        try {
          const touch = new Touch({
            identifier: Date.now(),
            target: elemento,
            clientX: xCoord,
            clientY: yCoord,
            radiusX: 10,
            radiusY: 10,
            rotationAngle: 0,
            force: 1
          });
          const touchOpts = { cancelable: true, bubbles: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] };
          elemento.dispatchEvent(new TouchEvent('touchstart', touchOpts));
          elemento.dispatchEvent(new TouchEvent('touchend', touchOpts));
        } catch (e) {}
      }

      if (typeof elemento.click === 'function') {
        try { elemento.click(); } catch (e) {}
      }

      let pai = elemento.parentElement;
      let contador = 0;
      while (pai && contador < 3) {
        if (pai.onclick || pai.tagName === 'A' || pai.tagName === 'BUTTON') {
          try { pai.click(); } catch (e) {}
          break;
        }
        pai = pai.parentElement;
        contador++;
      }
    }, px, py);

    await page.mouse.down({ button: 'left' });
    await page.mouse.up({ button: 'left' });

    console.log(`🖱 Clique universal executado em → X=${px} Y=${py}`);
  } catch (e) {
    console.log(`Erro no clique universal X=${px} Y=${py}:`, e.message);
  }
}

async function processarCliquesEmSequencia(page, listaCliques) {
  if (!Array.isArray(listaCliques) || listaCliques.length === 0) return;
  for (const item of listaCliques) {
    if (!item || typeof item.x !== "number" || typeof item.y !== "number") continue;
    await processarCliqueUnico(page, item.x, item.y);
  }
}

// ===================================
// OBSERVADOR DE CLIQUES OTIMIZADO
// ===================================
function iniciarObservadorDeCliques(page) {
  let processando = false;
  setInterval(async () => {
    if (processando || !URL_CLICK || page.isClosed()) return;
    processando = true;

    try {
      const dadosClick = await firebaseGet(URL_CLICK);
      if (dadosClick) {
        const listaCliques = Array.isArray(dadosClick) ? dadosClick : Object.values(dadosClick);
        if (listaCliques.length > 0) {
          await firebasePut(URL_CLICK, null);
          await processarCliquesEmSequencia(page, listaCliques);
        }
      }
    } catch (err) {
    } finally {
      processando = false;
    }
  }, 100); // 100ms para evitar gargalo na CPU do servidor
}

// ===================================
// INJEÇÃO DE SCRIPT (S1)
// ===================================
async function injetarScriptDoFirebase(page) {
  try {
    const codigoScript = await firebaseGet(URL_S);
    if (!codigoScript || typeof codigoScript !== "string" || codigoScript.trim().length === 0) return;

    await page.evaluate((scriptContent) => {
      const ID_SCRIPT_INJETADO = "__custom_firebase_script__";
      let antigo = document.getElementById(ID_SCRIPT_INJETADO);
      if (antigo) antigo.remove();

      const s = document.createElement("script");
      s.id = ID_SCRIPT_INJETADO;
      s.textContent = scriptContent;
      (document.body || document.documentElement).appendChild(s);
    }, codigoScript);
  } catch (e) {}
}

// ===================================
// PRINCIPAL
// ===================================
async function executar() {
  console.log("🔍 Descobrindo o IP atual da rede/dispositivo...");
  const ipAtual = await obterIpAtual();
  
  CAMINHO_BASE = `${BASE_SERVIDOR}/NAVEGADOR-NODE/${ipAtual}`;

  URL_CLICK = `${CAMINHO_BASE}/CLICK.json`;
  URL_U = `${CAMINHO_BASE}/U1.json`;
  URL_T = `${CAMINHO_BASE}/T1.json`;
  URL_P = `${CAMINHO_BASE}/P1.json`;
  URL_S = `${CAMINHO_BASE}/S1.json`;
  URL_TN = `${CAMINHO_BASE}/TN1.json`;

  console.log(`🌐 IP Atual Identificado: ${ipAtual}`);

  // Configuração correta de diretório local para cookies, sessões e cache
  const userDataDir = path.join(__dirname, "assets", "database");

  try {
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    } else {
      const lockFile = path.join(userDataDir, "SingletonLock");
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
      }
    }
  } catch (e) {}

  const browser = await puppeteer.launch({
    headless: "new",
    userDataDir: userDataDir, // Salva cookies e dados localmente sem passar pelo servidor
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage", // Essencial para Docker/Linux não estourar memória RAM (/dev/shm)
      "--disable-extensions",
      "--disable-features=Translate,HttpsFirstBalancedModeAutoEnable",
      "--disable-web-security",
      "--allow-running-insecure-content",
      "--js-flags=--max-old-space-size=512", // Limita a RAM do motor V8 evitando estouro de sistema
      "--no-zygote"
    ]
  });

  const page = await browser.newPage();
  
  await page.setDefaultNavigationTimeout(0);
  await page.setDefaultTimeout(0);
  await page.setBypassCSP(true);
  
  page.on('targetcreated', async (target) => {
    try {
      const newPage = await target.page();
      if (newPage && newPage !== page) {
        const targetUrl = newPage.url();
        if (targetUrl && targetUrl !== 'about:blank') {
          await newPage.close();
          await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 0 });
          await firebasePut(URL_U, targetUrl);
          setTimeout(async () => { await firebasePut(URL_U, ""); }, 1000);
        }
      }
    } catch (e) {}
  });

  await page.setViewport({ width: 1280, height: 720 });

  let ultimaURL = "https://google.com";
  console.log(`🌐 Abrindo página inicial: ${ultimaURL}`);
  
  try {
    await page.goto(ultimaURL, { waitUntil: "domcontentloaded", timeout: 0 });
  } catch (err) {}

  await injetarScriptDoFirebase(page);
  iniciarObservadorDeCliques(page);

  // LOOP PRINCIPAL EQUILIBRADO (Sem sobrecarregar a CPU e RAM)
  while (true) {
    try {
      if (!page.isClosed()) {
        // Atualiza TN1.json no servidor
        const tempoLocal = gerarTempoAtualFormatado();
        await firebasePut(URL_TN, tempoLocal);

        const urlAtualNoBrowser = page.url();
        if (urlAtualNoBrowser && urlAtualNoBrowser !== "about:blank" && urlAtualNoBrowser !== ultimaURL) {
          ultimaURL = urlAtualNoBrowser;
          await firebasePut(URL_U, urlAtualNoBrowser);
          setTimeout(async () => { await firebasePut(URL_U, ""); }, 800);
        }

        const rawNovaUrl = await firebaseGet(URL_U);
        if (typeof rawNovaUrl === "string" && rawNovaUrl.length > 0) {
          const novaUrl = corrigirUrl(rawNovaUrl);
          if (novaUrl.startsWith("http") && novaUrl !== ultimaURL) {
            try {
              await firebasePut(URL_U, "");
              await page.goto(novaUrl, { waitUntil: "domcontentloaded", timeout: 0 });
              ultimaURL = novaUrl;
              await injetarScriptDoFirebase(page);
            } catch (navErr) {
              await firebasePut(URL_U, "");
            }
          }
        }

        const texto = await firebaseGet(URL_T);
        if (typeof texto === "string" && texto.trim().length > 0) {
          await page.evaluate((textoInserir) => {
            const inputs = document.querySelectorAll('input[type="text"], input[type="search"], input[type="email"], input[type="password"], textarea, [contenteditable="true"]');
            if (inputs.length > 0) {
              inputs.forEach(el => {
                el.focus();
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                  el.value = textoInserir;
                } else {
                  el.innerText = textoInserir;
                }
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              });
            }
          }, texto);
          await firebasePut(URL_T, "");
        }

        // Print otimizado com qualidade 60% para não estourar a RAM nem o Firebase
        const screenshotBuffer = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 60 });
        const base64 = "data:image/jpeg;base64," + screenshotBuffer;
        await firebasePut(URL_P, base64);
      }
    } catch (err) {}

    // Intervalo de 250ms perfeitamente balanceado para aliviar a CPU/RAM do servidor
    await new Promise(r => setTimeout(r, 250));
  }
}

executar().catch(err => {
  console.error("❌ Erro fatal:", err.message);
});
