const API = "";
const $ = (s, r = document) => r.querySelector(s);
const chatLog = $("#chatLog");
const bookList = $("#bookList");
const input = $("#input");

const CATS = ["Food & Dining", "Transport", "Shopping", "Bills & Utilities", "Entertainment", "Others"];
const CAT_LABEL = {
  "Food & Dining": "飲食",
  "Transport": "交通",
  "Shopping": "購物",
  "Bills & Utilities": "賬單",
  "Entertainment": "娛樂",
  "Others": "其他",
};
const CAT_COLOR = {
  "Food & Dining": "#e76f51",
  "Transport": "#2a9d8f",
  "Shopping": "#e9c46a",
  "Bills & Utilities": "#264653",
  "Entertainment": "#f4a261",
  "Others": "#6b7c83",
};
const PAYS = ["Octopus", "PayMe", "FPS", "AlipayHK", "WeChat Pay", "Credit Card", "Cash", "Unknown"];
const CHANNELS = ["港鐵", "巴士", "小巴", "的士", "紅Van", "未設定"];

const DEFAULT_PREFS = { transport: "港鐵", transport_purpose: "搭車", payment: "Octopus" };

function loadLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function saveLocal(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

let txns = loadLocal("kotau_txns", []);
let budget = loadLocal("kotau_budget", 5000);
let prefs = { ...DEFAULT_PREFS, ...loadLocal("kotau_prefs", {}) };
let chatHistory = [];
let searchTerm = "";
let selectedMonth = ""; // "" = current, else "YYYY-MM"

function addMsg(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function applyPrefs(ext) {
  const notes = [];
  const ride = /搭車|搭巴士|返工車|交通/.test(ext.raw_text || "") || ext.category === "Transport";
  if (ride && !ext.channel && prefs.transport && prefs.transport !== "未設定") {
    ext.channel = prefs.transport;
    ext.category = "Transport";
    if (!ext.merchant) ext.merchant = prefs.transport;
    notes.push("交通工具用喜好預填");
  }
  if (ride && !ext.purpose) {
    ext.purpose = prefs.transport_purpose || `搭${ext.channel || "車"}`;
    notes.push("用途用喜好預填");
  }
  if (!ext.payment_method && prefs.payment && prefs.payment !== "Unknown") {
    ext.payment_method = prefs.payment;
    notes.push("支付用喜好預填");
  }
  ext.pref_notes = notes;
  return ext;
}

function addCard(ext) {
  ext = applyPrefs({ ...ext });
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `
    <h3>確認入帳</h3>
    <p class="heard">聽到：${(ext.raw_text || "（冇原文）").replace(/</g, "")}</p>
    ${ext.pref_notes?.length ? `<p class="pref-note">${ext.pref_notes.join(" · ")}，可改完先入。</p>` : ""}
    <div class="grid">
      <label>金額 <input name="amount" type="number" step="0.1" value="${ext.amount ?? ""}"></label>
      <label>貨幣 <input name="currency" value="${ext.currency || "HKD"}"></label>
      <label>商戶 <input name="merchant" value="${ext.merchant || ""}"></label>
      <label>轉界邊個 <input name="counterparty" value="${ext.counterparty || ""}" placeholder="阿明"></label>
      <label>做咩用 <input name="purpose" value="${ext.purpose || ""}" placeholder="搭車返工"></label>
      <label>交通／渠道
        <select name="channel">${CHANNELS.map(c => `<option ${c === (ext.channel || "未設定") ? "selected" : ""}>${c}</option>`).join("")}</select>
      </label>
      <label>類別
        <select name="category">${CATS.map(c => `<option ${c === ext.category ? "selected" : ""}>${CAT_LABEL[c] || c}</option>`).join("")}</select>
      </label>
      <label>支付
        <select name="payment_method">${PAYS.map(c => `<option ${c === (ext.payment_method || "Unknown") ? "selected" : ""}>${c}</option>`).join("")}</select>
      </label>
      <label>類型
        <select name="transaction_type">
          ${["purchase", "refund", "transfer"].map(c => `<option ${c === (ext.transaction_type || "purchase") ? "selected" : ""}>${c}</option>`).join("")}
        </select>
      </label>
    </div>
    <div class="actions">
      <button class="no" type="button">唔入</button>
      <button class="ok" type="button">入帳</button>
    </div>
  `;
  chatLog.appendChild(wrap);
  chatLog.scrollTop = chatLog.scrollHeight;
  wrap.querySelector(".no").onclick = () => wrap.remove();
  wrap.querySelector(".ok").onclick = async () => {
    const data = Object.fromEntries([...wrap.querySelectorAll("input,select")].map(el => [el.name, el.value]));
    const catEntry = Object.entries(CAT_LABEL).find(([, label]) => label === data.category);
    data.category = catEntry ? catEntry[0] : data.category;
    data.amount = data.amount === "" ? null : Number(data.amount);
    data.original_amount = data.amount;
    data.discount_amount = 0;
    data.merchant = data.merchant || null;
    data.counterparty = data.counterparty || null;
    data.purpose = data.purpose || null;
    data.channel = data.channel === "未設定" ? null : data.channel;
    data.raw_text = ext.raw_text || "";
    data.amount_certainty = ext.amount_certainty || "exact";
    await saveTxn(data);
    wrap.remove();
    addMsg("bot", "入咗帳。去下面「歷史」睇邊個、做咩用。");
  };
}

async function saveTxn(data) {
  data.id = data.id || crypto.randomUUID();
  data.created_at = new Date().toISOString();
  txns.unshift(data);
  saveLocal("kotau_txns", txns);
  renderHistory();
  renderChart();
  try {
    await fetch(`${API}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch { /* offline ok */ }
}

async function updateTxn(id, data) {
  const idx = txns.findIndex(t => t.id === id);
  if (idx === -1) return;
  data.id = id;
  data.created_at = txns[idx].created_at;
  txns[idx] = { ...txns[idx], ...data };
  saveLocal("kotau_txns", txns);
  renderHistory();
  renderChart();
  addMsg("bot", "已更新記錄。");
  // backend currently has no PUT; local only for early version
}

async function deleteTxn(id) {
  if (!confirm("刪除呢筆記錄？")) return;
  txns = txns.filter(t => t.id !== id);
  saveLocal("kotau_txns", txns);
  renderHistory();
  renderChart();
  try {
    await fetch(`${API}/api/transactions/${id}`, { method: "DELETE" });
  } catch { /* offline ok */ }
}

function titleOf(t) {
  if (t.transaction_type === "transfer" && t.counterparty) return `轉界${t.counterparty}`;
  return t.counterparty || t.merchant || t.purpose || CAT_LABEL[t.category] || "未命名";
}

function filteredTxns() {
  if (!searchTerm.trim()) return txns;
  const q = searchTerm.toLowerCase();
  return txns.filter(t => {
    const hay = [
      t.amount, t.merchant, t.counterparty, t.purpose, t.channel,
      CAT_LABEL[t.category] || t.category, t.payment_method, t.raw_text, t.transaction_type
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function renderHistory() {
  const list = filteredTxns();
  const countEl = $("#bookCount");
  if (countEl) {
    const base = txns.length ? `${txns.length} 筆` : "未有記錄";
    countEl.textContent = searchTerm ? `${list.length} / ${base} 符合搜尋` : `${base}。入帳之後先會出現。`;
  }
  if (!list.length) {
    bookList.innerHTML = `<p class="hint">${txns.length ? "冇符合搜尋嘅記錄。" : "未有記錄。講「今日搭車用咗 30 蚊」再擊入帳。"}</p>`;
    return;
  }
  bookList.innerHTML = list.map(t => {
    const bits = [t.purpose, t.channel, t.payment_method].filter(Boolean);
    return `
      <div class="row" data-id="${t.id}">
        <div>
          <b>${titleOf(t)}</b>
          <small>${bits.join(" · ") || CAT_LABEL[t.category] || ""}</small>
          <small>${(t.raw_text || "").slice(0, 48)}</small>
        </div>
        <div class="amt">${t.currency || "HKD"} ${t.amount ?? "—"}</div>
        <button type="button" class="edit" data-edit="${t.id}" title="修改">✎</button>
        <button type="button" class="del" data-del="${t.id}" title="刪除">✕</button>
      </div>`;
  }).join("");
  bookList.querySelectorAll(".del").forEach(b => {
    b.onclick = () => deleteTxn(b.dataset.del);
  });
  bookList.querySelectorAll(".edit").forEach(b => {
    b.onclick = () => openEditSheet(b.dataset.edit);
  });
}

function getAvailableMonths() {
  const set = new Set();
  txns.forEach(t => {
    if (!t.created_at) return;
    const d = new Date(t.created_at);
    if (isNaN(d)) return;
    set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  });
  const now = new Date();
  set.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  return Array.from(set).sort().reverse();
}

function monthTxns(ym) {
  let y, m;
  if (!ym) {
    const now = new Date();
    y = now.getFullYear();
    m = now.getMonth();
  } else {
    [y, m] = ym.split("-").map(Number);
    m -= 1;
  }
  return txns.filter(t => {
    const d = new Date(t.created_at || Date.now());
    return d.getFullYear() === y && d.getMonth() === m && t.transaction_type !== "refund";
  });
}

function renderChart() {
  const months = getAvailableMonths();
  const sel = $("#monthSelect");
  if (sel) {
    const cur = selectedMonth || months[0] || "";
    sel.innerHTML = months.map(ym => `<option value="${ym}" ${ym === cur ? "selected" : ""}>${ym.replace("-", "年")}月</option>`).join("");
    if (!selectedMonth) selectedMonth = cur;
  }
  const month = monthTxns(selectedMonth);
  const spent = month.reduce((s, t) => s + Number(t.amount || 0), 0);
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  $("#budgetInput").value = budget;
  const bar = $("#budgetBar");
  bar.classList.toggle("over", spent > budget);
  bar.firstElementChild.style.width = `${pct}%`;
  $("#budgetText").textContent = `已用 HKD ${spent.toFixed(1)} / ${budget}（${pct.toFixed(0)}%）`;
  const label = $("#chartMonth");
  if (label) {
    const [y, m] = (selectedMonth || "").split("-");
    label.textContent = selectedMonth ? `${y}年${Number(m)}月 · ${month.length} 筆` : "本月";
  }
  const byCat = {};
  CATS.forEach(c => { byCat[c] = 0; });
  month.forEach(t => { byCat[t.category || "Others"] = (byCat[t.category || "Others"] || 0) + Number(t.amount || 0); });
  const max = Math.max(1, ...Object.values(byCat));
  $("#catBars").innerHTML = CATS.map(c => {
    const v = byCat[c] || 0;
    const w = Math.round((v / max) * 100);
    const col = CAT_COLOR[c] || "#2a9d8f";
    return `<div class="hbar"><span>${CAT_LABEL[c]}</span><div class="track"><span style="width:${w}%;background:${col}"></span></div><b>${v.toFixed(0)}</b></div>`;
  }).join("");
  // simple legend
  const legend = $("#legend");
  if (legend) {
    legend.innerHTML = CATS.map(c => `<span class="leg"><i style="background:${CAT_COLOR[c]}"></i>${CAT_LABEL[c]}</span>`).join("");
  }
}

function openEditSheet(id) {
  const t = txns.find(x => x.id === id);
  if (!t) return;
  const sheet = $("#editSheet");
  if (!sheet) return;
  sheet.dataset.id = id;
  sheet.querySelector("[name=amount]").value = t.amount ?? "";
  sheet.querySelector("[name=currency]").value = t.currency || "HKD";
  sheet.querySelector("[name=merchant]").value = t.merchant || "";
  sheet.querySelector("[name=counterparty]").value = t.counterparty || "";
  sheet.querySelector("[name=purpose]").value = t.purpose || "";
  sheet.querySelector("[name=channel]").value = t.channel || "未設定";
  const catSel = sheet.querySelector("[name=category]");
  catSel.innerHTML = CATS.map(c => `<option value="${c}" ${c === t.category ? "selected" : ""}>${CAT_LABEL[c]}</option>`).join("");
  sheet.querySelector("[name=payment_method]").value = t.payment_method || "Unknown";
  sheet.querySelector("[name=transaction_type]").value = t.transaction_type || "purchase";
  $("#editBack").hidden = false;
}

async function send(text) {
  text = (text || "").trim();
  if (!text) return;
  addMsg("user", text);
  input.value = "";
  chatHistory.push({ role: "user", content: text });
  let payload = null;
  try {
    const r = await fetch(`${API}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, history: chatHistory }),
    });
    if (r.ok) payload = await r.json();
  } catch { /* local */ }
  if (!payload) {
    const ext = localExtract(text);
    const expense = ext.amount != null || /蚊|界|食|搭|PayMe|FPS|八達通/.test(text);
    payload = {
      reply: expense
        ? (ext.amount != null
          ? `我估呢筆係 ${ext.currency} ${ext.amount}。核對用途同轉帳對象，哒先入帳。`
          : "呢句似記帳，但未見到金額。")
        : "可以講開支，或者去「圖表」睇本月分佈。喜好嘅右上角齒輪。",
      extraction: expense ? ext : null,
    };
  }
  if (payload.extraction) payload.extraction = applyPrefs(payload.extraction);
  addMsg("bot", payload.reply);
  chatHistory.push({ role: "assistant", content: payload.reply });
  if (payload.extraction) addCard(payload.extraction);
}

