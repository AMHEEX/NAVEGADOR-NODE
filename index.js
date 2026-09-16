/**
 * NAVEGADOR HEADLESS — LOCAL FIRST (OTIMIZADO SEM BUGAR O DOM)
 * Lê e salva prints e JSON localmente na pasta assets
 */

const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ===================================
// DIRS (Assets locais)
// ===================================
const BASE_DIR = __dirname;
const OUTPUT_DIR = path.join(BASE_DIR, "assets");
const IMAGE_PATH = path.join(OUTPUT_DIR, "index.png");
const TMP_IMAGE = path.join(OUTPUT_DIR, "tmp.png");
const LOCAL_JSON = path.join(OUTPUT_DIR, "index.json");
const USER_DATA_DIR = path.join(OUTPUT_DIR, "database");

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Limpa trava anterior se existir para evitar crash de perfil
try {
  if (fs.existsSync(USER_DATA_DIR)) {
    const lockFile = path.join(USER_DATA_DIR, "SingletonLock");
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
  }
} catch (e) {}

// Garante um JSON inicial local se não existir
if (!fs.existsSync(LOCAL_JSON)) {
  fs.writeFileSync(LOCAL_JSON, JSON.stringify({ site: "https://google.com" }, null, 2));
}

// ===================================
// JSON LOCAL
// ===================================
function fetchLocalJSON() {
  try {
    return JSON.parse(fs.readFileSync(LOCAL_JSON, "utf8"));
  } catch {
    return {};
  }
}

function saveJSON(data) {
  fs.writeFileSync(LOCAL_JSON, JSON.stringify(data, null, 2));
}

// ===================================
// HASH
// ===================================
function hashFile(file) {
  try {
    const buff = fs.readFileSync(file);
    return crypto.createHash("md5").update(buff).digest("hex");
  } catch {
    return null;
  }
}

