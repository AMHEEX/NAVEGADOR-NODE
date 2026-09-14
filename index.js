/**
 * NAVEGADOR HEADLESS + FIREBASE DINÂMICO (DOCKER / LINUX)
 * Atualizado com Envio de Screenshot em Base64 para IMG/index.txt
 */

const puppeteer = require("puppeteer");
const https = require("https");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// ===================================
// CONFIGURAÇÃO DA API STORAGE
// ===================================
const API_STORAGE_BASE = "https://api-storageamheex.onrender.com";

function urlLeitura(caminhoRelativo) {
  const limpo = caminhoRelativo.startsWith("/") ? caminhoRelativo.slice(1) : caminhoRelativo;
  return `${API_STORAGE_BASE}/X/${limpo}`;
}

function urlDownload(caminhoRelativo) {
  const limpo = caminhoRelativo.startsWith("/") ? caminhoRelativo.slice(1) : caminhoRelativo;
  return `${API_STORAGE_BASE}/${limpo}`;
}

// ===================================
// GERADOR DE ID ÚNICO PARA A INSTÂNCIA
// ===================================
const ID_INSTANCIA = "node_" + crypto.randomBytes(4).toString("hex");

// ===================================
// VARIÁVEIS DE CAMINHO DA API
// ===================================
let BASE_API = "";
let URL_IPS_INDEX = "";
let URL_IPS_INDEX_ESCRITA = "";
let URL_IMG_TXT = ""; // Alterado para salvar em .txt
let URL_REDIRECT_TXT = "";
let URL_Y_LEITURA = "";
let URL_X_LEITURA = "";
let URL_Y_ESCRITA = "";
let URL_X_ESCRITA = "";
let URL_NAVEGADOR_TEMP = "";

// ===================================
// STORAGE API HELPERS (HTTP/HTTPS)
// ===================================
function apiGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    }).on("error", reject);
  });
}

function apiPut(url, value) {
  return new Promise((resolve, reject) => {
    let payload;
    let contentType = "text/plain";

    if (Buffer.isBuffer(value)) {
      payload = value;
      contentType = "application/octet-stream";
    } else if (typeof value === "string") {
      payload = value;
    } else {
      payload = JSON.stringify(value);
      contentType = "application/json";
    }

    const client = url.startsWith("https") ? https : http;
    const req = client.request(url, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "Content-Length": Buffer.isBuffer(payload) ? payload.length : Buffer.byteLength(payload)
      }
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve(d));
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ===================================
// GERENCIAMENTO ROBUSTO DE INSTÂNCIAS COM TIMESTAMP
// ===================================
async function gerenciarIpNoIndexJson() {
  try {
    let listaInstancias = [];
    
    try {
      const conteudoAtual = await apiGet(URL_IPS_INDEX);
      if (Array.isArray(conteudoAtual)) {
        listaInstancias = conteudoAtual;
      } else if (typeof conteudoAtual === "object" && conteudoAtual !== null) {
        listaInstancias = Object.values(conteudoAtual);
      }
    } catch (e) {
      listaInstancias = [];
    }

    const agora = Date.now();
    listaInstancias = listaInstancias.filter(item => {
      if (!item) return false;
      if (typeof item === "string") return true; 
      if (item.expiraEm && item.expiraEm > agora && item.id !== ID_INSTANCIA) return true;
      return false;
    });

    const novaInstancia = {
      id: ID_INSTANCIA,
      expiraEm: agora + 25000 
    };

    listaInstancias = listaInstancias.filter(i => (typeof i === "string" ? i !== ID_INSTANCIA : i.id !== ID_INSTANCIA));
    listaInstancias.push(novaInstancia);

    await apiPut(URL_IPS_INDEX_ESCRITA, JSON.stringify(listaInstancias, null, 2));
  } catch (err) {
    console.error("❌ Erro ao atualizar index.json:", err.message);
  }
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
// MÉTODO DE CLIQUE (COORDENADAS X, Y)
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
        screenY: yCoord
      };

      elemento.dispatchEvent(new MouseEvent('mouseover', opts));
      elemento.dispatchEvent(new MouseEvent('mousedown', opts));
      elemento.focus({ preventScroll: true });
      elemento.dispatchEvent(new MouseEvent('mouseup', opts));
      elemento.dispatchEvent(new MouseEvent('click', opts));

      if (typeof elemento.click === 'function') {
        elemento.click();
      }
    }, px, py);

    console.log(`🖱 Clique executado → X=${px} Y=${py}`);
  } catch (e) {
    console.log(`Erro no clique X=${px} Y=${py}:`, e.message);
  }
}

