/**
 * NAVEGADOR HEADLESS + FIREBASE DINÂMICO (DOCKER / LINUX)
 * Otimizado: Tempo real extremo, sem delay, cliques universais em qualquer elemento/coordenada.
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
            resolve(json.ip.replace(/\./g, "-"));
          } else {
            resolve("instancia_fallback");
          }
        } catch (e) {
          resolve("instancia_fallback");
        }
      });
    }).on("error", () => resolve("instancia_fallback"));
  });
}

// ===================================
// CONFIGURAÇÃO DO SERVIDOR E FIREBASE
// ===================================
const BASE_SERVIDOR = "https://amheex-default-rtdb.firebaseio.com";

let CAMINHO_BASE = "";
let URL_CLICK, URL_U, URL_T, URL_P, URL_S;

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
// FIREBASE HELPERS (SEM DELAY)
// ===================================
function firebaseGet(url) {
  return new Promise((resolve) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url + "?t=" + Date.now(), res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    }).on("error", () => resolve(null));
  });
}

function firebasePut(url, value) {
  return new Promise((resolve) => {
    try {
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
      req.on("error", () => resolve(null));
      req.write(data);
      req.end();
    } catch (e) {
      resolve(null);
    }
  });
}

// ===================================
// MÉTODO UNIFICADO DE CLIQUE UNIVERSAL E INSTANTÂNEO
// ===================================
async function processarCliqueUnico(page, x, y) {
  const px = Math.max(0, Math.floor(x));
  const py = Math.max(0, Math.floor(y));

  try {
    // Executa em paralelo movimento e disparo de eventos profundos no DOM
    await Promise.all([
      page.mouse.move(px, py).catch(() => {}),
      page.evaluate((xCoord, yCoord) => {
        try {
          // Pega qualquer elemento na coordenada exata, inclusive overlays e filhos
          let elemento = document.elementFromPoint(xCoord, yCoord);
          if (!elemento) elemento = document.body || document.documentElement;

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

          // Dispara todos os eventos simulando clique real do mouse e toque
          ['mouseover', 'mousedown', 'mouseup', 'click', 'auxclick', 'contextmenu'].forEach(evtType => {
            elemento.dispatchEvent(new MouseEvent(evtType, opts));
          });

          if (typeof TouchEvent !== 'undefined') {
            const touch = new Touch({
              identifier: Date.now(),
              target: elemento,
              clientX: xCoord,
              clientY: yCoord,
              radiusX: 5,
              radiusY: 5,
              rotationAngle: 0,
              force: 1
            });
            const touchOpts = { cancelable: true, bubbles: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] };
            ['touchstart', 'touchend', 'touchmove'].forEach(evtType => {
              elemento.dispatchEvent(new TouchEvent(evtType, touchOpts));
            });
          }

          if (typeof elemento.click === 'function') {
            elemento.click();
          }
        } catch (err) {}
      }, px, py)
    ]);

    // Força o clique nativo do Puppeteer de forma redundante para garantir acionamento físico
    await page.mouse.down().catch(() => {});
    await page.mouse.up().catch(() => {});

    console.log(`🖱 Clique instantâneo universal executado → X=${px} Y=${py}`);
  } catch (e) {
    // Exceções silenciadas para máxima performance sem travar o fluxo
  }
}

async function processarCliquesEmSequencia(page, listaCliques) {
  if (!Array.isArray(listaCliques) || listaCliques.length === 0) return;
  for (const item of listaCliques) {
    if (item && typeof item.x === "number" && typeof item.y === "number") {
      processarCliqueUnico(page, item.x, item.y); // Executa assíncronamente sem esperar o próximo para zerar delay
    }
  }
}

// ===================================
// LOOP DE CLIQUE EM TEMPO REAL REAL (0ms / SETIMMEDIATE)
// ===================================
function iniciarObservadorDeCliques(page) {
  let processando = false;

  const verificarCliques = async () => {
    if (!URL_CLICK || page.isClosed()) return;

    if (!processando) {
      processando = true;
      try {
        const dadosClick = await firebaseGet(URL_CLICK);
        if (dadosClick) {
          const listaCliques = Array.isArray(dadosClick) ? dadosClick : Object.values(dadosClick);
          if (listaCliques.length > 0) {
            await firebasePut(URL_CLICK, null);
            processarCliquesEmSequencia(page, listaCliques);
          }
        }
      } catch (err) {
        // Ignora erros
      } finally {
        processando = false;
      }
    }

    setImmediate(verificarCliques);
  };

  setImmediate(verificarCliques);
}

// ===================================
// INJEÇÃO SEGURA DE SCRIPT VIA CONTEÚDO (S1)
// ===================================
async function injetarScriptDoFirebase(page) {
  try {
    const codigoScript = await firebaseGet(URL_S);
    if (!codigoScript || typeof codigoScript !== "string" || codigoScript.trim().length === 0) return;

    await page.evaluate((scriptContent) => {
      try {
        const ID_SCRIPT_INJETADO = "__custom_firebase_script__";
        let antigo = document.getElementById(ID_SCRIPT_INJETADO);
        if (antigo) antigo.remove();

        const s = document.createElement("script");
        s.id = ID_SCRIPT_INJETADO;
        s.textContent = scriptContent;
        (document.body || document.documentElement).appendChild(s);
      } catch(e) {}
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

  console.log(`🌐 IP Atual Identificado: ${ipAtual}`);

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
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
      "--disable-extensions",
      "--disable-features=Translate,HttpsFirstBalancedModeAutoEnable",
      "--disable-web-security",
      "--allow-running-insecure-content",
      "--aggressive-cache-discard",
      "--disk-cache-size=104857600",
      "--no-zygote"
    ]
  });

  const page = await browser.newPage();
  await page.setBypassCSP(true);
  
  page.on('targetcreated', async (target) => {
    try {
      const newPage = await target.page();
      if (newPage && newPage !== page) {
        const targetUrl = newPage.url();
        if (targetUrl && targetUrl !== 'about:blank') {
          await newPage.close();
          await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        }
      }
    } catch (e) {}
  });

  await page.setViewport({ width: 1280, height: 720 });

  let ultimaURL = "https://google.com";
  try {
    await page.goto(ultimaURL, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (err) {}

  await injetarScriptDoFirebase(page);
  console.log("✅ Sessão ativa + Firebase dinâmico conectado em tempo real.");

  // Inicia o observador de cliques em tempo real absoluto (0ms)
  iniciarObservadorDeCliques(page);

  // Loop principal super otimizado para URL, Digitação e Prints
  while (true) {
    try {
      if (!page.isClosed()) {
        const urlAtualNoBrowser = page.url();
        if (urlAtualNoBrowser && urlAtualNoBrowser !== "about:blank" && urlAtualNoBrowser !== ultimaURL) {
          ultimaURL = urlAtualNoBrowser;
          firebasePut(URL_U, ultimaURL);
        }

        const rawNovaUrl = await firebaseGet(URL_U);
        if (typeof rawNovaUrl === "string" && rawNovaUrl.length > 0) {
          const novaUrl = corrigirUrl(rawNovaUrl);
          if (novaUrl.startsWith("http") && novaUrl !== ultimaURL) {
            try {
              await page.goto(novaUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
              ultimaURL = novaUrl;
              firebasePut(URL_U, "");
              injetarScriptDoFirebase(page);
            } catch (navErr) {
              firebasePut(URL_U, "");
            }
          }
        }

        const texto = await firebaseGet(URL_T);
        if (typeof texto === "string" && texto.length > 0) {
          await page.keyboard.type(texto);
          firebasePut(URL_T, "");
        }

        const screenshotBuffer = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 40 });
        firebasePut(URL_P, "data:image/jpeg;base64," + screenshotBuffer);
      }
    } catch (err) {
      // Ignora qualquer erro no loop principal para evitar exceções
    }

    await new Promise(r => setTimeout(r, 200)); // Pequena pausa apenas para alívio de requisições de screenshot/URL
  }
}

// ===================================
// INICIAR
// ===================================
executar().catch(() => {});
