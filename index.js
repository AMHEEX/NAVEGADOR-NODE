/**
 * NAVEGADOR HEADLESS + FIREBASE DINÂMICO (DOCKER / LINUX)
 * Otimizado: Sem restrições de segurança e sistema de clique aprimorado para qualquer elemento.
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
// MÉTODO UNIFICADO DE CLIQUE (MELHORADO PARA QUALQUER ELEMENTO)
// ===================================
async function processarCliqueUnico(page, x, y) {
  const px = Math.max(0, Math.floor(x));
  const py = Math.max(0, Math.floor(y));

  try {
    await page.mouse.move(px, py);

    const acaoExecutada = await page.evaluate((xCoord, yCoord) => {
      let elemento = document.elementFromPoint(xCoord, yCoord);
      
      // Se houver sombra (Shadow DOM), tenta buscar o elemento interno
      if (elemento && elemento.shadowRoot) {
        const shadowElement = elemento.shadowRoot.elementFromPoint(xCoord, yCoord);
        if (shadowElement) elemento = shadowElement;
      }

      if (!elemento) return false;

      // Sobe a árvore caso o elemento clicado seja um filho puramente visual sem eventos próprios
      let alvo = elemento;
      while (alvo && alvo !== document.body) {
        const style = window.getComputedStyle(alvo);
        if (alvo.onclick || style.cursor === 'pointer' || ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'].includes(alvo.tagName)) {
          break;
        }
        if (alvo.parentElement && alvo.parentElement !== document.body) {
          alvo = alvo.parentElement;
        } else {
          break;
        }
      }

      const opts = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX: xCoord,
        clientY: yCoord,
        screenX: xCoord,
        screenY: yCoord,
        buttons: 1
      };

      // Dispara sequência completa de eventos modernos de ponteiro, mouse e toque
      const eventos = [
        'pointerover', 'mouseover',
        'pointerenter', 'mouseenter',
        'pointerdown', 'mousedown',
        'focus',
        'pointerup', 'mouseup',
        'click',
        'pointerout', 'mouseout',
        'pointerleave', 'mouseleave'
      ];

      eventos.forEach(tipo => {
        try {
          let ev;
          if (tipo.startsWith('pointer')) {
            ev = new PointerEvent(tipo, opts);
          } else {
            ev = new MouseEvent(tipo, opts);
          }
          alvo.dispatchEvent(ev);
        } catch (err) {}
      });

      if (typeof TouchEvent !== 'undefined') {
        try {
          const touch = new Touch({
            identifier: Date.now(),
            target: alvo,
            clientX: xCoord,
            clientY: yCoord,
            radiusX: 5,
            radiusY: 5,
            rotationAngle: 0,
            force: 1
          });
          const touchOpts = { cancelable: true, bubbles: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] };
          alvo.dispatchEvent(new TouchEvent('touchstart', touchOpts));
          alvo.dispatchEvent(new TouchEvent('touchend', touchOpts));
        } catch (e) {}
      }

      if (typeof alvo.click === 'function') {
        try { alvo.click(); } catch (e) {}
      }

      return true;
    }, px, py);

    if (!acaoExecutada) {
      await page.mouse.down();
      await page.mouse.up();
    }

    console.log(`🖱 Clique universal executado → X=${px} Y=${py}`);
  } catch (e) {
    console.log(`Erro no clique X=${px} Y=${py}:`, e.message);
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
// LOOP EXCLUSIVO DE CLIQUE EM TEMPO REAL (10ms)
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
      // Ignora erros pontuais
    } finally {
      processando = false;
    }
  }, 10);
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

  URL_CLICK = `${CAMINHO_BASE}/CLICK.json`;
  URL_U = `${CAMINHO_BASE}/U1.json`;
  URL_T = `${CAMINHO_BASE}/T1.json`;
  URL_P = `${CAMINHO_BASE}/P1.json`;
  URL_S = `${CAMINHO_BASE}/S1.json`;

  console.log(`🌐 IP Atual Identificado: ${ipAtual}`);
  console.log(`🌐 Caminho dinâmico ativo: ${CAMINHO_BASE}`);

  // Diretório de perfil local dentro de assets/database na raiz do projeto
  const userDataDir = path.join(__dirname, "assets", "database");

  // Garante que o diretório exista e remove trava anterior (SingletonLock) se existir
  try {
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    } else {
      const lockFile = path.join(userDataDir, "SingletonLock");
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
        console.log("🧹 Trava de sessão anterior (SingletonLock) removida com sucesso.");
      }
    }
  } catch (e) {
    console.log("⚠️ Aviso ao gerenciar diretório de perfil:", e.message);
  }

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
      "--disable-features=Translate,HttpsFirstBalancedModeAutoEnable,IsolateOrigins,site-per-process",
      "--disable-web-security",
      "--allow-running-insecure-content",
      "--ignore-certificate-errors",
      "--ignore-certificate-errors-spki-list",
      "--aggressive-cache-discard",
      "--disk-cache-size=104857600",
      "--no-zygote"
    ]
  });

  const page = await browser.newPage();
  
  await page.setBypassCSP(true);
  await page.setJavaScriptEnabled(true);
  
  // Ignora erros de requisição e permite carregar qualquer recurso livremente
  await page.setRequestInterception(false);
  
  page.on('targetcreated', async (target) => {
    try {
      const newPage = await target.page();
      if (newPage && newPage !== page) {
        const targetUrl = newPage.url();
        if (targetUrl && targetUrl !== 'about:blank') {
          console.log(`🔀 Redirecionando aba nova para a página principal: ${targetUrl}`);
          await newPage.close();
          await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        }
      }
    } catch (e) {}
  });

  const larguraViewport = 1280;
  const alturaViewport = 720;
  await page.setViewport({ width: larguraViewport, height: alturaViewport });

  let ultimaURL = "https://google.com";

  console.log(`🌐 Abrindo página inicial: ${ultimaURL}`);
  
  try {
    await page.goto(ultimaURL, { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (err) {
    console.log("⚠️ Falha ao abrir página inicial:", err.message);
  }

  await injetarScriptDoFirebase(page);
  console.log("✅ Sessão ativa + Firebase dinâmico conectado.");

  iniciarObservadorDeCliques(page);

  while (true) {
    try {
      const urlAtualNoBrowser = page.url();
      if (urlAtualNoBrowser && urlAtualNoBrowser !== "about:blank" && urlAtualNoBrowser !== ultimaURL) {
        ultimaURL = urlAtualNoBrowser;
        await firebasePut(URL_U, ultimaURL);
      }

      const rawNovaUrl = await firebaseGet(URL_U);
      if (typeof rawNovaUrl === "string" && rawNovaUrl.length > 0) {
        const novaUrl = corrigirUrl(rawNovaUrl);

        if (novaUrl.startsWith("http") && novaUrl !== ultimaURL) {
          console.log(`🔀 URL Ajustada / Mudando para: ${novaUrl}`);
          try {
            await page.goto(novaUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
            ultimaURL = novaUrl;
            await firebasePut(URL_U, "");
            await injetarScriptDoFirebase(page);
          } catch (navErr) {
            console.error("❌ Erro de navegação:", navErr.message);
            await firebasePut(URL_U, "");
          }
        }
      }

      const texto = await firebaseGet(URL_T);
      if (typeof texto === "string" && texto.length > 0) {
        await page.keyboard.type(texto);
        console.log("⌨ Texto digitado:", texto);
        await firebasePut(URL_T, "");
      }

      if (!page.isClosed()) {
        const screenshotBuffer = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 50 });
        const base64 = "data:image/jpeg;base64," + screenshotBuffer;
        await firebasePut(URL_P, base64);
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
