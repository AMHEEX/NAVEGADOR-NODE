/**
 * NAVEGADOR HEADLESS — LOCAL FIRST (OTIMIZADO E CORRIGIDO PARA O TERMUX)
 * Salva dados e perfil em: /data/data/com.termux/files/home/NAVEGADOR-NODE/assets/database
 */

const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ===================================
// DIRS (Assets locais no Termux)
// ===================================
const BASE_DIR = __dirname;
const OUTPUT_DIR = path.join(BASE_DIR, "assets");
const IMAGE_PATH = path.join(OUTPUT_DIR, "index.png");
const TMP_IMAGE = path.join(OUTPUT_DIR, "tmp.png");
const LOCAL_JSON = path.join(OUTPUT_DIR, "index.json");

// Caminho exato e absoluto para evitar conflitos no Termux
const TERMUX_HOME = process.env.HOME || "/data/data/com.termux/files/home";
const USER_DATA_DIR = path.join(TERMUX_HOME, "NAVEGADOR-NODE", "assets", "database");

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ===================================
// LIMPEZA E RECRIAÇÃO TOTAL DA DATABASE
// ===================================
function limparDatabaseCompleto() {
  try {
    if (fs.existsSync(USER_DATA_DIR)) {
      fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
      console.log("🗑️ Pasta database apagada com sucesso antes de iniciar.");
    }
  } catch (e) {
    console.log("⚠️ Não foi possível apagar a database anterior:", e.message);
  }
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

limparDatabaseCompleto();

// Garante um JSON inicial local se não existir
if (!fs.existsSync(LOCAL_JSON)) {
  fs.writeFileSync(LOCAL_JSON, JSON.stringify({ site: "https://google.com", text: "", script: "" }, null, 2));
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
// CLIQUE SEGURO UNIFICADO (COM SUPORTE A IFRAMES E FRAMES)
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

    // Move o mouse do Puppeteer para disparar eventos nativos de hover/focus
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.mouse.up();

    // Executa varredura profunda incluindo sub-frames (iframes)
    await page.evaluate((xCoord, yCoord) => {
      function findElementDeep(doc, x, y) {
        let el = doc.elementFromPoint(x, y);
        if (el && el.tagName && el.tagName.toLowerCase() === 'iframe') {
          try {
            const frameDoc = el.contentDocument || el.contentWindow.document;
            const rect = el.getBoundingClientRect();
            const subEl = findElementDeep(frameDoc, x - rect.left, y - rect.top);
            if (subEl) return subEl;
          } catch (e) {}
        }
        return el;
      }

      const elemento = findElementDeep(document, xCoord, yCoord);
      if (!elemento) return;

      const opts = {
        bubbles: true, cancelable: true, view: window,
        clientX: xCoord, clientY: yCoord, screenX: xCoord, screenY: yCoord
      };

      elemento.dispatchEvent(new MouseEvent('mouseover', opts));
      elemento.dispatchEvent(new MouseEvent('mousedown', opts));
      if (typeof elemento.focus === 'function') {
        elemento.focus({ preventScroll: true });
      }
      elemento.dispatchEvent(new MouseEvent('mouseup', opts));
      elemento.dispatchEvent(new MouseEvent('click', opts));

      if (typeof elemento.click === 'function') {
        elemento.click();
      }
    }, px, py);

    console.log(`🖱 Clique → X=${px} Y=${py}`);
  } catch (err) {
    console.log("⚠️ Aviso no clique:", err.message);
  }
}

