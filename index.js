/**
 * NAVEGADOR HEADLESS + API STORAGE AMHEEX (DOCKER / LINUX)
 * Otimizado: Envio de arquivo de imagem binário via POST (mais rápido, sem Base64) e listagem de IPs.
 */

const puppeteer = require("puppeteer");
const https = require("https");
const http = require("http");
const path = require("path");
const fs = require("fs");

// ===================================
// CONFIGURAÇÃO DA API STORAGE
// ===================================
const API_BASE = "https://api-storageamheex.onrender.com";
let ipAtual = "";
let CAMINHO_BASE_API = "";
let URL_CLICK, URL_U, URL_T, URL_S, URL_TN, URL_IMG;

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
            resolve(json.ip.replace(/\./g, "-"));
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
// API HELPERS (GET / PUT / POST BINARY)
// ===================================
function apiGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    }).on("error", reject);
  });
}

function apiPut(caminhoRelativo, value) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(value);
    const url = `${API_BASE}/${caminhoRelativo}`;
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

// Envio otimizado de arquivo binário via POST (Multipart/form-data)
function apiUploadArquivo(caminhoRelativo, bufferArquivo) {
  return new Promise((resolve, reject) => {
    const boundary = "----WebKitFormBoundary" + Math.random().toString(16).substring(2);
    const url = `${API_BASE}/${caminhoRelativo}`;
    const parsedUrl = new URL(url);

    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="index.png"\r\n` +
      `Content-Type: image/png\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const totalLength = header.length + bufferArquivo.length + footer.length;

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": totalLength
      }
    };

    const client = parsedUrl.protocol === "https:" ? https : http;
    const req = client.request(options, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve(d));
    });

    req.on("error", reject);
    req.write(header);
    req.write(bufferArquivo);
    req.write(footer);
    req.end();
  });
}

// ===================================
// ATUALIZAR LISTA DE IPs NO SERVIDOR
// ===================================
async function atualizarListaIpsNoServidor(ipAtualStr) {
  try {
    let listaIps = await apiGet("AMHEEX/NAVEGADOR/IPS.json");
    if (!Array.isArray(listaIps)) {
      listaIps = [];
    }
    if (!listaIps.includes(ipAtualStr)) {
      listaIps.push(ipAtualStr);
      await apiPut("AMHEEX/NAVEGADOR/IPS.json", listaIps);
      console.log(`📋 IP ${ipAtualStr} adicionado à lista global de IPs.`);
    }
  } catch (e) {
    console.log("⚠️ Erro ao atualizar lista de IPs:", e.message);
  }
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
  } catch (e) {}
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
      const dadosClick = await apiGet(URL_CLICK);
      if (dadosClick) {
        const listaCliques = Array.isArray(dadosClick) ? dadosClick : Object.values(dadosClick);
        if (listaCliques.length > 0) {
          await apiPut(URL_CLICK, null);
          await processarCliquesEmSequencia(page, listaCliques);
        }
      }
    } catch (err) {
    } finally {
      processando = false;
    }
  }, 100);
}

// ===================================
// INJEÇÃO DE SCRIPT (S1)
// ===================================
async function injetarScriptDoApi(page) {
  try {
    const codigoScript = await apiGet(URL_S);
    if (!codigoScript || typeof codigoScript !== "string" || codigoScript.trim().length === 0) return;

    await page.evaluate((scriptContent) => {
      const ID_SCRIPT_INJETADO = "__custom_api_script__";
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
  ipAtual = await obterIpAtual();
  
  CAMINHO_BASE_API = `AMHEEX/NAVEGADOR/${ipAtual}`;

  URL_CLICK = `${CAMINHO_BASE_API}/CLICK.json`;
  URL_U = `${CAMINHO_BASE_API}/U1.json`;
  URL_T = `${CAMINHO_BASE_API}/T1.json`;
  URL_S = `${CAMINHO_BASE_API}/S1.json`;
  URL_TN = `${CAMINHO_BASE_API}/TN1.json`;
  URL_IMG = `${CAMINHO_BASE_API}/IMG/index.png`;

  console.log(`🌐 IP Atual Identificado: ${ipAtual}`);
  await atualizarListaIpsNoServidor(ipAtual);

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
    userDataDir: userDataDir,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-features=Translate,HttpsFirstBalancedModeAutoEnable",
      "--disable-web-security",
      "--allow-running-insecure-content",
      "--js-flags=--max-old-space-size=512",
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
          await apiPut(URL_U, targetUrl);
          setTimeout(async () => { await apiPut(URL_U, ""); }, 1000);
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

  await injetarScriptDoApi(page);
  iniciarObservadorDeCliques(page);

  // LOOP PRINCIPAL OTIMIZADO COM UPLOAD BINÁRIO E LISTAGEM DE IP
  while (true) {
    try {
      if (!page.isClosed()) {
        const tempoLocal = gerarTempoAtualFormatado();
        await apiPut(URL_TN, tempoLocal);

        const urlAtualNoBrowser = page.url();
        if (urlAtualNoBrowser && urlAtualNoBrowser !== "about:blank" && urlAtualNoBrowser !== ultimaURL) {
          ultimaURL = urlAtualNoBrowser;
          await apiPut(URL_U, urlAtualNoBrowser);
          setTimeout(async () => { await apiPut(URL_U, ""); }, 800);
        }

        const rawNovaUrl = await apiGet(URL_U);
        if (typeof rawNovaUrl === "string" && rawNovaUrl.length > 0) {
          const novaUrl = corrigirUrl(rawNovaUrl);
          if (novaUrl.startsWith("http") && novaUrl !== ultimaURL) {
            try {
              await apiPut(URL_U, "");
              await page.goto(novaUrl, { waitUntil: "domcontentloaded", timeout: 0 });
              ultimaURL = novaUrl;
              await injetarScriptDoApi(page);
            } catch (navErr) {
              await apiPut(URL_U, "");
            }
          }
        }

        const texto = await apiGet(URL_T);
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
          await apiPut(URL_T, "");
        }

        // Envio do print binário direto para a API Storage (sem conversão pesada para Base64)
        const screenshotBuffer = await page.screenshot({ encoding: "binary", type: "jpeg", quality: 60 });
        await apiUploadArquivo(URL_IMG, screenshotBuffer);
      }
    } catch (err) {}

    await new Promise(r => setTimeout(r, 250));
  }
}

executar().catch(err => {
  console.error("❌ Erro fatal:", err.message);
});
