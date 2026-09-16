/**
 * NAVEGADOR HEADLESS
 * 90% PRIORIDADE PARA CARREGAR A PÁGINA
 * 10% PARA SCRIPT / CONTROLE JSON
 */

const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ===================================
// DIRS
// ===================================
const BASE_DIR = __dirname;
const OUTPUT_DIR = path.join(BASE_DIR, "assets");
const IMAGE_PATH = path.join(OUTPUT_DIR, "index.png");
const TMP_IMAGE = path.join(OUTPUT_DIR, "tmp.png");
const LOCAL_JSON = path.join(OUTPUT_DIR, "index.json");

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ===================================
// JSON LOCAL
// ===================================
function fetchLocalJSON() {
  try { return JSON.parse(fs.readFileSync(LOCAL_JSON, "utf8")); }
  catch { return {}; }
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
// CLIQUE ULTRA RÁPIDO — PRIORIDADE DE RENDERIZAÇÃO
// ===================================
async function clickAt(page, xRatio, yRatio) {
  try { await page.mouse.up(); } catch {}

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

  let clickX = realX;
  let clickY = realY - visible.top;

  clickX = Math.max(1, Math.min(clickX, vp.width - 1));
  clickY = Math.max(1, Math.min(clickY, vp.height - 1));

  // PRIORIDADE: entrega frame ao navegador
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
}

// ===================================
// INSERIR TEXTO
// ===================================
async function setText(page, elementInfo, text) {
  if (!elementInfo) return;

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
}

// ===================================
// SCREENSHOT INTELIGENTE (ULTRA LEVE)
// ===================================
async function screenshotSmart(page) {
  await page.screenshot({ path: TMP_IMAGE, fullPage: true });

  const oldHash = hashFile(IMAGE_PATH);
  const newHash = hashFile(TMP_IMAGE);

  if (oldHash === newHash) return fs.unlinkSync(TMP_IMAGE);

  fs.renameSync(TMP_IMAGE, IMAGE_PATH);
  console.log("📸 Screenshot atualizado.");
}

// ===================================
// PRINCIPAL — 90% PRIORIDADE PARA A PÁGINA
// ===================================
async function executar(siteUrl) {
  // Caminho dinâmico compatível com o Termux ($PREFIX/bin/chromium)
  const termuxPrefix = process.env.PREFIX || "/data/data/com.termux/files/usr";
  const chromiumPath = process.env.CHROMIUM_PATH || path.join(termuxPrefix, "bin", "chromium");

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromiumPath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-web-security",
      "--disable-extensions",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-popup-blocking",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-features=ScriptStreaming"
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  // == 90% prioritário (apenas DOM carregado)
  console.log("🌐 Carregando página rápido:", siteUrl);
  await page.goto(siteUrl, { waitUntil: "domcontentloaded" });

  // BLOQUEIA lixo → acelera 4x
  await page.setRequestInterception(true);
  page.on("request", req => {
    const type = req.resourceType();

    if (["image", "media", "font", "stylesheet", "websocket"].includes(type))
      return req.abort();

    if (/analytics|ads|pixel|tracker/i.test(req.url()))
      return req.abort();

    req.continue();
  });

  console.log("🚀 Página pronta para ação (prioridade total).");

  let ultimoJSON = fetchLocalJSON();
  let ultimaURL = siteUrl;
  let lastClickInfo = null;

  while (true) {
    const novoJSON = fetchLocalJSON();

    // 🌐 MUDANÇA DE SITE RÁPIDA
    if (novoJSON.site && novoJSON.site !== ultimaURL) {
      const newURL = novoJSON.site.startsWith("http")
        ? novoJSON.site
        : "https://" + novoJSON.site;

      console.log("🔀 Mudando para:", newURL);

      await page.goto(newURL, { waitUntil: "domcontentloaded" });
      ultimaURL = newURL;
    }

    // 🖱 CLIQUE ULTRA PRIORITÁRIO
    if (novoJSON.click && (
      !ultimoJSON.click ||
      novoJSON.click.x !== ultimoJSON.click.x ||
      novoJSON.click.y !== ultimoJSON.click.y
    )) {
      lastClickInfo = await clickAt(page, novoJSON.click.x, novoJSON.click.y);
      delete novoJSON.click;
      saveJSON(novoJSON);
    }

    // ⌨ TEXTO
    if (novoJSON.text) {
      await setText(page, lastClickInfo, novoJSON.text);
      delete novoJSON.text;
      saveJSON(novoJSON);
    }

    // 📸 SCREENSHOT LEVE
    await screenshotSmart(page);

    ultimoJSON = novoJSON;

    // LOOP ULTRA RÁPIDO — 10% PRIORIDADE PARA SCRIPT
    await new Promise(r => setTimeout(r, 5));
  }
}

// ===================================
// INICIAR
// ===================================
(async () => {
  const json = fetchLocalJSON();
  let url = json.site;

  if (!url) return console.log("❌ JSON sem campo 'site'.");
  if (!url.startsWith("http")) url = "https://" + url;

  await executar(url);
})();