function localExtract(text) {
  const out = {
    raw_text: text, amount: null, currency: "HKD", merchant: null,
    category: "Others", payment_method: null, original_amount: null,
    discount_amount: 0, transaction_type: "purchase", amount_certainty: "unknown",
    counterparty: null, purpose: null, channel: null,
    extractor: "rule_based_v0_js",
  };
  const approx = /幾|左右|大概|約/.test(text);
  let m = text.match(/(\d+)\s*蚊\s*(\d)/);
  if (m) { out.amount = +m[1] + +m[2] / 10; out.amount_certainty = "exact"; }
  else if ((m = text.match(/(\d+(?:\.\d+)?)/))) {
    out.amount = +m[1];
    out.amount_certainty = /幾/.test(text) ? "approximate" : (approx ? "approximate" : "exact");
    if (/幾/.test(text) && text.includes(m[1] + "幾")) out.amount = +m[1] + 5;
  } else if (/廿四蚊/.test(text)) { out.amount = 24; out.amount_certainty = "exact"; }
  else if (/三草/.test(text)) { out.amount = 30; out.amount_certainty = "exact"; }

  const mer = [
    [/老麥|麥當勞/i, "McDonald's (老麥)", "Food & Dining"],
    [/黨鐵|港鐵|MTR/i, "港鐵", "Transport"],
    [/紅\s*van/i, "紅Van", "Transport"],
    [/巴士|九巴|城巴/, "巴士", "Transport"],
    [/小巴/, "小巴", "Transport"],
    [/的士|Taxi/i, "的士", "Transport"],
    [/茶記|茶餐廳/, "茶餐廳", "Food & Dining"],
  ];
  for (const [re, name, cat] of mer) if (re.test(text)) {
    out.merchant = name; out.category = cat;
    if (cat === "Transport") out.channel = name;
    break;
  }
  if (/搭車/.test(text)) out.category = "Transport";
  if (/PayMe/i.test(text)) out.payment_method = "PayMe";
  else if (/FPS|轉數快/.test(text)) out.payment_method = "FPS";
  else if (/八達通|嘟/.test(text)) out.payment_method = "Octopus";
  else if (/界咗|現金/.test(text)) out.payment_method = "Cash";
  if (/轉|過咗|夾錢/.test(text)) out.transaction_type = "transfer";
  const who = text.match(/(?:界|比|過[咗左]?數?界)\s*([^\s，。]{1,8})/);
  if (who && !/咗|左|蚊/.test(who[1])) out.counterparty = who[1].replace(/夾錢|食飯/g, "");
  if (/夾錢/.test(text)) out.purpose = "夾錢";
  else if (/食/.test(text)) out.purpose = "食飯";
  else if (/搭/.test(text)) out.purpose = out.channel ? `搭${out.channel}` : null;
  out.original_amount = out.amount;
  return out;
}

