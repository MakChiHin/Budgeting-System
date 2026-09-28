const API = "";
const $ = (s, r = document) => r.querySelector(s);
const chatLog = $("#chatLog");
const bookList = $("#bookList");
const input = $("#input");
const CATS = ["Food & Dining", "Transport", "Shopping", "Bills & Utilities", "Entertainment", "Others"];
const PAYS = ["Octopus", "PayMe", "FPS", "AlipayHK", "WeChat Pay", "Credit Card", "Cash", "Unknown"];
function loadLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function saveLocal(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
let txns = loadLocal("kotau_txns", []);
let budget = loadLocal("kotau_budget", 5000);
let history = [];
function addMsg(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}
function addCard(ext) {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `
    <h3>確認入帳</h3>
    <div class="grid">
      <label>金額 <input name="amount" type="number" step="0.1" value="${ext.amount ?? ""}"></label>
      <label>貨幣 <input name="currency" value="${ext.currency || "HKD"}"></label>
      <label>商戶 <input name="merchant" value="${ext.merchant || ""}"></label>
      <label>類別 <select name="category">${CATS.map(c => `<option ${c === ext.category ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      <label>支付 <select name="payment_method">${PAYS.map(c => `<option ${c === (ext.payment_method || "Unknown") ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      <label>確定程度 <select name="amount_certainty">${["exact", "approximate", "unknown"].map(c => `<option value="${c}" ${c === ext.amount_certainty ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      <label>原價 <input name="original_amount" type="number" step="0.1" value="${ext.original_amount ?? ext.amount ?? ""}"></label>
      <label>折扣 <input name="discount_amount" type="number" step="0.1" value="${ext.discount_amount ?? 0}"></label>
      <label>類型 <select name="transaction_type">${["purchase", "refund", "transfer"].map(c => `<option ${c === (ext.transaction_type || "purchase") ? "selected" : ""}>${c}</option>`).join("")}</select></label>
    </div>
    <div class="actions"><button class="no" type="button">唔入</button><button class="ok" type="button">入帳</button></div>`;
  chatLog.appendChild(wrap);
  chatLog.scrollTop = chatLog.scrollHeight;
  wrap.querySelector(".no").onclick = () => wrap.remove();
  wrap.querySelector(".ok").onclick = async () => {
    const data = Object.fromEntries([...wrap.querySelectorAll("input,select")].map(el => [el.name, el.value]));
    data.amount = data.amount === "" ? null : Number(data.amount);
    data.original_amount = data.original_amount === "" ? data.amount : Number(data.original_amount);
    data.discount_amount = Number(data.discount_amount || 0);
    data.merchant = data.merchant || null;
    data.raw_text = ext.raw_text || "";
    await saveTxn(data);
    wrap.remove();
    addMsg("bot", "入咗帳。右邊帳本會即時更新。");
  };
}
async function saveTxn(data) {
  data.id = data.id || crypto.randomUUID();
  data.created_at = new Date().toISOString();
  txns.unshift(data);
  saveLocal("kotau_txns", txns);
  renderBook();
  renderBudget();
  try {
    await fetch(`${API}/api/transactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  } catch {}
}
function renderBook() {
  const countEl = document.getElementById("bookCount");
  if (countEl) countEl.textContent = txns.length ? `${txns.length} 筆記錄` : "未有記錄";
  if (!txns.length) {
    bookList.innerHTML = `<p class="hint">未有記錄。在左邊講一句就得。</p>`;
    return;
  }
  bookList.innerHTML = txns.map(t => `
    <div class="row">
      <div>
        <b>${t.merchant || t.category}</b>
        <small>${t.category} · ${t.payment_method || "—"} · ${t.amount_certainty || ""}</small>
        <small>${(t.raw_text || "").slice(0, 42)}</small>
      </div>
      <div class="amt">${t.currency || "HKD"} ${t.amount ?? "—"}</div>
    </div>`).join("");
}
function renderBudget() {
  $("#budgetInput").value = budget;
  const spent = txns.filter(t => t.transaction_type !== "refund").reduce((s, t) => s + Number(t.amount || 0), 0);
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const bar = $("#budgetBar");
  bar.classList.toggle("over", spent > budget);
  bar.firstElementChild.style.width = `${pct}%`;
  $("#budgetText").textContent = `已用 HKD ${spent.toFixed(1)} / ${budget}（${pct.toFixed(0)}%）`;
  const stats = document.getElementById("budgetStats");
  if (stats) {
    const byCat = {};
    txns.forEach((t) => {
      if (t.transaction_type === "refund") return;
      byCat[t.category || "Others"] = (byCat[t.category || "Others"] || 0) + Number(t.amount || 0);
    });
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 4);
    stats.innerHTML = top.length ? top.map(([k, v]) => `<div class="stat"><em>${k}</em><b>HKD ${v.toFixed(1)}</b></div>`).join("") : "";
  }
}
async function send(text) {
  text = (text || "").trim();
  if (!text) return;
  addMsg("user", text);
  input.value = "";
  history.push({ role: "user", content: text });
  let payload = null;
  try {
    const r = await fetch(`${API}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, history }) });
    if (r.ok) payload = await r.json();
  } catch {}
  if (!payload) {
    const ext = localExtract(text);
    const expense = ext.amount != null || /蚊|界|食|搭|PayMe|FPS|八達通/.test(text);
    payload = {
      reply: expense ? (ext.amount != null ? `我估呢筆係 ${ext.currency} ${ext.amount}（${ext.amount_certainty}）。核對下面張卡先入帳。` : "呢句似記帳，但未見到金額。") : "可以問預算或記帳。電腦版右邊會同時顯示帳本同預算。",
      extraction: expense ? ext : null,
    };
  }
  addMsg("bot", payload.reply);
  history.push({ role: "assistant", content: payload.reply });
  if (payload.extraction) addCard(payload.extraction);
}
function localExtract(text) {
  const out = { raw_text: text, amount: null, currency: "HKD", merchant: null, category: "Others", payment_method: null, original_amount: null, discount_amount: 0, transaction_type: "purchase", amount_certainty: "unknown", extractor: "rule_based_v0_js" };
  const approx = /幾|左右|大概|約/.test(text);
  let m = text.match(/(\d+)\s*蚊\s*(\d)/);
  if (m) { out.amount = +m[1] + +m[2] / 10; out.amount_certainty = "exact"; }
  else if ((m = text.match(/(\d+(?:\.\d+)?)/))) {
    out.amount = +m[1];
    out.amount_certainty = /幾/.test(text) ? "approximate" : (approx ? "approximate" : "exact");
    if (/幾/.test(text) && text.includes(m[1] + "幾")) out.amount = +m[1] + 5;
  } else if (/廿四蚊/.test(text)) { out.amount = 24; out.amount_certainty = "exact"; }
  else if (/三草/.test(text)) { out.amount = 30; out.amount_certainty = "exact"; }
  const mer = [[/老麥|麥當勞/i, "McDonald's (老麥)", "Food & Dining"], [/黨鐵|港鐵|MTR/i, "MTR", "Transport"], [/紅\s*van/i, "紅Van", "Transport"], [/茶記|茶餐廳/, "茶餐廳", "Food & Dining"]];
  for (const [re, name, cat] of mer) if (re.test(text)) { out.merchant = name; out.category = cat; break; }
  if (/PayMe/i.test(text)) out.payment_method = "PayMe";
  else if (/FPS|轉數快/.test(text)) out.payment_method = "FPS";
  else if (/八達通|嘟/.test(text)) out.payment_method = "Octopus";
  else if (/界咗|現金/.test(text)) out.payment_method = "Cash";
  if (/轉|過咗|夾錢/.test(text)) out.transaction_type = "transfer";
  out.original_amount = out.amount;
  return out;
}
document.querySelectorAll(".tabs button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    $("#" + btn.dataset.tab).classList.add("active");
  };
});
$("#composer").onsubmit = (e) => { e.preventDefault(); send(input.value); };
$("#chips").onclick = (e) => { const b = e.target.closest("button"); if (b) send(b.dataset.q); };
$("#budgetInput").onchange = () => {
  budget = Number($("#budgetInput").value || 0);
  saveLocal("kotau_budget", budget);
  renderBudget();
};
$("#micBtn").onclick = () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { addMsg("bot", "呢個瀏覽器未支援語音輸入。用 Chrome 試下。"); return; }
  const rec = new SR();
  rec.lang = "zh-HK";
  rec.onresult = (ev) => { input.value = ev.results[0][0].transcript; send(input.value); };
  rec.onerror = () => addMsg("bot", "聽唔到。試下再撴一次。");
  rec.start();
};
addMsg("bot", "你好，我係口頭帳助手。電腦會一齊看到傾偉、預算同帳本；手機就用下面分頁。");
renderBook();
renderBudget();
fetch(`${API}/api/health`).then(r => r.json()).then(h => {
  $("#modelBadge").textContent = `NER: ${h.ner} · Chat: ${h.chat}`;
}).catch(() => { $("#modelBadge").textContent = "離線 · 本機規則"; });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