// ===================================
// OBSERVADOR DE COORDENADAS EM TEMPO REAL
// ===================================
function iniciarObservadorDeCliques(page) {
  setInterval(async () => {
    if (!URL_Y_LEITURA || !URL_X_LEITURA || page.isClosed()) return;

    try {
      const strY = await apiGet(URL_Y_LEITURA);
      const strX = await apiGet(URL_X_LEITURA);

      const y = parseFloat(strY);
      const x = parseFloat(strX);

      if (!isNaN(y) && !isNaN(x)) {
        await apiPut(URL_Y_ESCRITA, "null");
        await apiPut(URL_X_ESCRITA, "null");

        await processarCliqueUnico(page, x, y);
      }
    } catch (err) {}
  }, 500);
}

// ===================================
// PRINCIPAL
// ===================================
async function executar() {
  console.log(`🆔 ID da Instância Gerado: ${ID_INSTANCIA}`);
  
  BASE_API = `NAVEGADOR/NODE`;
  URL_IPS_INDEX = urlLeitura(`${BASE_API}/IPS/index.json`);
  URL_IPS_INDEX_ESCRITA = urlDownload(`${BASE_API}/IPS/index.json`);
  
  // Alterado de index.json para index.txt para salvar o Base64 em texto puro
  URL_IMG_TXT = urlDownload(`${BASE_API}/${ID_INSTANCIA}/IMG/index.txt`);
  
  URL_REDIRECT_TXT = urlLeitura(`${BASE_API}/${ID_INSTANCIA}/URL/REDIRECT/index.txt`);
  
  URL_Y_LEITURA = urlLeitura(`${BASE_API}/${ID_INSTANCIA}/Y/index.txt`);
  URL_X_LEITURA = urlLeitura(`${BASE_API}/${ID_INSTANCIA}/X/index.txt`);
  URL_Y_ESCRITA = urlDownload(`${BASE_API}/${ID_INSTANCIA}/Y/index.txt`);
  URL_X_ESCRITA = urlDownload(`${BASE_API}/${ID_INSTANCIA}/X/index.txt`);
  URL_NAVEGADOR_TEMP = urlDownload(`${BASE_API}/${ID_INSTANCIA}/NAVEGADOR/TEMP/index.txt`);

  try {
    await apiPut(URL_Y_ESCRITA, "null");
    await apiPut(URL_X_ESCRITA, "null");
    await apiPut(urlDownload(`${BASE_API}/${ID_INSTANCIA}/URL/REDIRECT/index.txt`), "null");
    await apiPut(URL_NAVEGADOR_TEMP, "0");
  } catch (e) {}

  await gerenciarIpNoIndexJson();

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
      "--disable-web-security",
      "--allow-running-insecure-content"
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  let ultimaURL = "https://google.com";
  console.log(`🌐 Abrindo página inicial: ${ultimaURL}`);
  
  try {
    await page.goto(ultimaURL, { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (err) {}

  iniciarObservadorDeCliques(page);

  let tempoInicio = Date.now();
  let contadorHeartbeat = 0;

  while (true) {
    try {
      const urlAtualNoBrowser = page.url();
      if (urlAtualNoBrowser && urlAtualNoBrowser !== "about:blank" && urlAtualNoBrowser !== ultimaURL) {
        ultimaURL = urlAtualNoBrowser;
      }

      // Lê URL de Redirecionamento da API
      const rawRedirect = await apiGet(URL_REDIRECT_TXT);
      if (typeof rawRedirect === "string" && rawRedirect.length > 0 && rawRedirect !== "null") {
        const novaUrl = corrigirUrl(rawRedirect);
        if (novaUrl.startsWith("http") && novaUrl !== ultimaURL) {
          console.log(`🔀 Redirecionando para: ${novaUrl}`);
          try {
            await page.goto(novaUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
            ultimaURL = novaUrl;
            await apiPut(urlDownload(`${BASE_API}/${ID_INSTANCIA}/URL/REDIRECT/index.txt`), "null");
          } catch (navErr) {
            await apiPut(urlDownload(`${BASE_API}/${ID_INSTANCIA}/URL/REDIRECT/index.txt`), "null");
          }
        }
      }

      // Salva o tempo atual do navegador
      const tempoDecorrido = Math.floor((Date.now() - tempoInicio) / 1000);
      await apiPut(URL_NAVEGADOR_TEMP, String(tempoDecorrido));

      // Salva Screenshot atual convertido para Base64 (string) em IMG/index.txt via POST
      if (!page.isClosed()) {
        const screenshotBuffer = await page.screenshot({ type: "jpeg", quality: 50 });
        const screenshotBase64 = screenshotBuffer.toString("base64");
        
        await apiPut(URL_IMG_TXT, screenshotBase64);
      }

      // Atualiza o heartbeat a cada 10 segundos
      contadorHeartbeat++;
      if (contadorHeartbeat >= 10) {
        contadorHeartbeat = 0;
        await gerenciarIpNoIndexJson();
      }

    } catch (err) {
      console.error("Erro no loop:", err.message);
    }

    await new Promise(r => setTimeout(r, 1000));
  }
}

executar().catch(err => {
  console.error("❌ Erro fatal:", err.message);
});
