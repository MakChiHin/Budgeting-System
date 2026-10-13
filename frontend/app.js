const API = "";
const $ = (s, r = document) => r.querySelector(s);
const chatLog = $("#chatLog");
const bookList = $("#bookList");
const input = $("#input");

const CATS = ["Food & Dining", "Transport", "Shopping", "Bills & Utilities", "Entertainment", "Others"];
const CAT_LABEL = {
  "Food & Dining": "\u98f2\u98df",
  "Transport": "\u4ea4\u901a",
  "Shopping": "\u8cfc\u7269",
  "Bills & Utilities": "\u8cec\u55ae",
  "Entertainment": "\u5a1b\u6a02",
  "Others": "\u5176\u4ed6",
};
const PAYS = ["Octopus", "PayMe", "FPS", "AlipayHK", "WeChat Pay", "Credit Card", "Cash", "Unknown"];
const CHANNELS = ["\u6e2f\u9435", "\u5df4\u58eb", "\u5c0f\u5df4", "\u7684\u58eb", "\u7d05Van", "\u672a\u8a2d\u5b9a"];

const DEFAULT_PREFS = { transport: "\u6e2f\u9435", transport_purpose: "\u642d\u8eca", payment: "Octopus" };

function loadLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function saveLocal(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

let txns = loadLocal("kotau_txns", []);
let budget = loadLocal("kotau_budget", 5000);
let prefs = { ...DEFAULT_PREFS, ...loadLocal("kotau_prefs", {}) };
let chatHistory = [];

function addMsg(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function applyPrefs(ext) {
  const notes = [];
  const ride = /\u642d\u8eca|\u642d\u5df4\u58eb|\u8fd4\u5de5\u8eca|\u4ea4\u901a/.test(ext.raw_text || "") || ext.category === "Transport";
  if (ride && !ext.channel && prefs.transport && prefs.transport !== "\u672a\u8a2d\u5b9a") {
    ext.channel = prefs.transport;
    ext.category = "Transport";
    if (!ext.merchant) ext.merchant = prefs.transport;
    notes.push("\u4ea4\u901a\u5de5\u5177\u7528\u559c\u597d\u9810\u586b");
  }
  if (ride && !ext.purpose) {
    ext.purpose = prefs.transport_purpose || `\u642d${ext.channel || "\u8eca"}`;
    notes.push("\u7528\u9014\u7528\u559c\u597d\u9810\u586b");
  }
  if (!ext.payment_method && prefs.payment && prefs.payment !== "Unknown") {
    ext.payment_method = prefs.payment;
    notes.push("\u652f\u4ed8\u7528\u559c\u597d\u9810\u586b");
  }
  ext.pref_notes = notes;
  return ext;
}

function addCard(ext) {
  ext = applyPrefs({ ...ext });
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `
    <h3>\u78ba\u8a8d\u5165\u5e33</h3>
    <p class=\"heard\">\u807d\u5230\uff1a${(ext.raw_text || "\uff08\u5187\u539f\u6587\uff09").replace(/</g, "")}</p>
    ${ext.pref_notes?.length ? `<p class=\"pref-note\">${ext.pref_notes.join(" \u00b7 ")}\uff0c\u53ef\u6539\u5b8c\u5148\u5165\u3002</p>` : ""}
    <div class=\"grid\">
      <label>\u91d1\u984d <input name=\"amount\" type=\"number\" step=\"0.1\" value=\"${ext.amount ?? "\"}\"></label>
      <label>\u8ca8\u5e63 <input name=\"currency\" value=\"${ext.currency || \"HKD\"}\"></label>
      <label>\u5546\u6236 <input name=\"merchant\" value=\"${ext.merchant || \"\"}\"></label>
      <label>\u8f49\u7540\u908a\u500b <input name=\"counterparty\" value=\"${ext.counterparty || \"\"}\" placeholder=\"\u963f\u660e\"></label>
      <label>\u505a\u54a9\u7528 <input name=\"purpose\" value=\"${ext.purpose || \"\"}\" placeholder=\"\u642d\u8eca\u8fd4\u5de5\"></label>
      <label>\u4ea4\u901a\uff0f\u6e20\u9053
        <select name=\"channel\">${CHANNELS.map(c => `<option ${c === (ext.channel || \"\u672a\u8a2d\u5b9a\") ? \"selected\" : \"\"}>${c}</option>`).join(\"\")}</select>
      </label>
      <label>\u985e\u5225
        <select name=\"category\">${CATS.map(c => `<option ${c === ext.category ? \"selected\" : \"\"}>${CAT_LABEL[c] || c}</option>`).join(\"\")}</select>
      </label>
      <label>\u652f\u4ed8
        <select name=\"payment_method\">${PAYS.map(c => `<option ${c === (ext.payment_method || \"Unknown\") ? \"selected\" : \"\"}>${c}</option>`).join(\"\")}</select>
      </label>
      <label>\u985e\u578b
        <select name=\"transaction_type\">
          ${
[\"purchase\", \"refund\", \"transfer\"].map(c => `<option ${c === (ext.transaction_type || \"purchase\") ? \"selected\" : \"\"}>${c}</option>`).join(\"\")}
        </select>
      </label>
    </div>
    <div class=\"actions\">
      <button class=\"no\" type=\"button\">\u5514\u5165</button>
      <button class=\"ok\" type=\"button\">\u5165\u5e33</button>
    </div>
  `;
  chatLog.appendChild(wrap);
  chatLog.scrollTop = chatLog.scrollHeight;
  wrap.querySelector(\".no\").onclick = () => wrap.remove();
  wrap.querySelector(\".ok\").onclick = async () => {
    const data = Object.fromEntries([...wrap.querySelectorAll(\"input,select\")].map(el => [el.name, el.value]));
    const catEntry = Object.entries(CAT_LABEL).find(([, label]) => label === data.category);
    data.category = catEntry ? catEntry[0] : data.category;
    data.amount = data.amount === \"\" ? null : Number(data.amount);
    data.original_amount = data.amount;
    data.discount_amount = 0;
    data.merchant = data.merchant || null;
    data.counterparty = data.counterparty || null;
    data.purpose = data.purpose || null;
    data.channel = data.channel === \"\u672a\u8a2d\u5b9a\" ? null : data.channel;
    data.raw_text = ext.raw_text || \"\";
    data.amount_certainty = ext.amount_certainty || \"exact\";
    await saveTxn(data);
    wrap.remove();
    addMsg(\"bot\", \"\u5165\u5497\u5e33\u3002\u53bb\u4e0b\u9762\u300c\u6b77\u53f2\u300d\u7747\u908a\u500b\u3001\u505a\u54a9\u7528\u3002\");
  };
}

async function saveTxn(data) {
  data.id = data.id || crypto.randomUUID();
  data.created_at = new Date().toISOString();
  txns.unshift(data);
  saveLocal(\"kotau_txns\", txns);
  renderHistory();
  renderChart();
  try {
    await fetch(`${API}/api/transactions`, {
      method: \"POST\",
      headers: { \"Content-Type\": \"application/json\" },
      body: JSON.stringify(data),
    });
  } catch { /* offline ok */ }
}

function titleOf(t) {
  if (t.transaction_type === \"transfer\" && t.counterparty) return `\u8f49\u7540${t.counterparty}`;
  return t.counterparty || t.merchant || t.purpose || CAT_LABEL[t.category] || \"\u672a\u547d\u540d\";
}

function renderHistory() {
  const countEl = $(\"#bookCount\");
  if (countEl) countEl.textContent = txns.length ? `${txns.length} \u7b46\u3002\u4e4b\u5f8c\u5f8c\u7aef\u540c\u6b65\u90fd\u4fc2\u5462\u500b\u7248\u9762\u3002` : \"\u672a\u6709\u8a18\u9304\u3002\u5165\u5e33\u4e4b\u5f8c\u5148\u6703\u51fa\u73fe\u3002\";
  if (!txns.length) {
    bookList.innerHTML = `<p class=\"hint\">\u672a\u6709\u8a18\u9304\u3002\u8b1b\u300c\u4eca\u65e5\u642d\u8eca\u7528\u5497 30 \u868a\u300d\u518d\u64b4\u5165\u5e33\u3002</p>`;
    return;
  }
  bookList.innerHTML = txns.map(t => {
    const bits = [t.purpose, t.channel, t.payment_method].filter(Boolean);
    return `
      <div class=\"row\">
        <div>
          <b>${titleOf(t)}</b>
          <small>${bits.join(\" \u00b7 \") || CAT_LABEL[t.category] || \"\"}</small>
          <small>${(t.raw_text || \"\").slice(0, 48)}</small>
        </div>
        <div class=\"amt\">${t.currency || \"HKD\"} ${t.amount ?? \"\u2014\"}</div>
      </div>`;
  }).join(\"\");
}

function monthTxns() {
  const now = new Date();
  return txns.filter(t => {
    const d = new Date(t.created_at || Date.now());
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && t.transaction_type !== \"refund\";
  });
}

function renderChart() {
  const month = monthTxns();
  const spent = month.reduce((s, t) => s + Number(t.amount || 0), 0);
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  $(\"#budgetInput\").value = budget;
  const bar = $(\"#budgetBar\");
  bar.classList.toggle(\"over\", spent > budget);
  bar.firstElementChild.style.width = `${pct}%`;
  $(\"#budgetText\").textContent = `\u5df2\u7528 HKD ${spent.toFixed(1)} / ${budget}\uff08${pct.toFixed(0)}%\uff09`;
  const label = $(\"#chartMonth\");
  if (label) label.textContent = `${new Date().getFullYear()}\u5e74${new Date().getMonth() + 1}\u6708 \u00b7 ${month.length} \u7b46`;
  const byCat = {};
  CATS.forEach(c => { byCat[c] = 0; });
  month.forEach(t => { byCat[t.category || \"Others\"] = (byCat[t.category || \"Others\"] || 0) + Number(t.amount || 0); });
  const max = Math.max(1, ...Object.values(byCat));
  $(\"#catBars\").innerHTML = CATS.map(c => {
    const v = byCat[c] || 0;
    const w = Math.round((v / max) * 100);
    return `<div class=\"hbar\"><span>${CAT_LABEL[c]}</span><div class=\"track\"><span style=\"width:${w}%\"></span></div><b>${v.toFixed(0)}</b></div>`;
  }).join(\"\");
}

async function send(text) {
  text = (text || \"\").trim();
  if (!text) return;
  addMsg(\"user\", text);
  input.value = \"\";
  chatHistory.push({ role: \"user\", content: text });
  let payload = null;
  try {
    const r = await fetch(`${API}/api/chat`, {
      method: \"POST\",
      headers: { \"Content-Type\": \"application/json\" },
      body: JSON.stringify({ text, history: chatHistory }),
    });
    if (r.ok) payload = await r.json();
  } catch { /* local */ }
  if (!payload) {
    const ext = localExtract(text);
    const expense = ext.amount != null || /\u868a|\u7540|\u98df|\u642d|PayMe|FPS|\u516b\u9054\u901a/.test(text);
    payload = {
      reply: expense
        ? (ext.amount != null
          ? `\u6211\u4f30\u5462\u7b46\u4fc2 ${ext.currency} ${ext.amount}\u3002\u6838\u5c0d\u7528\u9014\u540c\u8f49\u8cec\u5c0d\u8c61\uff0c\u5572\u5148\u5165\u5e33\u3002`
          : \"\u5462\u53e5\u4f3c\u8a18\u5e33\uff0c\u4f46\u672a\u898b\u5230\u91d1\u984d\u3002\")
        : \"\u53ef\u4ee5\u8b1b\u958b\u652f\uff0c\u6216\u8005\u53bb\u300c\u5716\u8868\u300d\u7747\u672c\u6708\u5206\u4f48\u3002\u559c\u597d\u55ba\u53f3\u4e0a\u89d2\u6b6a\u8f2a\u3002\",
      extraction: expense ? ext : null,
    };
  }
  if (payload.extraction) payload.extraction = applyPrefs(payload.extraction);
  addMsg(\"bot\", payload.reply);
  chatHistory.push({ role: \"assistant\", content: payload.reply });
  if (payload.extraction) addCard(payload.extraction);
}

function localExtract(text) {
  const out = {
    raw_text: text, amount: null, currency: \"HKD\", merchant: null,
    category: \"Others\", payment_method: null, original_amount: null,
    discount_amount: 0, transaction_type: \"purchase\", amount_certainty: \"unknown\",
    counterparty: null, purpose: null, channel: null,
    extractor: \"rule_based_v0_js\",
  };
  const approx = /\u5e7e|\u5de6\u53f3|\u5927\u6982|\u7d04/.test(text);
  let m = text.match(/(\\d+)\\s*\u868a\\s*(\\d)/);
  if (m) { out.amount = +m[1] + +m[2] / 10; out.amount_certainty = \"exact\"; }
  else if ((m = text.match(/(\\d+(?:\\.\\d+)?)/))) {
    out.amount = +m[1];
    out.amount_certainty = /\u5e7e/.test(text) ? \"approximate\" : (approx ? \"approximate\" : \"exact\");
    if (/\u5e7e/.test(text) && text.includes(m[1] + \"\u5e7e\")) out.amount = +m[1] + 5;
  } else if (/\u5eff\u56db\u868a/.test(text)) { out.amount = 24; out.amount_certainty = \"exact\"; }
  else if (/\u4e09\u8349/.test(text)) { out.amount = 30; out.amount_certainty = \"exact\"; }

  const mer = [
    [/\u8001\u9ea5|\u9ea5\u7576\u52de/i, \"McDonald's (\u8001\u9ea5)\", \"Food & Dining\"],
    [/\u9ee8\u9435|\u6e2f\u9435|MTR/i, \"\u6e2f\u9435\", \"Transport\"],
    [/\u7d05\\s*van/i, \"\u7d05Van\", \"Transport\"],
    [/\u5df4\u58eb|\u4e5d\u5df4|\u57ce\u5df4/, \"\u5df4\u58eb\", \"Transport\"],
    [/\u5c0f\u5df4/, \"\u5c0f\u5df4\", \"Transport\"],
    [/\u7684\u58eb|Taxi/i, \"\u7684\u58eb\", \"Transport\"],
    [/\u8336\u8a18|\u8336\u9910\u5ef3/, \"\u8336\u9910\u5ef3\", \"Food & Dining\"],
  ];
  for (const [re, name, cat] of mer) if (re.test(text)) {
    out.merchant = name; out.category = cat;
    if (cat === \"Transport\") out.channel = name;
    break;
  }
  if (/\u642d\u8eca/.test(text)) out.category = \"Transport\";
  if (/PayMe/i.test(text)) out.payment_method = \"PayMe\";
  else if (/FPS|\u8f49\u6578\u5feb/.test(text)) out.payment_method = \"FPS\";
  else if (/\u516b\u9054\u901a|\u561f/.test(text)) out.payment_method = \"Octopus\";
  else if (/\u7540\u5497|\u73fe\u91d1/.test(text)) out.payment_method = \"Cash\";
  if (/\u8f49|\u904e\u5497|\u593e\u9322/.test(text)) out.transaction_type = \"transfer\";
  const who = text.match(/(?:\u7540|\u6bd4|\u904e[\u5497\u5de6]?\u6578?\u7540)\\s*([^\\s\uff0c\u3002]{1,8})/);
  if (who && !/\u5497|\u5de6|\u868a/.test(who[1])) out.counterparty = who[1].replace(/\u593e\u9322|\u98df\u98ef/g, \"\");
  if (/\u593e\u9322/.test(text)) out.purpose = \"\u593e\u9322\";
  else if (/\u98df/.test(text)) out.purpose = \"\u98df\u98ef\";
  else if (/\u642d/.test(text)) out.purpose = out.channel ? `\u642d${out.channel}` : null;
  out.original_amount = out.amount;
  return out;
}

function showTab(id) {
  document.querySelectorAll(\".dock button\").forEach(b => b.classList.toggle(\"active\", b.dataset.tab === id));
  document.querySelectorAll(\".panel\").forEach(p => p.classList.toggle(\"active\", p.id === id));
}

$(\"#dock\").onclick = (e) => {
  const b = e.target.closest(\"button\");
  if (b) showTab(b.dataset.tab);
};
$(\"#composer\").onsubmit = (e) => { e.preventDefault(); send(input.value); };
$(\"#chips\").onclick = (e) => { const b = e.target.closest(\"button\"); if (b) send(b.dataset.q); };
$(\"#budgetInput\").onchange = () => {
  budget = Number($(\"#budgetInput\").value || 0);
  saveLocal(\"kotau_budget\", budget);
  renderChart();
};
$(\"#micBtn\").onclick = () => recordOrStop();

let recorder = null;
let chunks = [];

async function recordOrStop() {
  if (recorder && recorder.state === \"recording\") {
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
      $(\"#micBtn\").textContent = \"\ud83c\udfa4\";
      const blob = new Blob(chunks, { type: recorder.mimeType || \"audio/webm\" });
      const text = await transcribeBlob(blob);
      if (text) send(text);
      else browserStt();
    };
    recorder.start();
    $(\"#micBtn\").textContent = \"\u23f9\";
    addMsg(\"bot\", \"\u9304\u7dca\u3002\u518d\u64b4\u4e00\u6b21\u9ea5\u514b\u98a8\u5c31\u505c\uff0c\u4ea4\u4ffe SenseVoice\u3002\");
  } catch {
    browserStt();
  }
}

async function transcribeBlob(blob) {
  try {
    const body = new FormData();
    body.append(\"file\", blob, \"speech.webm\");
    const r = await fetch(`${API}/api/transcribe`, { method: \"POST\", body });
    if (!r.ok) return \"\";
    const data = await r.json();
    if (data.ok && data.text) {
      addMsg(\"bot\", `SenseVoice \u807d\u5230\uff1a${data.text}`);
      return data.text;
    }
  } catch { /* offline or no model */ }
  return \"\";
}

function browserStt() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { addMsg(\"bot\", \"\u5f8c\u7aef\u672a\u88dd SenseVoice\uff0c\u700f\u89bd\u5668\u53c8\u672a\u652f\u63f4\u8a9e\u97f3\u3002\u53ef\u4ee5\u6253\u5b57\u3002\"); return; }
  addMsg(\"bot\", \"SenseVoice \u672a\u958b\uff0c\u66ab\u6642\u7528\u700f\u89bd\u5668\u8a9e\u97f3\u3002\u7cb5\u8a9e\u53ef\u80fd\u88ab\u6539\u6210\u66f8\u9762\u8a9e\u3002\");
  const rec = new SR();
  rec.lang = \"zh-HK\";
  rec.onresult = (ev) => { input.value = ev.results[0][0].transcript; send(input.value); };
  rec.onerror = () => addMsg(\"bot\", \"\u807d\u5514\u5230\u3002\u8a66\u4e0b\u518d\u64b4\u4e00\u6b21\uff0c\u6216\u8005\u6253\u5b57\u3002\");
  rec.start();
}

function openPrefs() {
  $(\"#prefTransport\").value = prefs.transport || \"\u6e2f\u9435\";
  $(\"#prefPurpose\").value = prefs.transport_purpose || \"\";
  $(\"#prefPay\").value = prefs.payment || \"Octopus\";
  $(\"#sheetBack\").hidden = false;
}
$(\"#gearBtn\").onclick = openPrefs;
$(\"#prefClose\").onclick = () => { $(\"#sheetBack\").hidden = true; };
$(\"#sheetBack\").onclick = (e) => { if (e.target.id === \"sheetBack\") $(\"#sheetBack\").hidden = true; };
$(\"#prefSheet\").onsubmit = (e) => {
  e.preventDefault();
  prefs = {
    transport: $(\"#prefTransport\").value,
    transport_purpose: $(\"#prefPurpose\").value.trim() || \"\u642d\u8eca\",
    payment: $(\"#prefPay\").value,
  };
  saveLocal(\"kotau_prefs\", prefs);
  $(\"#sheetBack\").hidden = true;
  addMsg(\"bot\", `\u559c\u597d\u5df2\u5b58\uff1a\u642d\u8eca\u7528${prefs.transport}\uff0c\u7528\u9014\u300c${prefs.transport_purpose}\u300d\u3002`);
};

addMsg(\"bot\", \"\u4f60\u597d\u3002\u8b1b\u300c\u4eca\u65e5\u642d\u8eca\u7528\u5497 30 \u868a\u300d\uff0c\u5982\u679c\u53f3\u4e0a\u89d2\u559c\u597d\u8a2d\u5497\u6e2f\u9435\uff0c\u78ba\u8a8d\u5361\u6703\u9810\u586b\u4ea4\u901a\u5de5\u5177\u540c\u7528\u9014\u3002\u64b4\u5165\u5e33\u4e4b\u5f8c\u5148\u51fa\u73fe\u55ba\u300c\u6b77\u53f2\u300d\u3002\");
renderHistory();
renderChart();
fetch(`${API}/api/health`).then(r => r.json()).then(h => {
  $(\"#modelBadge\").textContent = `NER: ${h.ner}`;
}).catch(() => { $(\"#modelBadge\").textContent = \"\u96e2\u7dda \u00b7 \u672c\u6a5f\u898f\u5247\"; });
if (\"serviceWorker\" in navigator) navigator.serviceWorker.register(\"./sw.js\").catch(() => {});
