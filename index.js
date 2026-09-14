/**
 * NAVEGADOR HEADLESS + STORAGE API DINÂMICO (DOCKER / LINUX)
 * Otimizado: Integração completa com a API de Storage (/X/) e limpeza inicial das chaves.
 */

const puppeteer = require("puppeteer");
const https = require("https");
const http = require("http");
const path = require("path");
const fs = require("fs");

// ===================================
// CONFIGURAÇÃO DA API DE STORAGE
// ===================================
const API_BASE = "https://api-storageamheex.onrender.com";

let IP_ATUAL = "";
let CAMINHO_BASE = "";
let URL_CLICK, URL_U, URL_T, URL_IMG, URL_S, URL_REDIRECT, URL_Y, URL_X, URL_TEMP;

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
// STORAGE API HELPERS (COM SUPORTE A /X/)
// ===================================
function apiGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { 
          if (res.headers['content-type'] && res.headers['content-type'].includes('application/json')) {
            resolve(JSON.parse(data));
          } else {
            resolve(data);
          }
        }
        catch { resolve(data || null); }
      });
    }).on("error", reject);
  });
}

function apiPut(url, value) {
  return new Promise((resolve, reject) => {
    const data = typeof value === "string" ? value : JSON.stringify(value);
    const client = url.startsWith("https") ? https : http;
    const req = client.request(url, {
      method: "PUT",
      headers: {
        "Content-Type": typeof value === "string" ? "text/plain" : "application/json",
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
// MÉTODO INSTANTÂNEO DE CLIQUE UNIVERSAL
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

      elemento.dispatchEvent(new MouseEvent('pointerover', opts));
      elemento.dispatchEvent(new MouseEvent('pointerenter', opts));
      elemento.dispatchEvent(new MouseEvent('mouseover', opts));
      elemento.dispatchEvent(new MouseEvent('mouseenter', opts));
      elemento.dispatchEvent(new MouseEvent('mousemove', opts));
      elemento.dispatchEvent(new MouseEvent('mousedown', opts));
      
      if (typeof elemento.focus === 'function') {
        elemento.focus({ preventScroll: true });
      }

      elemento.dispatchEvent(new MouseEvent('mouseup', opts));
      elemento.dispatchEvent(new MouseEvent('click', opts));
      elemento.dispatchEvent(new MouseEvent('pointerup', opts));

      if (typeof TouchEvent !== 'undefined') {
        try {
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
          elemento.dispatchEvent(new TouchEvent('touchstart', touchOpts));
          elemento.dispatchEvent(new TouchEvent('touchend', touchOpts));
        } catch (e) {}
      }

      if (typeof elemento.click === 'function') {
        elemento.click();
      }
    }, px, py);

    console.log(`🖱 Clique instantâneo executado → X=${px} Y=${py}`);
  } catch (e) {
    console.log(`Erro no clique instantâneo X=${px} Y=${py}:`, e.message);
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
// OBSERVADOR DE CLIQUES EM TEMPO REAL
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
          await apiPut(URL_CLICK, "null");
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
// INJEÇÃO SEGURA DE SCRIPT (S1)
// ===================================
async function injetarScriptDoStorage(page) {
  try {
    const codigoScript = await apiGet(URL_S);
    
    if (!codigoScript || typeof codigoScript !== "string" || codigoScript.trim().length === 0 || codigoScript.trim().toLowerCase() === "null") {
      return;
    }

    await page.evaluate((scriptContent) => {
      const ID_SCRIPT_INJETADO = "__custom_storage_script__";
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
// GERADOR DE TEMPO FORMATADO
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
// PRINCIPAL
// ===================================
async function executar() {
  console.log("🔍 Descobrindo o IP atual da rede/dispositivo...");
  const ipAtual = await obterIpAtual();
  IP_ATUAL = ipAtual;
  
  CAMINHO_BASE = `AMHEEX/NAVEGADOR/${ipAtual}`;

  // URLs configuradas com o prefixo /X/ conforme a arquitetura da API de Storage
  URL_CLICK = `${API_BASE}/X/${CAMINHO_BASE}/CLICK.json`;
  URL_U = `${API_BASE}/X/${CAMINHO_BASE}/U1.json`;
  URL_T = `${API_BASE}/X/${CAMINHO_BASE}/T1.json`;
  URL_IMG = `${API_BASE}/X/${CAMINHO_BASE}/IMG/index.png`;
  URL_S = `${API_BASE}/X/${CAMINHO_BASE}/S1.json`;
  URL_REDIRECT = `${API_BASE}/X/${CAMINHO_BASE}/URL/REDIRECT/index.txt`;
  URL_Y = `${API_BASE}/X/${CAMINHO_BASE}/Y/index.txt`;
  URL_X = `${API_BASE}/X/${CAMINHO_BASE}/X/index.txt`;
  URL_TEMP = `${API_BASE}/X/${CAMINHO_BASE}/NAVEGADOR/TEMP/index.txt`;

  console.log(`🌐 IP Atual Identificado: ${ipAtual}`);
  console.log(`🌐 Caminho dinâmico ativo: ${CAMINHO_BASE}`);

  // Limpeza inicial: define todas as chaves principais como "null" ao iniciar o script
  console.log("🧹 Inicializando e limpando chaves no servidor (definindo como null)...");
  try {
    await Promise.all([
      apiPut(URL_CLICK, "null"),
      apiPut(URL_U, "null"),
      apiPut(URL_T, "null"),
      apiPut(URL_S, "null"),
      apiPut(URL_REDIRECT, "null"),
      apiPut(URL_X, "null"),
      apiPut(URL_Y, "null"),
      apiPut(URL_TEMP, "null")
    ]);
    console.log("✅ Chaves limpas com sucesso no servidor.");
  } catch (err) {
    console.log("⚠️ Aviso ao limpar chaves iniciais:", err.message);
  }

  const userDataDir = path.join(__dirname, "assets", "database");

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
      "--disable-gpu",
      "--single-process",
      "--disable-extensions",
      "--disable-features=Translate,HttpsFirstBalancedModeAutoEnable",
      "--disable-web-security",
      "--allow-running-insecure-content",
      "--js-flags=--max-old-space-size=4096",
      "--enable-unsafe-swiftshader",
      "--no-zygote"
    ]
  });

  const page = await browser.newPage();
  
  await page.setCacheEnabled(true);
  await page.setDefaultNavigationTimeout(0);
  await page.setDefaultTimeout(0);
  await page.setBypassCSP(true);
  
  page.on('targetcreated', async (target) => {
    try {
      const newPage = await target.page();
      if (newPage && newPage !== page) {
        const targetUrl = newPage.url();
        if (targetUrl && targetUrl !== 'about:blank') {
          console.log(`🔀 Redirecionando aba nova para a página principal: ${targetUrl}`);
          await newPage.close();
          await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 0 });
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
    await page.goto(ultimaURL, { waitUntil: "domcontentloaded", timeout: 0 });
    await apiPut(URL_U, ultimaURL);
  } catch (err) {
    console.log("⚠️ Falha ao abrir página inicial:", err.message);
  }

  await injetarScriptDoStorage(page);
  console.log("✅ Sessão ativa + Storage API conectada (Modo Ultra-Rápido ativado).");

  iniciarObservadorDeCliques(page);

  // LOOP PRINCIPAL EM TEMPO REAL
  while (true) {
    try {
      if (!page.isClosed()) {
        const urlAtualNoBrowser = page.url();
        if (urlAtualNoBrowser && urlAtualNoBrowser !== "about:blank" && urlAtualNoBrowser !== ultimaURL) {
          ultimaURL = urlAtualNoBrowser;
          const conteudoAtualU1 = await apiGet(URL_U);
          if (conteudoAtualU1 !== ultimaURL) {
            await apiPut(URL_U, ultimaURL);
          }
        }

        // SALVAR TEMPO DO NAVEGADOR
        try {
          const tempoAtualStr = gerarTempoAtualFormatado();
          const conteudoAtualTemp = await apiGet(URL_TEMP);
          if (conteudoAtualTemp !== tempoAtualStr) {
            await apiPut(URL_TEMP, tempoAtualStr);
          }
        } catch (e) {}

        // VERIFICAR REDIRECIONAMENTO VIA REDIRECT/index.txt
        try {
          const redirectUrlRaw = await apiGet(URL_REDIRECT);
          if (redirectUrlRaw && typeof redirectUrlRaw === "string" && redirectUrlRaw.trim().length > 0 && redirectUrlRaw.trim().toLowerCase() !== "null") {
            const novaUrlRedirect = corrigirUrl(redirectUrlRaw);
            if (novaUrlRedirect.startsWith("http") && novaUrlRedirect !== ultimaURL) {
              console.log(`🔀 Redirecionamento detectado para: ${novaUrlRedirect}`);
              await page.goto(novaUrlRedirect, { waitUntil: "domcontentloaded", timeout: 0 });
              ultimaURL = novaUrlRedirect;
              await apiPut(URL_REDIRECT, "null");
              await injetarScriptDoStorage(page);
            }
          }
        } catch (e) {}

        const rawNovaUrl = await apiGet(URL_U);
        if (typeof rawNovaUrl === "string" && rawNovaUrl.length > 0 && rawNovaUrl.trim().toLowerCase() !== "null") {
          const novaUrl = corrigirUrl(rawNovaUrl);

          if (novaUrl.startsWith("http") && novaUrl !== ultimaURL) {
            console.log(`🔀 URL Ajustada / Mudando para: ${novaUrl}`);
            try {
              await page.goto(novaUrl, { waitUntil: "domcontentloaded", timeout: 0 });
              ultimaURL = novaUrl;
              await apiPut(URL_U, "");
              await injetarScriptDoStorage(page);
            } catch (navErr) {
              console.error("❌ Erro de navegação:", navErr.message);
              await apiPut(URL_U, "null");
            }
          }
        }

        // VERIFICAR COORDENADAS X E Y PARA CLIQUE EXTERNO
        try {
          const coordXRaw = await apiGet(URL_X);
          const coordYRaw = await apiGet(URL_Y);

          if (coordXRaw !== null && coordYRaw !== null && String(coordXRaw).trim().toLowerCase() !== "null" && String(coordYRaw).trim().toLowerCase() !== "null") {
            const xVal = parseFloat(coordXRaw);
            const yVal = parseFloat(coordYRaw);

            if (!isNaN(xVal) && !isNaN(yVal)) {
              console.log(`📍 Coordenadas recebidas para clique -> X=${xVal}, Y=${yVal}`);
              await processarCliqueUnico(page, xVal, yVal);
              
              // Limpar coordenadas salvando "null"
              await apiPut(URL_X, "null");
              await apiPut(URL_Y, "null");
            }
          }
        } catch (e) {}

        // LEITURA E LOG DETALHADO DO TEXTO (URL_T) NO SERVIDOR
        const texto = await apiGet(URL_T);
        if (typeof texto === "string" && texto.trim().length > 0 && texto.trim().toLowerCase() !== "null") {
          console.log(`📥 Texto input identificado no servidor: "${texto}"`);

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
            } else {
              const active = document.activeElement;
              if (active) {
                active.value = textoInserir;
                active.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }
          }, texto);

          console.log("⌨ Texto colado/substituído em todos os inputs da página com sucesso.");
          await apiPut(URL_T, "null");
        }

        // ENVIO DO PRINT DA PÁGINA EM BINÁRIO PARA O STORAGE
        const screenshotBuffer = await page.screenshot({ type: "jpeg", quality: 75 });
        const imgSaveUrl = URL_IMG;
        
        await new Promise((resolve) => {
          const client = imgSaveUrl.startsWith("https") ? https : http;
          const req = client.request(imgSaveUrl, {
            method: "PUT",
            headers: {
              "Content-Type": "image/jpeg",
              "Content-Length": screenshotBuffer.length
            }
          }, res => {
            res.on("data", () => {});
            res.on("end", resolve);
          });
          req.on("error", () => resolve());
          req.write(screenshotBuffer);
          req.end();
        });
      }
    } catch (err) {
      console.error("Erro no loop principal:", err.message);
    }

    await new Promise(r => setTimeout(r, 10));
  }
}

// ===================================
// INICIAR
// ===================================
executar().catch(err => {
  console.error("❌ Erro fatal:", err.message);
});
