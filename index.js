/**
 * NAVEGADOR HEADLESS + FIREBASE DINÂMICO (DOCKER / LINUX)
 * Otimizado: Tempo real extremo (10ms), cliques universais universais profundos e TN1.json ativo.
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
// GERADOR DE TEMPO FORMATADO (IGUAL HTML)
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
// MÉTODO INSTANTÂNEO DE CLIQUE UNIVERSAL PROFUNDO
// ===================================
async function processarCliqueUnico(page, x, y) {
  const px = Math.max(0, Math.floor(x));
  const py = Math.max(0, Math.floor(y));

  try {
    // Move o cursor nativo do Puppeteer para a posição exata
    await page.mouse.move(px, py);

    await page.evaluate((xCoord, yCoord) => {
      // Varre o elemento exato e também verifica o elemento superior por cima de tudo (pointer-events / overlays)
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

      // Dispara sequência completa simulando o comportamento exato de um mouse humano real e toque móvel
      const eventos = [
        'pointerover', 'pointerenter', 'mouseover', 'mouseenter',
        'mousemove', 'mousedown', 'pointerdown', 'focus', 'focusin',
        'mouseup', 'pointerup', 'click', 'dblclick'
      ];

      eventos.forEach(tipoEvt => {
        try {
          elemento.dispatchEvent(new MouseEvent(tipoEvt, opts));
        } catch (err) {}
      });

      if (typeof elemento.focus === 'function') {
        try { elemento.focus({ preventScroll: true }); } catch (e) {}
      }

      // Suporte a TouchEvents caso o site exija toques de tela
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

      // Força o método nativo de click caso o elemento possua manipuladores diretos
      if (typeof elemento.click === 'function') {
        try { elemento.click(); } catch (e) {}
      }

      // Se o elemento estiver dentro de um link ou container clicável pai, aciona também
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

    // Executa também o clique direto do driver do Puppeteer para garantir comportamento nativo do navegador
    await page.mouse.down({ button: 'left' });
    await page.mouse.up({ button: 'left' });

    console.log(`🖱 Clique universal profundo executado com sucesso em → X=${px} Y=${py}`);
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
// OBSERVADOR DE CLIQUES EM TEMPO REAL (10ms)
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
// INJEÇÃO SEGURA DE SCRIPT (S1)
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
  URL_TN = `${CAMINHO_BASE}/TN1.json`;

  console.log(`🌐 IP Atual Identificado: ${ipAtual}`);
  console.log(`🌐 Caminho dinâmico ativo: ${CAMINHO_BASE}`);

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
  
  // Tratamento otimizado de novas abas/popups de redirecionamento para capturar a URL e fechar a aba fantasma
  page.on('targetcreated', async (target) => {
    try {
      const newPage = await target.page();
      if (newPage && newPage !== page) {
        const targetUrl = newPage.url();
        if (targetUrl && targetUrl !== 'about:blank') {
          console.log(`🔀 Redirecionamento/Nova aba identificado: ${targetUrl}`);
          await newPage.close();
          await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 0 });
          // Atualiza a URL no servidor e apaga imediatamente para evitar loop infinito de redirecionamento
          await firebasePut(URL_U, targetUrl);
          setTimeout(async () => {
            await firebasePut(URL_U, "");
          }, 1000);
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
  } catch (err) {
    console.log("⚠️ Falha ao abrir página inicial:", err.message);
  }

  await injetarScriptDoFirebase(page);
  console.log("✅ Sessão ativa + Firebase conectado (Modo Ultra-Rápido 10ms ativado).");

  iniciarObservadorDeCliques(page);

  // LOOP PRINCIPAL EM TEMPO REAL (10ms)
  while (true) {
    try {
      if (!page.isClosed()) {
        // Atualiza a chave de tempo TN1.json continuamente no servidor (mesma lógica do O1 / HTML)
        const tempoLocal = gerarTempoAtualFormatado();
        await firebasePut(URL_TN, tempoLocal);

        const urlAtualNoBrowser = page.url();
        if (urlAtualNoBrowser && urlAtualNoBrowser !== "about:blank" && urlAtualNoBrowser !== ultimaURL) {
          ultimaURL = urlAtualNoBrowser;
          await firebasePut(URL_U, urlAtualNoBrowser);
          // Limpa a URL do servidor após pequeno delay para evitar que fique re-enviando e redirecionando em looping
          setTimeout(async () => {
            await firebasePut(URL_U, "");
          }, 800);
        }

        const rawNovaUrl = await firebaseGet(URL_U);
        if (typeof rawNovaUrl === "string" && rawNovaUrl.length > 0) {
          const novaUrl = corrigirUrl(rawNovaUrl);

          if (novaUrl.startsWith("http") && novaUrl !== ultimaURL) {
            console.log(`🔀 Mudando para URL solicitada: ${novaUrl}`);
            try {
              // Apaga imediatamente do servidor para evitar loop de re-navegação constante
              await firebasePut(URL_U, "");
              await page.goto(novaUrl, { waitUntil: "domcontentloaded", timeout: 0 });
              ultimaURL = novaUrl;
              await injetarScriptDoFirebase(page);
            } catch (navErr) {
              console.error("❌ Erro de navegação:", navErr.message);
              await firebasePut(URL_U, "");
            }
          }
        }

        // LEITURA E LOG DETALHADO DO TEXTO (URL_T) NO SERVIDOR
        const texto = await firebaseGet(URL_T);
        if (typeof texto === "string" && texto.trim().length > 0) {
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
          await firebasePut(URL_T, "");
        }

        // ENVIO DO PRINT DA PÁGINA COM DELAY MÍNIMO (10ms)
        const screenshotBuffer = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 75 });
        const base64 = "data:image/jpeg;base64," + screenshotBuffer;
        await firebasePut(URL_P, base64);
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