function showTab(id) {
  document.querySelectorAll(".dock button").forEach(b => b.classList.toggle("active", b.dataset.tab === id));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === id));
  document.body.classList.toggle("desktop-chart", id === "chart");
}

$("#dock").onclick = (e) => {
  const b = e.target.closest("button");
  if (b) showTab(b.dataset.tab);
};
$("#composer").onsubmit = (e) => { e.preventDefault(); send(input.value); };
$("#chips").onclick = (e) => { const b = e.target.closest("button"); if (b) send(b.dataset.q); };
$("#budgetInput").onchange = () => {
  budget = Number($("#budgetInput").value || 0);
  saveLocal("kotau_budget", budget);
  renderChart();
};
$("#micBtn").onclick = () => recordOrStop();

let recorder = null;
let chunks = [];

async function recordOrStop() {
  if (recorder && recorder.state === "recording") {
    recorder.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    browserStt();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      $("#micBtn").textContent = "🎤";
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      const text = await transcribeBlob(blob);
      if (text) send(text);
      else browserStt();
    };
    recorder.start();
    $("#micBtn").textContent = "⏹";
    addMsg("bot", "錄緊。再擊一次麥克風就停，交伴 SenseVoice。");
  } catch {
    browserStt();
  }
}

async function transcribeBlob(blob) {
  try {
    const body = new FormData();
    body.append("file", blob, "speech.webm");
    const r = await fetch(`${API}/api/transcribe`, { method: "POST", body });
    if (!r.ok) return "";
    const data = await r.json();
    if (data.ok && data.text) {
      addMsg("bot", `SenseVoice 聽到：${data.text}`);
      return data.text;
    }
  } catch { /* offline or no model */ }
  return "";
}

