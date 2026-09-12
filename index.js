/**
 * NAVEGADOR HEADLESS + FIREBASE DINÂMICO (IP PÚBLICO DA REDE)
 * Controlado pelo HTML do painel
 */

const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

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
let URL_X, URL_Y, URL_U, URL_T, URL_P, URL_S;

// ===================================
// DIRS
// ===================================
const BASE_DIR = __dirname;
const ASSETS_DIR = path.join(BASE_DIR, "assets");
const IMAGE_PATH = path.join(ASSETS_DIR, "index.png");

if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
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
// CLIQUE INTELIGENTE COM VALIDAÇÃO DE ELEMENTO
// ===================================
async function clickAt(page, x, y) {
  try {
    // Valida se existe um elemento clicável real nas coordenadas informadas para evitar clique no vazio
    const elementoValido = await page.evaluate((px, py) => {
      const el = document.elementFromPoint(px, py);
      if (!el) return false;
      // Verifica se o elemento ou seus pais diretos são interativos ou se a tag é válida
      const tag = el.tagName.toLowerCase();
      const tagsIgnoradas = ["html", "body"];
      if (tagsIgnoradas.includes(tag)) {
        // Verifica se realmente possui algum handler ou estilo de cursor pointer
        const estilo = window.getComputedStyle(el);
        if (estilo.cursor !== "pointer" && !el.onclick && !el.getAttribute("role")) {
          return false; 
        }
      }
      return true;
    }, x, y);

    await page.mouse.click(x, y);
    console.log(`🖱 Clique efetuado → X=${x} Y=${y} (Elemento válido: ${elementoValido})`);
  } catch (e) {
    console.log("Erro no clique:", e.message);
  }
}

// ===================================
// INJEÇÃO SEGURA DE SCRIPT VIA CONTEÚDO (S1)
// ===================================
async function injetarScriptDoFirebase(page) {
  try {
    const codigoScript = await firebaseGet(URL_S);
    
    if (!codigoScript || typeof codigoScript !== "string" || codigoScript.trim().length === 0) {
      return;
    }

    await page.evaluate((scriptContent) => {
      const ID_SCRIPT_INJETADO = "__custom_firebase_script__";
      let antigo = document.getElementById(ID_SCRIPT_INJETADO);
      if (antigo) antigo.remove();

      const s = document.createElement("script");
      s.id = ID_SCRIPT_INJETADO;
      s.textContent = scriptContent;
      (document.body || document.documentElement).appendChild(s);
      console.log("✅ Script do S1 injetado com sucesso.");
    }, codigoScript);

  } catch (e) {
    console.log("⚠️ Aviso ao injetar script do S1:", e.message);
  }
}

// ===================================
// PRINCIPAL
// ===================================
async function executar() {
  console.log("🔍 Descobrindo o IP atual da rede/dispositivo...");
  const ipAtual = await obterIpAtual();
  
  CAMINHO_BASE = `${BASE_SERVIDOR}/NAVEGADOR-NODE/${ipAtual}`;

  URL_X = `${CAMINHO_BASE}/X1.json`;
  URL_Y = `${CAMINHO_BASE}/Y1.json`;
  URL_U = `${CAMINHO_BASE}/U1.json`;
  URL_T = `${CAMINHO_BASE}/T1.json`;
  URL_P = `${CAMINHO_BASE}/P1.json`;
  URL_S = `${CAMINHO_BASE}/S1.json`;

  console.log(`🌐 IP Atual Identificado: ${ipAtual}`);
  console.log(`🌐 Caminho dinâmico ativo: ${CAMINHO_BASE}`);

  const chromiumPath = "/data/data/com.termux/files/usr/bin/chromium-browser";

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromiumPath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
      "--disable-extensions",
      "--disable-features=Translate,HttpsFirstBalancedModeAutoEnable"
    ]
  });

  const page = await browser.newPage();
  
  // Definimos a viewport padrão base
  const larguraViewport = 1280;
  const alturaViewport = 720;
  await page.setViewport({ width: larguraViewport, height: alturaViewport });

  let ultimaURL = "https://google.com";
  let ultimoX = null;
  let ultimoY = null;

  console.log(`🌐 Abrindo página inicial: ${ultimaURL}`);
  
  try {
    await page.goto(ultimaURL, { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (err) {
    console.log("⚠️ Falha ao abrir página inicial:", err.message);
  }

  await injetarScriptDoFirebase(page);
  console.log("✅ Sessão ativa + Firebase dinâmico conectado.");

  while (true) {
    try {
      // 1. Verifica mudança de URL com correção inteligente
      const rawNovaUrl = await firebaseGet(URL_U);
      if (typeof rawNovaUrl === "string" && rawNovaUrl.length > 0) {
        const novaUrl = corrigirUrl(rawNovaUrl);

        if (novaUrl.startsWith("http") && novaUrl !== ultimaURL) {
          console.log(`🔀 URL Ajustada / Mudando para: ${novaUrl} (Original: ${rawNovaUrl})`);
          
          try {
            await page.goto(novaUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
            ultimaURL = novaUrl;
            await firebasePut(URL_U, "");

            await injetarScriptDoFirebase(page);
          } catch (navErr) {
            console.error("❌ Erro de navegação para a URL:", novaUrl, "-", navErr.message);
            await firebasePut(URL_U, "");
          }
        }
      }

      await injetarScriptDoFirebase(page);

      // 2. Lê coordenadas de clique e valida
      const rawX = await firebaseGet(URL_X);
      const rawY = await firebaseGet(URL_Y);

      const x = Number(rawX);
      const y = Number(rawY);

      if (!isNaN(x) && !isNaN(y) && x > 0 && y > 0) {
        if (x !== ultimoX || y !== ultimoY) {
          ultimoX = x;
          ultimoY = y;
          
          // Assegura que as coordenadas estão dentro dos limites da tela do navegador
          const xLimitado = Math.max(0, Math.min(x, larguraViewport));
          const yLimitado = Math.max(0, Math.min(y, alturaViewport));

          await clickAt(page, xLimitado, yLimitado);

          await firebasePut(URL_X, 0);
          await firebasePut(URL_Y, 0);
          ultimoX = null;
          ultimoY = null;
        }
      }

      // 3. Texto para input
      const texto = await firebaseGet(URL_T);
      if (typeof texto === "string" && texto.length > 0) {
        await page.keyboard.type(texto);
        console.log("⌨ Texto digitado:", texto);
        await firebasePut(URL_T, "");
      }

      // 4. Tira print e envia Base64 para o Firebase
      if (!page.isClosed()) {
        const screenshotBuffer = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 70 });
        const base64 = "data:image/jpeg;base64," + screenshotBuffer;

        await firebasePut(URL_P, base64);
        fs.writeFileSync(IMAGE_PATH, Buffer.from(screenshotBuffer, "base64"));
      }

    } catch (err) {
      console.error("Erro no loop:", err.message);
    }

    await new Promise(r => setTimeout(r, 800));
  }
}

// ===================================
// INICIAR
// ===================================
executar().catch(err => {
  console.error("❌ Erro fatal:", err.message);
});
