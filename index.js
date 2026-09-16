/**
 * NAVEGADOR HEADLESS — LOCAL FIRST
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

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

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
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return possiblePaths[0];
}

// ===================================
// CLIQUE (COM TRATAMENTO DE CONTEXTO DESTRUÍDO)
// ===================================
async function clickAt(page, xRatio, yRatio) {
  try { await page.mouse.up(); } catch {}

  try {
    const vp = await page.viewport();
    const pageSize = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      height: document.documentElement.scrollHeight
    }));

    const realX = Math.floor(xRatio * pageSize.width);
    const realY = Math.floor(yRatio * pageSize.height);

    await page.evaluate(y => window.scrollTo(0, y - 100), realY);

    const visible = await page.evaluate(() => ({
      top: window.scrollY,
      height: window.innerHeight
    }));

    let clickX = Math.max(1, Math.min(realX, vp.width - 1));
    let clickY = Math.max(1, Math.min(realY - visible.top, vp.height - 1));

    await page.evaluate(() => new Promise(res => requestAnimationFrame(res)));

    await page.mouse.move(clickX, clickY);
    await page.mouse.down();
    await page.mouse.up();

    console.log(`🖱 Clique → X=${clickX}px Y=${clickY}px`);

    return await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      const path = [];
      let cur = el;
      while (cur) {
        path.push(cur.tagName);
        cur = cur.parentElement;
      }
      return { path };
    }, [clickX, clickY]);
  } catch (err) {
    console.log("⚠️ Aviso no clique (navegação detectada):", err.message);
    return null;
  }
}

// ===================================
// INSERIR TEXTO
// ===================================
async function setText(page, elementInfo, text) {
  if (!elementInfo) return;

  try {
    await page.evaluate((info, value) => {
      let el = document.body;
      const path = info.path.slice().reverse();

      for (let tag of path) {
        const found = el.querySelector(tag);
        if (found) el = found;
      }

      if (el && "value" in el) {
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }, elementInfo, text);

    console.log("⌨ Texto inserido:", text);
  } catch (err) {
    console.log("⚠️ Erro ao inserir texto:", err.message);
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
async function executar(siteUrl) {
  const chromiumPath = getChromiumPath();

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromiumPath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-web-security",
      "--disable-extensions",
      "--disable-dev-shm-usage",
      "--no-zygote",
      "--single-process",
      "--disable-infobars"
    ]
  });

  const page = await browser.newPage();
  
  // Define User-Agent real para evitar bloqueios de rede
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
  await page.setViewport({ width: 1366, height: 768 });

  // Ativa interceptação antes para evitar ERR_ABORTED
  await page.setRequestInterception(true);
  page.on("request", req => {
    const type = req.resourceType();
    if (["document", "xhr", "fetch", "script"].includes(type)) {
      return req.continue();
    }
    if (["image", "media", "font", "stylesheet", "websocket"].includes(type)) {
      return req.abort();
    }
    req.continue();
  });

  console.log("🌐 Carregando página:", siteUrl);
  try {
    await page.goto(siteUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (err) {
    console.log("⚠️ Aviso na navegação:", err.message);
  }

  console.log("🚀 Sistema rodando e lendo/salvando assets localmente.");

  let ultimoJSON = fetchLocalJSON();
  let ultimaURL = siteUrl;
  let lastClickInfo = null;

  while (true) {
    const novoJSON = fetchLocalJSON();

    // Mudança de site via JSON local
    if (novoJSON.site && novoJSON.site !== ultimaURL) {
      const newURL = novoJSON.site.startsWith("http") ? novoJSON.site : "https://" + novoJSON.site;
      console.log("🔀 Mudando para:", newURL);
      try {
        await page.goto(newURL, { waitUntil: "domcontentloaded" });
        ultimaURL = newURL;
      } catch (e) {
        console.log("Erro ao trocar de site:", e.message);
      }
    }

    // Clique via JSON local
    if (novoJSON.click && (!ultimoJSON.click || novoJSON.click.x !== ultimoJSON.click.x || novoJSON.click.y !== ultimoJSON.click.y)) {
      lastClickInfo = await clickAt(page, novoJSON.click.x, novoJSON.click.y);
      delete novoJSON.click;
      saveJSON(novoJSON);
    }

    // Texto via JSON local
    if (novoJSON.text) {
      await setText(page, lastClickInfo, novoJSON.text);
      delete novoJSON.text;
      saveJSON(novoJSON);
    }

    // Salva print localmente
    await screenshotSmart(page);

    ultimoJSON = novoJSON;
    await new Promise(r => setTimeout(r, 100));
  }
}

// ===================================
// INICIAR
// ===================================
(async () => {
  const json = fetchLocalJSON();
  let url = json.site || "https://google.com";
  if (!url.startsWith("http")) url = "https://" + url;

  await executar(url);
})();