function browserStt() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { addMsg("bot", "後端未裝 SenseVoice，瀏覽器又未支援語音。可以打字。"); return; }
  addMsg("bot", "SenseVoice 未開，暫時用瀏覽器語音。粵語可能被改成書面語。");
  const rec = new SR();
  rec.lang = "zh-HK";
  rec.onresult = (ev) => { input.value = ev.results[0][0].transcript; send(input.value); };
  rec.onerror = () => addMsg("bot", "聽唔到。試下再擊一次，或者打字。");
  rec.start();
}

function openPrefs() {
  $("#prefTransport").value = prefs.transport || "港鐵";
  $("#prefPurpose").value = prefs.transport_purpose || "";
  $("#prefPay").value = prefs.payment || "Octopus";
  $("#sheetBack").hidden = false;
}
$("#gearBtn").onclick = openPrefs;
$("#prefClose").onclick = () => { $("#sheetBack").hidden = true; };
$("#sheetBack").onclick = (e) => { if (e.target.id === "sheetBack") $("#sheetBack").hidden = true; };
$("#prefSheet").onsubmit = (e) => {
  e.preventDefault();
  prefs = {
    transport: $("#prefTransport").value,
    transport_purpose: $("#prefPurpose").value.trim() || "搭車",
    payment: $("#prefPay").value,
  };
  saveLocal("kotau_prefs", prefs);
  $("#sheetBack").hidden = true;
  addMsg("bot", `喜好已存：搭車用${prefs.transport}，用途「${prefs.transport_purpose}」。`);
};