// ===================================
// INSERIR E SUBSTITUIR TEXTO EM INPUTS (COM SUPORTE A REACT/VUE E DIGITAÇÃO)
// ===================================
async function setText(page, textValue) {
  if (!textValue || typeof textValue !== "string" || !textValue.trim()) return;
  try {
    const filled = await page.evaluate((valor) => {
      let ativo = document.activeElement;
      
      // Valida se o elemento ativo é um campo aceitável de escrita
      if (!ativo || (ativo.tagName !== 'INPUT' && ativo.tagName !== 'TEXTAREA' && !ativo.isContentEditable) || (ativo.tagName === 'INPUT' && ['file', 'hidden', 'submit', 'button', 'checkbox', 'radio'].includes(ativo.type))) {
        ativo = document.querySelector('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]');
      }

      if (ativo) {
        ativo.focus();
        
        // Compatibilidade avançada para frameworks modernos (React/Vue/Angular setter)
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;

        if (ativo.tagName === 'INPUT' && nativeInputValueSetter) {
          nativeInputValueSetter.call(ativo, valor);
        } else if (ativo.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
          nativeTextAreaValueSetter.call(ativo, valor);
        } else {
          ativo.value = valor;
        }

        // Dispara todos os eventos essenciais para que o site processe o valor preenchido
        ativo.dispatchEvent(new Event('focus', { bubbles: true }));
        ativo.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: valor.charAt(0) }));
        ativo.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: valor }));
        ativo.dispatchEvent(new Event('change', { bubbles: true }));
        ativo.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      }
      return false;
    }, textValue);

    if (filled) {
      console.log("⌨ Texto substituído/inserido nos inputs com sucesso:", textValue);
    } else {
      // Fallback drástico simulando digitação real via teclado físico do Puppeteer
      await page.keyboard.type(textValue, { delay: 50 });
      console.log("⌨ Texto digitado via teclado virtual:", textValue);
    }
  } catch (err) {
    console.log("⚠️ Erro ao inserir texto:", err.message);
  }
}

// ===================================
// INJEÇÃO SEGURA DE SCRIPT
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
    waitForInitialPage: false,
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

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();
  
  await page.setViewport({ width: 1366, height: 768 });
  await page.setBypassCSP(true);

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
    if (initialJson.script) {
      await injectScript(page, initialJson.script);
    }
  } catch (err) {
    console.log("⚠️ Aviso na navegação inicial:", err.message);
  }

  console.log("🚀 Sistema rodando localmente de forma estável.");

  let ultimoJSON = fetchLocalJSON();

  while (true) {
    try {
      if (!browser.connected || page.isClosed()) {
        console.error("❌ O navegador foi fechado inesperadamente.");
        break;
      }

      const novoJSON = fetchLocalJSON();

      const urlAtualNoBrowser = page.url();
      if (urlAtualNoBrowser && urlAtualNoBrowser !== "about:blank" && urlAtualNoBrowser !== ultimaURL) {
        ultimaURL = urlAtualNoBrowser;
        novoJSON.site = ultimaURL;
        saveJSON(novoJSON);
      }

      if (novoJSON.site) {
        const novaUrlFormatada = corrigirUrl(novoJSON.site);
        if (novaUrlFormatada !== ultimaURL) {
          console.log("🔀 Mudando para:", novaUrlFormatada);
          try {
            await page.goto(novaUrlFormatada, { waitUntil: "domcontentloaded", timeout: 30000 });
            ultimaURL = novaUrlFormatada;
            if (novoJSON.script) {
              await injectScript(page, novoJSON.script);
            }
          } catch (e) {
            console.log("Erro ao trocar de site:", e.message);
          }
        }
      }

      if (novoJSON.click && (!ultimoJSON.click || novoJSON.click.x !== ultimoJSON.click.x || novoJSON.click.y !== ultimoJSON.click.y)) {
        await clickAt(page, novoJSON.click.x, novoJSON.click.y);
        delete novoJSON.click;
        saveJSON(novoJSON);
      }

      if (novoJSON.text && novoJSON.text.trim() !== "") {
        await setText(page, novoJSON.text);
        novoJSON.text = "";
        saveJSON(novoJSON);
      }

      if (novoJSON.script && novoJSON.script !== ultimoJSON.script) {
        await injectScript(page, novoJSON.script);
      }

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
