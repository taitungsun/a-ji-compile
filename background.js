const MENU_ID = "a-ji-compile";

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "編譯成中英雙語講義",
      contexts: ["page", "selection"]
    });
  });
}

chrome.runtime.onInstalled.addListener(setupContextMenu);
chrome.runtime.onStartup.addListener(setupContextMenu);

const JOB_PREFIX = "job_";
const JOB_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// 清除超過一天仍未被開啟的待編譯文章（以及舊版遺留的 pendingArticle）
async function cleanupStaleJobs() {
  const all = await chrome.storage.local.get(null);
  const now = Date.now();
  const stale = Object.keys(all).filter(
    k => k === "pendingArticle" || (k.startsWith(JOB_PREFIX) && !(now - (all[k]?.createdAt || 0) < JOB_MAX_AGE_MS))
  );
  if (stale.length) await chrome.storage.local.remove(stale);
}

function flagTabError(tabId, message) {
  chrome.action.setBadgeBackgroundColor({ color: "#b91c1c", tabId }).catch(() => {});
  chrome.action.setBadgeText({ text: "!", tabId }).catch(() => {});
  chrome.action.setTitle({ title: `阿吉編譯 — ${message}`, tabId }).catch(() => {});
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  compileTab(tab, info.selectionText || "");
});

// 快捷鍵（預設 Alt+J，可在 brave://extensions/shortcuts 或 Firefox 的 about:addons →「管理擴充套件快捷鍵」修改）：與右鍵選單走同一條路徑
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "compile-article") return;
  if (!tab?.id) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) compileTab(tab, "");
});

async function compileTab(tab, selectionText) {
  chrome.action.setBadgeText({ text: "", tabId: tab.id }).catch(() => {});

  try {
    // 先注入 Mozilla Readability（掛在 isolated world 的全域），再執行擷取函式
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["lib/Readability.js"]
    });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractAndPrepareArticle,
      args: [selectionText]
    });

    const extracted = results?.[0]?.result;
    if (extracted && extracted.ok) {
      cleanupStaleJobs().catch(() => {});
      const jobId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      await chrome.storage.local.set({
        [JOB_PREFIX + jobId]: {
          articleTitle: extracted.articleTitle,
          siteName: extracted.siteName,
          sourceUrl: extracted.sourceUrl || tab.url || "",
          articleText: extracted.articleText,
          createdAt: Date.now()
        }
      });
      chrome.tabs.create({ url: chrome.runtime.getURL(`viewer.html?job=${jobId}`) });
    }
  } catch (err) {
    console.error("阿吉編譯：無法擷取此頁面：", err);
    // chrome:// 頁面、內建 PDF 檢視器、線上應用程式商店等頁面無法注入腳本
    flagTabError(tab.id, "此頁面無法擷取內容（瀏覽器內建頁面或 PDF），請改用一般網頁。");
  }
}

