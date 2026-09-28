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
  div.className = "msg " + role;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}
function addCard(ext) {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = "<h3>\u78ba\u8a8d\u5165\u5e33</h3>" +
    '<div class="grid">' +
    '<label>\u91d1\u984d <input name="amount" type="number" step="0.1" value="' + (ext.amount ?? "") + '"></label>' +
    '<label>\u8ca8\u5e63 <input name="currency" value="' + (ext.currency || "HKD") + '"></label>' +
    '<label>\u5546\u6236 <input name="merchant" value="' + (ext.merchant || "") + '"></label>' +
    '<label>\u985e\u5225 <select name="category">' + CATS.map(c => '<option' + (c===ext.category?' selected':'') + '>' + c + '</option>').join('') + '</select></label>' +
    '<label>\u652f\u4ed8 <select name="payment_method">' + PAYS.map(c => '<option' + (c===(ext.payment_method||"Unknown")?' selected':'') + '>' + c + '</option>').join('') + '</select></label>' +
    '<label>\u78ba\u5b9a\u7a0b\u5ea6 <select name="amount_certainty">' + ["exact","approximate","unknown"].map(c => '<option value="'+c+'"'+(c===ext.amount_certainty?' selected':'')+'>'+c+'</option>').join('') + '</select></label>' +
    '<label>\u539f\u50f9 <input name="original_amount" type="number" step="0.1" value="' + (ext.original_amount ?? ext.amount ?? "") + '"></label>' +
    '<label>\u6298\u6263 <input name="discount_amount" type="number" step="0.1" value="' + (ext.discount_amount ?? 0) + '"></label>' +
    '<label>\u985e\u578b <select name="transaction_type">' + ["purchase","refund","transfer"].map(c => '<option'+(c===(ext.transaction_type||"purchase")?' selected':'')+'>'+c+'</option>').join('') + '</select></label>' +
    '</div><div class="actions"><button class="no" type="button">\u5514\u5165</button><button class="ok" type="button">\u5165\u5e33</button></div>';
  chatLog.appendChild(wrap);
  chatLog.scrollTop = chatLog.scrollHeight;
  wrap.querySelector(".no").onclick = function(){ wrap.remove(); };
  wrap.querySelector(".ok").onclick = async function(){
    const data = Object.fromEntries([...wrap.querySelectorAll("input,select")].map(el => [el.name, el.value]));
    data.amount = data.amount === "" ? null : Number(data.amount);
    data.original_amount = data.original_amount === "" ? data.amount : Number(data.original_amount);
    data.discount_amount = Number(data.discount_amount || 0);
    data.merchant = data.merchant || null;
    data.raw_text = ext.raw_text || "";
    await saveTxn(data);
    wrap.remove();
    addMsg("bot", "\u5165\u5497\u5e33\u3002\u53ef\u4ee5\u53bb\u300c\u5e33\u672c\u300d\u7747\u8fd4\u3002");
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
    await fetch(API + "/api/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  } catch (e) {}
}
function renderBook() {
  if (!txns.length) { bookList.innerHTML = '<p class="hint">\u672a\u6709\u8a18\u9304\u3002</p>'; return; }
  bookList.innerHTML = txns.map(t => '<div class="row"><div><b>' + (t.merchant || t.category) + '</b><small>' + t.category + ' \u00b7 ' + (t.payment_method || "-") + '</small><small>' + (t.raw_text || "").slice(0,42) + '</small></div><div class="amt">' + (t.currency || "HKD") + ' ' + (t.amount ?? "-") + '</div></div>').join("");
}
function renderBudget() {
  document.querySelector("#budgetInput").value = budget;
  const spent = txns.filter(t => t.transaction_type !== "refund").reduce((s, t) => s + Number(t.amount || 0), 0);
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const bar = document.querySelector("#budgetBar");
  bar.classList.toggle("over", spent > budget);
  bar.firstElementChild.style.width = pct + "%";
  document.querySelector("#budgetText").textContent = "\u5df2\u7528 HKD " + spent.toFixed(1) + " / " + budget;
}
async function send(text) {
  text = (text || "").trim();
  if (!text) return;
  addMsg("user", text);
  input.value = "";
  history.push({ role: "user", content: text });
  let payload = null;
  try {
    const r = await fetch(API + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text, history: history }) });
    if (r.ok) payload = await r.json();
  } catch (e) {}
  if (!payload) {
    const ext = localExtract(text);
    const expense = ext.amount != null || /蚊|界|食|搭|PayMe|FPS|八達通/.test(text);
    payload = { reply: expense ? (ext.amount != null ? ("\u6211\u4f30\u5462\u7b46\u4fc2 " + ext.currency + " " + ext.amount) : "\u672a\u898b\u5230\u91d1\u984d") : "\u5f8c\u7aef\u672a\u958b\uff0c\u7528\u672c\u6a5f\u898f\u5247\u8a18\u5e33\u3002", extraction: expense ? ext : null };
  }
  addMsg("bot", payload.reply);
  history.push({ role: "assistant", content: payload.reply });
  if (payload.extraction) addCard(payload.extraction);
}
function localExtract(text) {
  const out = { raw_text: text, amount: null, currency: "HKD", merchant: null, category: "Others", payment_method: null, original_amount: null, discount_amount: 0, transaction_type: "purchase", amount_certainty: "unknown", extractor: "rule_based_v0_js" };
  let m = text.match(/(\d+)\s*蚊\s*(\d)/);
  if (m) { out.amount = +m[1] + +m[2] / 10; out.amount_certainty = "exact"; }
  else if ((m = text.match(/(\d+(?:\.\d+)?)/))) { out.amount = +m[1]; out.amount_certainty = /幾/.test(text) ? "approximate" : "exact"; if (text.includes(m[1] + "幾")) out.amount = +m[1] + 5; }
  else if (/廿四蚊/.test(text)) { out.amount = 24; out.amount_certainty = "exact"; }
  else if (/三草/.test(text)) { out.amount = 30; out.amount_certainty = "exact"; }
  if (/老麥|麥當勞/i.test(text)) { out.merchant = "McDonald's (老麥)"; out.category = "Food & Dining"; }
  else if (/黨鐵|港鐵|MTR/i.test(text)) { out.merchant = "MTR"; out.category = "Transport"; }
  else if (/紅\s*van/i.test(text)) { out.merchant = "紅Van"; out.category = "Transport"; }
  if (/PayMe/i.test(text)) out.payment_method = "PayMe";
  else if (/FPS|轉數快/.test(text)) out.payment_method = "FPS";
  else if (/八達通|嘟/.test(text)) out.payment_method = "Octopus";
  else if (/界咗|現金/.test(text)) out.payment_method = "Cash";
  if (/轉|過咗|夾錢/.test(text)) out.transaction_type = "transfer";
  out.original_amount = out.amount;
  return out;
}
document.querySelectorAll(".tabs button").forEach(function(btn){
  btn.onclick = function(){
    document.querySelectorAll(".tabs button").forEach(function(b){ b.classList.remove("active"); });
    document.querySelectorAll(".panel").forEach(function(p){ p.classList.remove("active"); });
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  };
});
document.getElementById("composer").onsubmit = function(e){ e.preventDefault(); send(input.value); };
document.getElementById("chips").onclick = function(e){ var b = e.target.closest("button"); if (b) send(b.dataset.q); };
document.getElementById("budgetInput").onchange = function(){ budget = Number(this.value || 0); saveLocal("kotau_budget", budget); renderBudget(); };
document.getElementById("micBtn").onclick = function(){
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { addMsg("bot", "\u700f\u89bd\u5668\u672a\u652f\u63f4\u8a9e\u97f3\u3002"); return; }
  var rec = new SR(); rec.lang = "zh-HK";
  rec.onresult = function(ev){ input.value = ev.results[0][0].transcript; send(input.value); };
  rec.start();
};
addMsg("bot", "\u4f60\u597d\uff0c\u6211\u4fc2\u53e3\u982d\u5e33\u52a9\u624b\u3002\u8b1b\u300c\u8001\u9ea5\u56db\u5341\u5e7e\u868a\u300d\u5c31\u53ef\u4ee5\u8a18\u5e33\u3002\u800c\u5bb6 NER \u7528\u898f\u5247\u5f15\u64ce\uff1b\u6700\u7d42\u6703\u63db\u81ea\u8a13 Qwen-2.5-1.5B\u3002");
renderBook(); renderBudget();
fetch(API + "/api/health").then(function(r){ return r.json(); }).then(function(h){ document.getElementById("modelBadge").textContent = "NER: " + h.ner + " \u00b7 Chat: " + h.chat; }).catch(function(){ document.getElementById("modelBadge").textContent = "\u96e2\u7dda"; });
