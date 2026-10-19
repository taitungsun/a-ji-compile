// popup 與 viewer 共用：模型清單、單價表、費用估算。

const DEFAULT_MODEL = "gemini-3.8-flash";

// 已停用的舊版預設，以及 2.3.0 移除 OpenAI / Claude 前留下的非 Gemini 模型：一律改用預設值
const LEGACY_MODELS = ["gemini-2.5-flash"];
const isUsableModel = m => !!m && m.startsWith("gemini-") && !LEGACY_MODELS.includes(m);

// popup 下拉選單的選項（另有「自訂」可填其他模型名稱）
const MODEL_OPTIONS = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash（推薦，品質較好）" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite（省錢）" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite（最便宜）" }
];

// 官方單價（美元／每 100 萬 token，文字輸入），來源 https://ai.google.dev/gemini-api/docs/pricing
// 同一模型有多段價格時依 from（含當天）由舊到新排列，估算時取文章編譯當天適用的那段。
const MODEL_PRICING = {
  "gemini-3.8-flash": [
    { from: "2000-01-01", input: 0.75, output: 3.75 },
    { from: "2027-01-01", input: 1.50, output: 7.50 }
  ],
  "gemini-3.6-flash": [
    { from: "2000-01-01", input: 0.75, output: 3.75 },
    { from: "2027-01-01", input: 1.50, output: 7.50 }
  ],
  "gemini-3.5-flash-lite": [{ from: "2000-01-01", input: 0.30, output: 2.50 }],
  "gemini-3.1-flash-lite": [{ from: "2000-01-01", input: 0.25, output: 1.50 }]
};

// 換算新台幣用的固定匯率，只用來顯示「約 NT$」
const USD_TO_TWD = 32;

function ymd(date) {
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// 取某天適用的單價；單價表沒有的模型回傳 null
function pricingFor(model, date = new Date()) {
  const tiers = MODEL_PRICING[model];
  if (!tiers) return null;
  const day = ymd(date);
  let current = null;
  for (const t of tiers) if (t.from <= day) current = t;
  return current;
}

// 下一段價格（例如即將漲價），沒有則回傳 null
function nextPricingFor(model, date = new Date()) {
  const day = ymd(date);
  return (MODEL_PRICING[model] || []).find(t => t.from > day) || null;
}

// usage = { input, output, thoughts }（token 數）。思考 token 與輸出同價計費。
// 單價表沒有的模型回傳 null（只顯示 token 數，不報金額）
function estimateCostUsd(usage, model, date = new Date()) {
  const p = pricingFor(model, date);
  if (!p) return null;
  return (usage.input * p.input + (usage.output + usage.thoughts) * p.output) / 1e6;
}