function exportCsv() {
  if (!txns.length) { addMsg("bot", "未有記錄，冇啲匯出。"); return; }
  const cols = ["created_at", "amount", "currency", "merchant", "counterparty", "purpose", "channel", "category", "payment_method", "transaction_type", "raw_text"];
  const lines = [cols.join(",")];
  for (const t of txns) {
    lines.push(cols.map(c => {
      const v = t[c] == null ? "" : String(t[c]);
      return `"${v.replace(/"/g, '""')}"`;
    }).join(","));
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `kotau-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  addMsg("bot", "已匯出 CSV。");
}
$("#exportBtn")?.addEventListener("click", exportCsv);

// new listeners
$("#searchInput")?.addEventListener("input", (e) => {
  searchTerm = e.target.value;
  renderHistory();
});
$("#monthSelect")?.addEventListener("change", (e) => {
  selectedMonth = e.target.value;
  renderChart();
});
$("#editClose")?.addEventListener("click", () => { $("#editBack").hidden = true; });
$("#editBack")?.addEventListener("click", (e) => { if (e.target.id === "editBack") $("#editBack").hidden = true; });
$("#editForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const id = $("#editSheet").dataset.id;
  if (!id) return;
  const form = e.target;
  const data = Object.fromEntries([...form.querySelectorAll("input,select")].map(el => [el.name, el.value]));
  data.amount = data.amount === "" ? null : Number(data.amount);
  data.original_amount = data.amount;
  data.merchant = data.merchant || null;
  data.counterparty = data.counterparty || null;
  data.purpose = data.purpose || null;
  data.channel = data.channel === "未設定" ? null : data.channel;
  updateTxn(id, data);
  $("#editBack").hidden = true;
});

addMsg("bot", "你好。講「今日搭車用咗 30 蚊」，如果右上角喜好設咗港鐵，確認卡會預填交通工具同用途。擊入帳之後先出現嘅「歷史」。");
renderHistory();
renderChart();
fetch(`${API}/api/health`).then(r => r.json()).then(h => {
  $("#modelBadge").textContent = `NER: ${h.ner}`;
}).catch(() => { $("#modelBadge").textContent = "離線 · 本機規則"; });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