async function extractAndPrepareArticle(selectedTextFromMenu) {
  function showToast(msg, isError = false) {
    const existing = document.getElementById("a-ji-compile-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "a-ji-compile-toast";
    toast.textContent = msg;
    Object.assign(toast.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      zIndex: "2147483647",
      backgroundColor: isError ? "#b91c1c" : "#1e293b",
      color: "#ffffff",
      padding: "14px 20px",
      borderRadius: "6px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
      fontFamily: '"Noto Sans TC", "Microsoft JhengHei", sans-serif',
      fontSize: "15px",
      fontWeight: "600",
      lineHeight: "1.5",
      maxWidth: "420px",
      transition: "opacity 0.3s ease"
    });
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 350);
    }, 5500);
  }

  function getArticleTitle() {
    // 依優先順序逐一查找，避免網站 Logo 的 <h1> 搶先被選中
    for (const sel of ["article h1", "main h1", "h1"]) {
      const h1 = document.querySelector(sel);
      if (h1 && h1.innerText && h1.innerText.trim().length > 2) {
        return h1.innerText.trim();
      }
    }
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
    if (ogTitle && ogTitle.trim().length > 2) {
      return ogTitle.split(/\s*[|\-–—]\s*/)[0].trim();
    }
    return (document.title || "Article").split(/\s*[|\-–—]\s*/)[0].trim();
  }

  function getSiteName() {
    const host = (location.hostname || "").toLowerCase();
    if (host.includes("economist.com")) return "TheEconomist";
    const ogSite = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content");
    if (ogSite && ogSite.trim()) {
      return ogSite.trim().replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, "");
    }
    const domainParts = host.replace(/^www\./, "").split(".");
    if (domainParts.length > 0 && domainParts[0]) {
      return domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);
    }
    return "WebArticle";
  }

  const blockSelector = "p, h2, h3, h4, li, blockquote";

  // 未經渲染的節點 innerText 會失去段落換行，因此逐一擷取區塊元素並以空行分隔
  // 小標題前面加「## 」、清單項目加「- 」，講義端據此排版（送給模型前會拿掉）
  function blocksToText(root) {
    const blocks = [];
    root.querySelectorAll(blockSelector).forEach(el => {
      if (el.parentElement?.closest(blockSelector)) return; // 避免巢狀區塊重複擷取
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) return;
      const tag = el.tagName.toLowerCase();
      blocks.push(/^h[2-4]$/.test(tag) ? `## ${text}` : tag === "li" ? `- ${text}` : text);
    });
    return blocks.join("\n\n");
  }

  // 有些網站（例如 Ars Technica）把正文拆成好幾個同樣 class 的區塊，中間夾廣告，
  // Readability 只會拿到第一塊。從它抽到的第一段找回所在區塊，把同 class 的區塊依序接起來。
  function mergeSplitBody(readableText) {
    const firstPara = readableText.split("\n\n").find(p => p.length > 80);
    if (!firstPara) return "";
    const probe = firstPara.slice(0, 60);
    const para = [...document.querySelectorAll("p")]
      .find(el => (el.textContent || "").replace(/\s+/g, " ").includes(probe));
    const block = para?.parentElement;
    if (!block || !block.classList.length) return "";
    const sel = block.tagName.toLowerCase() + [...block.classList].map(c => `.${CSS.escape(c)}`).join("");
    const blocks = [...document.querySelectorAll(sel)].filter(el => !el.parentElement?.closest(sel));
    if (blocks.length < 2) return "";
    return blocks.map(el => {
      const clone = el.cloneNode(true);
      clone.querySelectorAll("script, style, aside, figure, button").forEach(n => n.remove());
      return blocksToText(clone);
    }).filter(Boolean).join("\n\n");
  }

  // Mozilla Readability 抽正文；失敗或抽得太短回傳空字串，交給舊的選擇器做法
  function extractWithReadability() {
    if (typeof Readability !== "function") return "";
    try {
      const docClone = document.cloneNode(true);
      // 先剝媒體嵌入：Readability 會保留影片 iframe，可能讓影片區塊被誤判成正文
      docClone.querySelectorAll("iframe, video, audio, object, embed, lite-youtube").forEach(el => el.remove());
      const parsed = new Readability(docClone, { charThreshold: 200 }).parse();
      if (!parsed?.content) return "";
      // 用 DOMParser 解析成惰性文件，避免 innerHTML 觸發 <img onerror> 之類的屬性
      const parsedDoc = new DOMParser().parseFromString(parsed.content, "text/html");
      const joined = blocksToText(parsedDoc.body);
      if (joined.length > 200) {
        const merged = mergeSplitBody(joined);
        return merged.length > joined.length * 1.1 ? merged : joined;
      }
      const plain = (parsed.textContent || "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
      return plain.length > 200 ? plain : "";
    } catch (_) {
      return "";
    }
  }

  function extractCleanBody() {
    const winSelection = window.getSelection()?.toString()?.trim();
    if (winSelection && winSelection.length > 20) {
      return winSelection;
    }
    if (selectedTextFromMenu && selectedTextFromMenu.trim().length > 20) {
      return selectedTextFromMenu.trim();
    }

    const readable = extractWithReadability();
    if (readable) return readable;

    const rootCandidate =
      document.querySelector("article") ||
      document.querySelector('[role="main"]') ||
      document.querySelector("main") ||
      document.body;

    const clone = rootCandidate.cloneNode(true);
    const noiseSelectors = [
      "nav",
      "footer",
      "aside",
      "script",
      "style",
      "noscript",
      "iframe",
      "svg",
      "button",
      '[aria-hidden="true"]',
      '[data-testid^="ad-"]',
      '[data-testid*="-ad"]',
      '[class*="newsletter"]',
      '[class*="podcast"]',
      '[class*="related"]',
      '[class*="share"]'
    ];
    clone.querySelectorAll(noiseSelectors.join(",")).forEach(el => el.remove());

    const joined = blocksToText(clone);
    if (joined.length > 200) return joined;

    return (clone.textContent || "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
  }

  const articleTitle = getArticleTitle();
  const siteName = getSiteName();
  const bodyText = extractCleanBody();

  if (!bodyText || bodyText.length < 20) {
    showToast("❌ 無法擷取文章內容，請先反白選取文字再試一次。", true);
    return { ok: false };
  }

  const fullArticleText = `${articleTitle}\n\n${bodyText}`;

  showToast("✨ 阿吉編譯：正在開啟雙語編譯分頁...");
  return {
    ok: true,
    articleTitle,
    siteName,
    sourceUrl: location.href,
    articleText: fullArticleText
  };
}
