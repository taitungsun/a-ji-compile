// DEFAULT_MODEL、MODEL_OPTIONS、單價表等定義在 models.js
const CUSTOM = "custom";

document.querySelector(".header-ver").textContent = `v${chrome.runtime.getManifest().version}`;

const apiKeyEl = document.getElementById("apiKey");
const modelSelectEl = document.getElementById("modelSelect");
const modelEl = document.getElementById("model");
const priceHintEl = document.getElementById("priceHint");
const saveFolderEl = document.getElementById("saveFolder");
const autoDownloadEl = document.getElementById("autoDownload");
const btnTest = document.getElementById("btnTest");
const btnSave = document.getElementById("btnSave");
const toggleKeyBtn = document.getElementById("toggleKey");
const statusMsg = document.getElementById("statusMsg");

toggleKeyBtn.addEventListener("click", () => {
  apiKeyEl.type = apiKeyEl.type === "password" ? "text" : "password";
});

function showStatus(text, color = "#60a5fa") {
  statusMsg.textContent = text;
  statusMsg.style.color = color;
}

for (const opt of [...MODEL_OPTIONS, { id: CUSTOM, label: "自訂模型名稱…" }]) {
  modelSelectEl.add(new Option(opt.label, opt.id));
}

function formatPrice(p) {
  return `輸入 US$${p.input.toFixed(2)}／輸出 US$${p.output.toFixed(2)}`;
}

function updateModelUI() {
  const custom = modelSelectEl.value === CUSTOM;
  modelEl.style.display = custom ? "block" : "none";
  const model = custom ? modelEl.value.trim().replace(/^models\//, "") : modelSelectEl.value;
  const p = pricingFor(model);
  if (!p) {
    priceHintEl.textContent = model ? "此模型不在單價表中，編譯後只顯示 token 用量。" : "";
    return;
  }
  const next = nextPricingFor(model);
  priceHintEl.textContent = `付費價格（每 100 萬 token）：${formatPrice(p)}` +
    (next ? `；${next.from.slice(0, 4)} 年起${formatPrice(next)}` : "") +
    "。免費額度內不收費。";
}

function readModel() {
  if (modelSelectEl.value !== CUSTOM) return modelSelectEl.value;
  const model = (modelEl.value.trim() || DEFAULT_MODEL).replace(/^models\//, "");
  modelEl.value = model;
  return model;
}

modelSelectEl.addEventListener("change", updateModelUI);
modelEl.addEventListener("input", updateModelUI);

chrome.storage.local.get(
  {
    apiKey: "",
    model: DEFAULT_MODEL,
    saveFolder: "阿吉編譯",
    autoDownload: true
  },
  (cfg) => {
    apiKeyEl.value = cfg.apiKey;
    const model = isUsableModel(cfg.model) ? cfg.model : DEFAULT_MODEL;
    if (MODEL_OPTIONS.some(o => o.id === model)) {
      modelSelectEl.value = model;
    } else {
      modelSelectEl.value = CUSTOM;
      modelEl.value = model;
    }
    updateModelUI();
    saveFolderEl.value = (cfg.saveFolder === undefined || cfg.saveFolder === "阿吉雙語編譯") ? "阿吉編譯" : cfg.saveFolder;
    autoDownloadEl.checked = cfg.autoDownload !== false;
  }
);

btnSave.addEventListener("click", () => {
  const apiKey = apiKeyEl.value.trim();
  if (!apiKey) {
    showStatus("⚠️ 請先輸入 Gemini API Key", "#f87171");
    return;
  }
  const model = readModel();
  const saveFolder = saveFolderEl.value.trim().replace(/[\\/:*?"<>|]+/g, "") || "阿吉編譯";
  saveFolderEl.value = saveFolder;

  chrome.storage.local.set(
    {
      apiKey,
      model,
      saveFolder,
      autoDownload: autoDownloadEl.checked
    },
    () => {
      // 2.3.0 前的模式與供應商設定已不再使用
      chrome.storage.local.remove(["mode", "provider"]);
      showStatus(`✅ 已儲存！檔案將自動存至「下載\\${saveFolder}」`, "#4ade80");
    }
  );
});

btnTest.addEventListener("click", async () => {
  const apiKey = apiKeyEl.value.trim();
  const model = readModel();
  if (!apiKey) {
    showStatus("⚠️ 請先輸入 API Key 再測試連線", "#f87171");
    return;
  }

  showStatus("⏳ 正在測試 API 連線...", "#93c5fd");
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Reply with OK" }] }]
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }
    showStatus("🎉 API 連線測試成功！請點選「儲存設定」", "#4ade80");
  } catch (e) {
    showStatus(`❌ 測試失敗：${e.message}`, "#f87171");
  }
});