// ===================================
// ENCONTRAR CHROMIUM NO TERMUX
// ===================================
function getChromiumPath() {
  const termuxPrefix = process.env.PREFIX || "/data/data/com.termux/files/usr";
  const possiblePaths = [
    path.join(termuxPrefix, "bin", "chromium"),
    path.join(termuxPrefix, "bin", "chromium-browser"),
    "/data/data/com.termux/files/usr/bin/chromium",
    "/data/data/com.termux/files/usr/bin/chromium-browser"
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return possiblePaths[0];
}

// ===================================
// CORRETOR DE URL
// ===================================
function corrigirUrl(urlSuja) {
  if (!urlSuja || typeof urlSuja !== "string") return "https://google.com";
  let url = urlSuja.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  try {
    const parsed = new URL(url);
    const correcoes = {
      "youtueb.com": "youtube.com",
      "youtbe.com": "youtube.com",
      "gogle.com": "google.com"
    };
    if (correcoes[parsed.hostname]) {
      parsed.hostname = correcoes[correcoes[parsed.hostname]];
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

// ===================================
// CLIQUE SEGURO UNIFICADO
// ===================================
async function clickAt(page, xRatio, yRatio) {
  try {
    const vp = await page.viewport();
    const pageSize = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      height: document.documentElement.scrollHeight
    }));

    const px = Math.max(0, Math.floor(xRatio * pageSize.width));
    const py = Math.max(0, Math.floor(yRatio * pageSize.height));

    await page.mouse.move(px, py);

    await page.evaluate((xCoord, yCoord) => {
      const elemento = document.elementFromPoint(xCoord, yCoord);
      if (!elemento) return;

      const opts = {
        bubbles: true, cancelable: true, view: window,
        clientX: xCoord, clientY: yCoord, screenX: xCoord, screenY: yCoord
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

    console.log(`🖱 Clique → X=${px} Y=${py}`);
  } catch (err) {
    console.log("⚠️ Aviso no clique (navegação detectada):", err.message);
  }
}

// ===================================
// INSERIR TEXTO SEGURO
// ===================================
async function setText(page, text) {
  if (!text) return;
  try {
    await page.keyboard.type(text);
    console.log("⌨ Texto inserido:", text);
  } catch (err) {
    console.log("⚠️ Erro ao inserir texto:", err.message);
  }
}

// ===================================
// INJEÇÃO SEGURA DE SCRIPT (SEM BUGAR DOM)
// ===================================
async function injectScript(page, codeScript) {
  if (!codeScript || !codeScript.trim()) return;

  try {
    await page.evaluate((scriptContent) => {
      const ID_SCRIPT_INJETADO = "__custom_local_script__";
      let antigo = document.getElementById(ID_SCRIPT_INJETADO);
      if (antigo) antigo.remove();

      const s = document.createElement("script");
      s.id = ID_SCRIPT_INJETADO;
      s.textContent = scriptContent;
      (document.body || document.documentElement).appendChild(s);
    }, codeScript);
    console.log("✅ Script customizado injetado com sucesso.");
  } catch (err) {
    console.log("⚠️ Erro ao injetar script (contexto alterado):", err.message);
  }
}

// ===================================
// SCREENSHOT INTELIGENTE (LOCAL)
// ===================================
async function screenshotSmart(page) {
  try {
    await page.screenshot({ path: TMP_IMAGE, fullPage: true });

    const oldHash = hashFile(IMAGE_PATH);
    const newHash = hashFile(TMP_IMAGE);

    if (oldHash === newHash) {
      if (fs.existsSync(TMP_IMAGE)) fs.unlinkSync(TMP_IMAGE);
      return;
    }

    if (fs.existsSync(IMAGE_PATH)) fs.unlinkSync(IMAGE_PATH);
    fs.renameSync(TMP_IMAGE, IMAGE_PATH);
    console.log("📸 Screenshot atualizado em assets/index.png");
  } catch (err) {
    console.log("Erro no screenshot:", err.message);
  }
}

// ===================================
// PRINCIPAL
// ===================================
async function executar() {
  const chromiumPath = getChromiumPath();

  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: chromiumPath,
    userDataDir: USER_DATA_DIR,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-web-security",
      "--disable-extensions",
      "--disable-dev-shm-usage",
      "--no-zygote",
      "--single-process",
      "--disable-infobars",
      "--allow-running-insecure-content"
    ]
  });

  const page = await browser.newPage();
  
  await page.setViewport({ width: 1366, height: 768 });
  await page.setBypassCSP(true);

  // Tratamento de novas abas indesejadas (evita crash ao abrir links externos como YouTube)
  page.on('targetcreated', async (target) => {
    try {
      const newPage = await target.page();
      if (newPage && newPage !== page) {
        const targetUrl = newPage.url();
        if (targetUrl && targetUrl !== 'about:blank') {
          console.log(`🔀 Redirecionando aba nova para a página principal: ${targetUrl}`);
          await newPage.close();
          await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        }
      }
    } catch (e) {}
  });

  const initialJson = fetchLocalJSON();
  let ultimaURL = corrigirUrl(initialJson.site || "https://google.com");

  console.log("🌐 Carregando página inicial:", ultimaURL);
  try {
    await page.goto(ultimaURL, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (err) {
    console.log("⚠️ Aviso na navegação inicial:", err.message);
  }

  console.log("🚀 Sistema rodando localmente de forma estável.");

  let ultimoJSON = fetchLocalJSON();

  while (true) {
    try {
      const novoJSON = fetchLocalJSON();

      // Atualiza URL no JSON se mudou internamente no navegador
      const urlAtualNoBrowser = page.url();
      if (urlAtualNoBrowser && urlAtualNoBrowser !== "about:blank" && urlAtualNoBrowser !== ultimaURL) {
        ultimaURL = urlAtualNoBrowser;
        novoJSON.site = ultimaURL;
        saveJSON(novoJSON);
      }

      // Mudança de site via JSON local
      if (novoJSON.site) {
        const novaUrlFormatada = corrigirUrl(novoJSON.site);
        if (novaUrlFormatada !== ultimaURL) {
          console.log("🔀 Mudando para:", novaUrlFormatada);
          try {
            await page.goto(novaUrlFormatada, { waitUntil: "domcontentloaded", timeout: 30000 });
            ultimaURL = novaUrlFormatada;
            await injectScript(page, novoJSON.script);
          } catch (e) {
            console.log("Erro ao trocar de site:", e.message);
          }
        }
      }

      // Clique via JSON local
      if (novoJSON.click && (!ultimoJSON.click || novoJSON.click.x !== ultimoJSON.click.x || novoJSON.click.y !== ultimoJSON.click.y)) {
        await clickAt(page, novoJSON.click.x, novoJSON.click.y);
        delete novoJSON.click;
        saveJSON(novoJSON);
      }

      // Texto via JSON local
      if (novoJSON.text && novoJSON.text !== ultimoJSON.text) {
        await setText(page, novoJSON.text);
        delete novoJSON.text;
        saveJSON(novoJSON);
      }

      // Injeção de Script JS via JSON local (Sem quebrar o DOM)
      if (novoJSON.script && novoJSON.script !== ultimoJSON.script) {
        await injectScript(page, novoJSON.script);
      }

      // Salva print localmente
      await screenshotSmart(page);

      ultimoJSON = JSON.parse(JSON.stringify(novoJSON));
    } catch (err) {
      console.log("Erro no loop principal:", err.message);
    }

    await new Promise(r => setTimeout(r, 500));
  }
}

// ===================================
// INICIAR
// ===================================
executar().catch(err => {
  console.error("❌ Erro fatal:", err.message);
});
