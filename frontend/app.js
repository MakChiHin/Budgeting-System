const API = "";
// Guest auto-login
var guestUserId = localStorage.getItem("kotau_guest_id");
async function ensureGuest() {
  if (guestUserId) return guestUserId;
  try {
    var r = await fetch(API + "/api/guest", { method: "POST" });
    if (r.ok) {
      var data = await r.json();
      if (data.ok && data.user_id) {
        guestUserId = data.user_id;
        localStorage.setItem("kotau_guest_id", guestUserId);
        return guestUserId;
      }
    }
  } catch (e) { /* offline */ }
  return null;
}
ensureGuest();


const $ = (s, r = document) => r.querySelector(s);
const chatLog = $("#chatLog");
const bookList = $("#bookList");
const input = $("#input");

const CATS = [
  "Food & Dining", "Transport", "Shopping",
  "Rent", "Utilities", "Household",
  "Bills & Utilities", "Entertainment",
  "Transfer", "Others"
];
const CAT_LABEL = {
  "Food & Dining": "飲食",
  "Transport": "交通",
  "Shopping": "購物",
  "Rent": "租金",
  "Utilities": "水電煤氣",
  "Household": "家用",
  "Bills & Utilities": "賬單",
  "Entertainment": "娛樂",
  "Transfer": "轉帳／過數",
  "Others": "其他",
};
const CAT_COLOR = {
  "Food & Dining": "#e76f51",
  "Transport": "#2a9d8f",
  "Shopping": "#e9c46a",
  "Rent": "#264653",
  "Utilities": "#457b9d",
  "Household": "#a8dadc",
  "Bills & Utilities": "#1d3557",
  "Entertainment": "#f4a261",
  "Transfer": "#9b5de5",
  "Others": "#6b7c83",
};
const PAYS = ["Octopus", "PayMe", "FPS", "AlipayHK", "WeChat Pay", "Credit Card", "Cash", "Unknown"];
const CHANNELS = ["港鐵", "巴士", "小巴", "的士", "紅Van", "未設定"];
const TXN_TYPES = ["purchase", "refund", "transfer", "split"];
const TXN_LABEL = {
  "purchase": "購買",
  "refund": "退款",
  "transfer": "轉帳",
  "split": "拆帳"
};
const CURRENCIES = ["HKD", "USD", "CNY", "JPY", "EUR", "GBP"];
const PURPOSES = ["食飯", "搭車", "夾錢", "購物", "娛樂", "家用", "租金", "水電", "其他"];
const MERCHANTS = ["McDonald's (老麥)", "茶餐廳", "港鐵", "巴士", "超市", "便利店", "餐廳", "其他"];

const DEFAULT_PREFS = { transport: "港鐵", transport_purpose: "搭車", payment: "Octopus" };

function loadLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function saveLocal(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

let txns = loadLocal("kotau_txns", []);
let budget = loadLocal("kotau_budget", 5000);
let prefs = { ...DEFAULT_PREFS, ...loadLocal("kotau_prefs", {}) };
let dualPane = loadLocal("kotau_dual_pane", false);
let chatHistory = [];
let searchTerm = "";
let selectedMonth = "";
let lastDeleted = null;
let trash = loadLocal("kotau_trash", []);
let lastPrefs = loadLocal("kotau_last_prefs", {});

function addMsg(role, text) {
  const div = document.createElement("div");
  div.className = "msg " + role;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function applyPrefs(ext) {
  if (lastPrefs.payment_method && !ext.payment_method) ext.payment_method = lastPrefs.payment_method;
  if (lastPrefs.category && !ext.category) ext.category = lastPrefs.category;
  const notes = [];
  const ride = /搭車|搭巴士|返工車|交通/.test(ext.raw_text || "") || ext.category === "Transport";
  if (ride && !ext.channel && prefs.transport && prefs.transport !== "未設定") {
    ext.channel = prefs.transport;
    ext.category = "Transport";
    if (!ext.merchant) ext.merchant = prefs.transport;
    notes.push("交通工具用喜好預填");
  }
  if (ride && !ext.purpose) {
    ext.purpose = prefs.transport_purpose || ("搭" + (ext.channel || "車"));
    notes.push("用途用喜好預填");
  }
  if (!ext.payment_method && prefs.payment && prefs.payment !== "Unknown") {
    ext.payment_method = prefs.payment;
    notes.push("支付用喜好預填");
  }
  ext.pref_notes = notes;
  return ext;
}

function parseSplit(str) {
  if (!str) return [];
  if (Array.isArray(str)) return str;
  return String(str).split(/[,，]/).map(function(s) { return s.trim(); }).filter(Boolean).map(function(part) {
    var m = part.match(/^(.+?)\s+([\d.]+)$/) || part.match(/^([A-Za-z\u4e00-\u9fff]+)([\d.]+)$/);
    if (m) return { name: m[1].trim(), amount: Number(m[2]), paid: false };
    return { name: part, amount: null, paid: false };
  });
}

function splitsToText(splits) {
  if (!splits || !splits.length) return "";
  return splits.map(function(s) {
    return s.amount != null ? (s.name + " " + s.amount) : s.name;
  }).join("，");
}

function addCard(ext) {
  ext = applyPrefs({ ...ext });
  const wrap = document.createElement("div");
  wrap.className = "card";
  var channelOpts = CHANNELS.map(function(c) {
    return "<option " + (c === (ext.channel || "未設定") ? "selected" : "") + ">" + c + "</option>";
  }).join("");
  var catOpts = CATS.map(function(c) {
    return "<option " + (c === ext.category ? "selected" : "") + ">" + (CAT_LABEL[c] || c) + "</option>";
  }).join("");
  var payOpts = PAYS.map(function(c) {
    return "<option " + (c === (ext.payment_method || "Unknown") ? "selected" : "") + ">" + c + "</option>";
  }).join("");
  var typeOpts = TXN_TYPES.map(function(c) {
    return "<option value=\"" + c + "\" " + (c === (ext.transaction_type || "purchase") ? "selected" : "") + ">" + (TXN_LABEL[c] || c) + "</option>";
  }).join("");
  wrap.innerHTML =
    "<h3>確認入帳</h3>" +
    "<p class=\"heard\">聽到：" + (ext.raw_text || "（冇原文）").replace(/</g, "") + "</p>" +
    (ext.pref_notes && ext.pref_notes.length ? "<p class=\"pref-note\">" + ext.pref_notes.join(" · ") + "，可改完先入。</p>" : "") +
    "<div class=\"grid\">" +
      "<label>日期 <input name=\"txn_date\" type=\"date\" value=\"" + (ext.txn_date || new Date().toISOString().slice(0,10)) + "\"></label>" +
      "<label>金額 <input name=\"amount\" type=\"number\" step=\"0.1\" value=\"" + (ext.amount ?? "") + "\"></label>" +
      "<label>貨幣 <select name=\"currency\">" + CURRENCIES.map(function(c){return "<option " + (c === (ext.currency || "HKD") ? "selected" : "") + ">" + c + "</option>"}).join("") + "</select></label>" +
      "<label>商戶／公司 <select name=\"merchant\">" + ["", "McDonald's (老麥)", "茶餐廳", "港鐵", "巴士", "超市", "便利店", "餐廳"].map(function(c){return "<option " + (c === (ext.merchant || "") ? "selected" : "") + ">" + (c || "未設定") + "</option>"}).join("") + "</select></label>" +
      "<label>畀邊個／AA對象 <input name=\"counterparty\" value=\"" + (ext.counterparty || "") + "\" placeholder=\"阿明、小明\"></label>" +
      "<label>做咩用 <select name=\"purpose\">" + ["", "食飯", "搭車", "夾錢", "購物", "娛樂", "家用", "租金", "水電"].map(function(c){return "<option " + (c === (ext.purpose || "") ? "selected" : "") + ">" + (c || "未設定") + "</option>"}).join("") + "</select></label>" +
      "<label>交通／渠道 <select name=\"channel\">" + channelOpts + "</select></label>" +
      "<label>類別 <select name=\"category\">" + catOpts + "</select></label>" +
      "<label>支付 <select name=\"payment_method\">" + payOpts + "</select></label>" +
      "<label>類型 <select name=\"transaction_type\">" + typeOpts + "</select></label>" +
      "<label>AA 拆帳（邊個欠你） <input name=\"split_with\" value=\"" + (ext.split_with || "") + "\" placeholder=\"阿明 30，小明 25 或 a20\"></label>" +
    "</div>" +
    "<div class=\"actions\">" +
      "<button class=\"no\" type=\"button\">唔入</button>" +
      "<button class=\"ok\" type=\"button\">入帳</button>" +
    "</div>";
  chatLog.appendChild(wrap);
  chatLog.scrollTop = chatLog.scrollHeight;
  wrap.querySelector(".no").onclick = function() { wrap.remove(); };
  wrap.querySelector(".ok").onclick = async function() {
    var data = {};
    wrap.querySelectorAll("input,select").forEach(function(el) { data[el.name] = el.value; });
    var catEntry = Object.entries(CAT_LABEL).find(function(entry) { return entry[1] === data.category; });
    data.category = catEntry ? catEntry[0] : data.category;
    data.amount = data.amount === "" ? null : Number(data.amount);
    data.original_amount = data.amount;
    data.discount_amount = 0;
    data.merchant = data.merchant || null;
    data.counterparty = data.counterparty || null;
    data.purpose = data.purpose || null;
    data.channel = data.channel === "未設定" ? null : data.channel;
    data.splits = parseSplit(data.split_with);
    data.split_with = splitsToText(data.splits);
    data.raw_text = ext.raw_text || "";
    data.amount_certainty = ext.amount_certainty || "exact";
    if (data.txn_date) data.created_at = new Date(data.txn_date).toISOString();
    if (data.splits.length && data.amount) {
      var splitSum = data.splits.reduce(function(s, x) { return s + (x.amount || 0); }, 0);
      if (Math.abs(splitSum - data.amount) > 0.01) {
        addMsg("bot", "提示：拆帳總共 " + splitSum.toFixed(0) + "，同總額 " + data.amount + " 差 " + (data.amount - splitSum).toFixed(0) + "。");
      }
    }
    await saveTxn(data);
    lastPrefs = { payment_method: data.payment_method, category: data.category };
    saveLocal("kotau_last_prefs", lastPrefs);
    wrap.remove();
    addMsg("bot", "已入帳 HKD " + (data.amount || 0) + "（" + (CAT_LABEL[data.category] || data.category || "未分類") + "）。");
  };
}

async function saveTxn(data) {
  data.id = data.id || crypto.randomUUID();
  if (guestUserId) data.user_id = guestUserId;
  data.created_at = new Date().toISOString();
  if (!data.splits) data.splits = parseSplit(data.split_with);
  txns.unshift(data);
  saveLocal("kotau_txns", txns);
  renderHistory();
  renderChart();
  try {
    await fetch(API + "/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (e) { /* offline ok */ }
}

async function updateTxn(id, data) {
  var idx = txns.findIndex(function(t) { return t.id === id; });
  if (idx === -1) return;
  data.id = id;
  data.created_at = txns[idx].created_at;
  if (data.split_with !== undefined) data.splits = parseSplit(data.split_with);
  txns[idx] = Object.assign({}, txns[idx], data);
  saveLocal("kotau_txns", txns);
  renderHistory();
  renderChart();
  addMsg("bot", "已更新記錄。");
}

function markSplitPaid(txnId, name, paid) {
  var t = txns.find(function(x) { return x.id === txnId; });
  if (!t) return;
  if (!t.splits) t.splits = parseSplit(t.split_with);
  var s = t.splits.find(function(x) { return x.name === name; });
  if (s) s.paid = paid;
  else t.splits.push({ name: name, amount: null, paid: paid });
  saveLocal("kotau_txns", txns);
  renderHistory();
  renderChart();
}

async function deleteTxn(id) {
  if (!confirm("刪除呢筆記錄？\n\n刪除後會去垃圾桶，可以喺垃圾桶還原。")) return;
  var idx = txns.findIndex(function(t) { return t.id === id; });
  if (idx === -1) return;
  var deleted = txns[idx];
  deleted.deleted_at = new Date().toISOString();
  trash.unshift(deleted);
  saveLocal("kotau_trash", trash);
  txns = txns.filter(function(t) { return t.id !== id; });
  saveLocal("kotau_txns", txns);
  renderHistory();
  renderChart();
  renderTrash();
  try {
    await fetch(API + "/api/transactions/" + id, { method: "DELETE" });
  } catch (e) { /* offline ok */ }
}

function restoreFromTrash(id) {
  var idx = trash.findIndex(function(t) { return t.id === id; });
  if (idx === -1) return;
  var restored = trash[idx];
  delete restored.deleted_at;
  txns.unshift(restored);
  trash = trash.filter(function(t) { return t.id !== id; });
  saveLocal("kotau_txns", txns);
  saveLocal("kotau_trash", trash);
  renderHistory();
  renderChart();
  renderTrash();
}

function renderTrash() {
  var trashEl = $("#trashList");
  if (!trashEl) return;
  if (!trash.length) {
    trashEl.innerHTML = "<p class=\"hint\">垃圾桶係空嘅。</p>";
    return;
  }
  trashEl.innerHTML = trash.map(function(t) {
    return "<div class=\"row\" style=\"opacity:0.7\">" +
      "<div><b>" + titleOf(t) + "</b><small>" + (t.amount || "") + " " + (t.currency || "") + "</small></div>" +
      "<button type=\"button\" class=\"restore\" data-restore=\"" + t.id + "\" title=\"還原\">↩</button>" +
      "</div>";
  }).join("");
  trashEl.querySelectorAll(".restore").forEach(function(b) {
    b.onclick = function() { restoreFromTrash(b.dataset.restore); };
  });
}

function relativeDate(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  var now = new Date();
  var diff = Math.floor((now - d) / 86400000);
  var dateStr = (d.getMonth()+1) + "/" + d.getDate();
  if (diff === 0) return "今日 " + dateStr;
  if (diff === 1) return "昨日 " + dateStr;
  if (diff < 7) return diff + " 日前 " + dateStr;
  return dateStr;
}

function titleOf(t) {
  if (t.transaction_type === "transfer" && t.counterparty) return "轉畀" + t.counterparty;
  if (t.transaction_type === "split" && t.counterparty) return "AA 畀" + t.counterparty;
  return t.counterparty || t.merchant || t.purpose || CAT_LABEL[t.category] || "未命名";
}

function filteredTxns() {
  if (!searchTerm.trim()) return txns;
  var q = searchTerm.toLowerCase();
  return txns.filter(function(t) {
    var hay = [
      t.amount, t.merchant, t.counterparty, t.purpose, t.channel, t.split_with,
      CAT_LABEL[t.category] || t.category, t.payment_method, t.raw_text, t.transaction_type
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.indexOf(q) !== -1;
  });
}

function highlight(text, term) {
  if (!term || !text) return text || "";
  var re = new RegExp("(" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
  return String(text).replace(re, "<mark>$1</mark>");
}


function getOwedSummary() {
  var map = {};
  txns.forEach(function(t) {
    (t.splits || []).forEach(function(s) {
      if (!s.name || s.amount == null) return;
      if (!map[s.name]) map[s.name] = { total: 0, unpaid: 0 };
      map[s.name].total += s.amount;
      if (!s.paid) map[s.name].unpaid += s.amount;
    });
  });
  return Object.keys(map).map(function(name) {
    return { name: name, total: map[name].total, unpaid: map[name].unpaid };
  }).sort(function(a, b) { return b.unpaid - a.unpaid; });
}

function renderHistory() {
  var list = filteredTxns();
  var countEl = $("#bookCount");
  if (countEl) {
    var base = txns.length ? (txns.length + " 筆") : "未有記錄";
    countEl.textContent = searchTerm ? (list.length + " / " + base + " 符合搜尋") : (base + "。入帳之後先會出現。");
  }
  var summary = getOwedSummary();
  var summaryHtml = "";
  if (summary.length) {
    summaryHtml = "<div class=\"owed-summary\"><b>邊個總共欠你</b>" +
      summary.map(function(s) {
        var status = s.unpaid > 0 ? "unpaid" : "paid";
        var text = s.unpaid > 0 ? ("未還 " + s.unpaid.toFixed(0) + " / 共 " + s.total.toFixed(0)) : ("已還清 " + s.total.toFixed(0));
        return "<div class=\"owed-row\"><span>" + s.name + "</span><span class=\"" + status + "\">" + text + "</span></div>";
      }).join("") +
      "</div>";
  }
  var trialHtml = "<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin:8px 0\">" +
    "<button type=\"button\" class=\"chip-ex\" data-q=\"今日搭車用咗 30 蚊\">試下：搭車 30 蚊</button>" +
    "<button type=\"button\" class=\"chip-ex\" data-q=\"老麥食咗個餐 45 蚊\">試下：老麥 45 蚊</button>" +
    "</div>";
  if (!list.length && !summary.length) {
    bookList.innerHTML = "<p class=\"hint\">" + (txns.length ? "冇符合搜尋嘅記錄。" : "未有記錄。") + "</p>" + trialHtml;
    bookList.querySelectorAll(".chip-ex").forEach(function(b) {
      b.onclick = function() {
        var ext = localExtract(b.dataset.q);
        ext.raw_text = b.dataset.q;
        addCard(ext);
        showTab("chat");
      };
    });
    return;
  }
  bookList.innerHTML = trialHtml + summaryHtml + list.map(function(t) {
    var where = [];
    if (t.counterparty) where.push("畀" + t.counterparty);
    if (t.merchant) where.push(t.merchant);
    if (t.purpose) where.push(t.purpose);
    var bits = [t.channel, t.payment_method, CAT_LABEL[t.category]].filter(Boolean);
    var parsed = parseSplit(t.split_with);
    var splits = parsed.map(function(s) {
      var existing = (t.splits || []).find(function(x) { return x.name === s.name; });
      if (existing) s.paid = existing.paid;
      return s;
    });
    if (!splits.length) splits = t.splits || [];
    var splitHtml = "";
    if (splits.length) {
      splitHtml = "<div class=\"splits\">" +
        splits.map(function(s) {
          var cls = s.paid ? "paid" : "unpaid";
          var label = s.amount != null ? (s.name + " 欠 " + s.amount) : s.name;
          var btn = s.paid ? "已還" : "未還";
          return "<div class=\"split-item " + cls + "\">" +
            "<span>" + label + "</span>" +
            "<button type=\"button\" class=\"mark-paid\" data-txn=\"" + t.id + "\" data-name=\"" + s.name + "\" data-paid=\"" + (!s.paid) + "\">" + btn + "</button>" +
            "</div>";
        }).join("") +
        "</div>";
    }
    return "<div class=\"row\" data-id=\"" + t.id + "\">" +
      "<div>" +
        "<b>" + highlight(titleOf(t), searchTerm) + "</b>" +
        "<small style=\"color:#888\">" + relativeDate(t.created_at) + "</small>" +
        "<small>" + (where.join(" · ") || bits[0] || "") + "</small>" +
        "<small>" + bits.join(" · ") + "</small>" +
        splitHtml +
        "<small class=\"raw\">" + (t.raw_text || "").slice(0, 60) + "</small>" +
      "</div>" +
      "<div class=\"amt\">" + (t.currency || "HKD") + " " + (t.amount ?? "—") + "</div>" +
      "<button type=\"button\" class=\"dup\" data-dup=\"" + t.id + "\" title=\"再記一筆\">＋</button>" +
      "<button type=\"button\" class=\"edit\" data-edit=\"" + t.id + "\" title=\"修改\">✎</button>" +
      "<button type=\"button\" class=\"del\" data-del=\"" + t.id + "\" title=\"刪除\">✕</button>" +
      "</div>";
  }).join("");
  bookList.querySelectorAll(".chip-ex").forEach(function(b) {
    b.onclick = function() {
      var ext = localExtract(b.dataset.q);
      ext.raw_text = b.dataset.q;
      addCard(ext);
      showTab("chat");
    };
  });
  bookList.querySelectorAll(".del").forEach(function(b) {
    b.onclick = function() { deleteTxn(b.dataset.del); };
  });
  bookList.querySelectorAll(".edit").forEach(function(b) {
    b.onclick = function() { openEditSheet(b.dataset.edit); };
  });
  bookList.querySelectorAll(".dup").forEach(function(b) {
    b.onclick = function() {
      var t = txns.find(function(x) { return x.id === b.dataset.dup; });
      if (!t) return;
      var copy = Object.assign({}, t);
      delete copy.id;
      copy.created_at = new Date().toISOString();
      copy.raw_text = (t.raw_text || "") + "（複製）";
      saveTxn(copy);
      addMsg("bot", "已複製一筆。");
    };
  });
  bookList.querySelectorAll(".mark-paid").forEach(function(b) {
    b.onclick = function() { markSplitPaid(b.dataset.txn, b.dataset.name, b.dataset.paid === "true"); };
  });
  bookList.querySelectorAll(".row").forEach(function(row) {
    var startX = 0;
    row.addEventListener("touchstart", function(e) { startX = e.touches[0].clientX; }, {passive: true});
    row.addEventListener("touchend", function(e) {
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) < 60) return;
      var id = row.dataset.id;
      if (dx < 0) {
        if (confirm("刪除呢筆？")) deleteTxn(id);
      } else {
        openEditSheet(id);
      }
    }, {passive: true});
  });
}

function getAvailableMonths() {
  var set = {};
  txns.forEach(function(t) {
    if (!t.created_at) return;
    var d = new Date(t.created_at);
    if (isNaN(d)) return;
    var ym = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    set[ym] = true;
  });
  var now = new Date();
  set[now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0")] = true;
  return Object.keys(set).sort().reverse();
}

function monthTxns(ym) {
  var y, m;
  if (!ym) {
    var now = new Date();
    y = now.getFullYear();
    m = now.getMonth();
  } else {
    var parts = ym.split("-");
    y = Number(parts[0]);
    m = Number(parts[1]) - 1;
  }
  return txns.filter(function(t) {
    var d = new Date(t.created_at || Date.now());
    return d.getFullYear() === y && d.getMonth() === m && t.transaction_type !== "refund";
  });
}

function renderChart() {
  var months = getAvailableMonths();
  var sel = $("#monthSelect");
  if (sel) {
    var cur = selectedMonth || months[0] || "";
    sel.innerHTML = months.map(function(ym) {
      return "<option value=\"" + ym + "\" " + (ym === cur ? "selected" : "") + ">" + ym.replace("-", "年") + " 月</option>";
    }).join("");
    if (!selectedMonth) selectedMonth = cur;
  }
  var month = monthTxns(selectedMonth);
  var spent = month.reduce(function(s, t) { return s + Number(t.amount || 0); }, 0);
  var pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  $("#budgetInput").value = budget;
  var bar = $("#budgetBar");
  bar.classList.toggle("over", spent > budget);
  bar.firstElementChild.style.width = pct + "%";
  $("#budgetText").textContent = "已用 HKD " + spent.toFixed(1) + " / " + budget + "（" + pct.toFixed(0) + "%）";
  if (spent > budget && budget > 0) {
    var over = spent - budget;
    if (!$("#budgetAlert")) {
      var alert = document.createElement("p");
      alert.id = "budgetAlert";
      alert.className = "hint";
      alert.style.color = "#e76f51";
      alert.textContent = "已超支 HKD " + over.toFixed(0);
      $("#budgetText").after(alert);
    }
  } else {
    var existing = $("#budgetAlert");
    if (existing) existing.remove();
  }
  var label = $("#chartMonth");
  if (label) {
    var parts = (selectedMonth || "").split("-");
    label.textContent = selectedMonth ? (parts[0] + "年" + Number(parts[1]) + "月 · " + month.length + " 筆") : "本月";
  }
  var byCat = {};
  CATS.forEach(function(c) { byCat[c] = 0; });
  month.forEach(function(t) {
    var c = t.category || "Others";
    byCat[c] = (byCat[c] || 0) + Number(t.amount || 0);
  });
  var max = Math.max(1, ...Object.values(byCat));
  $("#catBars").innerHTML = CATS.map(function(c) {
    var v = byCat[c] || 0;
    var w = Math.round((v / max) * 100);
    var col = CAT_COLOR[c] || "#2a9d8f";
    return "<div class=\"hbar\"><span>" + CAT_LABEL[c] + "</span><div class=\"track\"><span style=\"width:" + w + "%;background:" + col + "\"></span></div><b>" + v.toFixed(0) + "</b></div>";
  }).join("");
  var legend = $("#legend");
  if (legend) {
    legend.innerHTML = CATS.map(function(c) {
      return "<span class=\"leg\"><i style=\"background:" + CAT_COLOR[c] + "\"></i>" + CAT_LABEL[c] + "</span>";
    }).join("");
  }
}

function openEditSheet(id) {
  var t = txns.find(function(x) { return x.id === id; });
  if (!t) return;
  var sheet = $("#editSheet");
  if (!sheet) return;
  sheet.dataset.id = id;
  var moreBtn = sheet.querySelector(".more-fields-btn");
  if (!moreBtn) {
    moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "more-fields-btn";
    moreBtn.textContent = "更多選項";
    moreBtn.style.cssText = "grid-column:1/-1;margin:8px 0;padding:6px;border:1px solid #ddd;border-radius:6px;background:#f5f5f5;cursor:pointer";
    moreBtn.onclick = function() {
      var extras = sheet.querySelectorAll(".extra-field");
      var show = extras[0] && extras[0].style.display === "none";
      extras.forEach(function(el) { el.style.display = show ? "" : "none"; });
      moreBtn.textContent = show ? "收起" : "更多選項";
    };
    sheet.appendChild(moreBtn);
  }
  var channelLabel = sheet.querySelector("[name=channel]").closest("label");
  var typeLabel = sheet.querySelector("[name=transaction_type]").closest("label");
  if (channelLabel) channelLabel.classList.add("extra-field");
  if (typeLabel) typeLabel.classList.add("extra-field");
  sheet.querySelectorAll(".extra-field").forEach(function(el) { el.style.display = "none"; });
  sheet.querySelector("[name=amount]").value = t.amount ?? "";
  sheet.querySelector("[name=currency]").value = t.currency || "HKD";
  sheet.querySelector("[name=merchant]").value = t.merchant || "";
  sheet.querySelector("[name=counterparty]").value = t.counterparty || "";
  sheet.querySelector("[name=purpose]").value = t.purpose || "";
  sheet.querySelector("[name=channel]").value = t.channel || "未設定";
  var catSel = sheet.querySelector("[name=category]");
  catSel.innerHTML = CATS.map(function(c) {
    return "<option value=\"" + c + "\" " + (c === t.category ? "selected" : "") + ">" + CAT_LABEL[c] + "</option>";
  }).join("");
  sheet.querySelector("[name=payment_method]").value = t.payment_method || "Unknown";
  sheet.querySelector("[name=transaction_type]").value = t.transaction_type || "purchase";
  var splitInput = sheet.querySelector("[name=split_with]");
  if (splitInput) splitInput.value = t.split_with || splitsToText(t.splits) || "";
  $("#editBack").hidden = false;
}

async function send(text) {
  text = (text || "").trim();
  if (!text) return;
  addMsg("user", text);
  if (/超支|預算|幾多錢|用咗幾多/.test(text)) {
    var month = monthTxns(selectedMonth);
    var total = month.reduce(function(s, t) { return s + Number(t.amount || 0); }, 0);
    var catMap = { "飲食": "Food & Dining", "食": "Food & Dining", "交通": "Transport", "購物": "Shopping" };
    var targetCat = null;
    for (var k in catMap) { if (text.indexOf(k) !== -1) { targetCat = catMap[k]; break; } }
    var catSpent = {};
    month.forEach(function(t) {
      var c = t.category || "Others";
      catSpent[c] = (catSpent[c] || 0) + Number(t.amount || 0);
    });
    var overCats = Object.keys(catSpent).filter(function(c) { return catSpent[c] > 0; }).sort(function(a, b) { return catSpent[b] - catSpent[a]; });
    var topCat = overCats[0];
    var topName = CAT_LABEL[topCat] || topCat;
    var topAmt = catSpent[topCat] || 0;
    if (targetCat) {
      var targetSpent = catSpent[targetCat] || 0;
      var targetName = CAT_LABEL[targetCat] || targetCat;
      if (total > budget) {
        var msg = targetName + "未超支（已用 HKD " + targetSpent.toFixed(0) + "），但總共已用 HKD " + total.toFixed(0) + "，超預算 " + (total - budget).toFixed(0) + "。主要係" + topName + "用咗 HKD " + topAmt.toFixed(0) + "。";
      } else {
        var msg = targetName + "未超支。已用 HKD " + targetSpent.toFixed(0) + "，總共 HKD " + total.toFixed(0) + " / " + budget + "。";
      }
    } else {
      var msg = total > budget
        ? ("已超支。已用 HKD " + total.toFixed(0) + "，預算 " + budget + "，超 " + (total - budget).toFixed(0) + "。主要係" + topName + "用咗 HKD " + topAmt.toFixed(0) + "。")
        : ("未超支。已用 HKD " + total.toFixed(0) + " / " + budget + "。");
    }
    addMsg("bot", msg);
    return;
  }
  input.value = "";
  chatHistory.push({ role: "user", content: text });
  var payload = null;
  try {
    var r = await fetch(API + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text, history: chatHistory }),
    });
    if (r.ok) payload = await r.json();
  } catch (e) { /* local */ }
  if (!payload) {
    var ext = localExtract(text);
    var expense = ext.amount != null || /蚊|界|食|搭|PayMe|FPS|八達通/.test(text);
    payload = {
      reply: expense
        ? (ext.amount != null
          ? ("我估呢筆係 " + ext.currency + " " + ext.amount + "。核對用途同轉帳對象，哒先入帳。")
          : "呢句似記帳，但未見到金額。")
        : "可以講開支，或者去「圖表」睇本月分佈。喜好嘅右上角歪輪。",
      extraction: expense ? ext : null,
    };
  }
  if (payload.extraction) {
    payload.extraction = applyPrefs(payload.extraction);
    addCard(payload.extraction);
  } else {
    addMsg("bot", payload.reply);
    chatHistory.push({ role: "assistant", content: payload.reply });
  }
}

function localExtract(text) {
  var out = {
    raw_text: text, amount: null, currency: "HKD", merchant: null,
    category: "Others", payment_method: null, original_amount: null,
    discount_amount: 0, transaction_type: "purchase", amount_certainty: "unknown",
    counterparty: null, purpose: null, channel: null, split_with: null, splits: [],
    extractor: "rule_based_v0_js",
  };
  var approx = /幾|左右|大概|約/.test(text);
  var m = text.match(/(\d+)\s*蚊\s*(\d)/);
  if (m) { out.amount = +m[1] + +m[2] / 10; out.amount_certainty = "exact"; }
  else if ((m = text.match(/(\d+(?:\.\d+)?)/))) {
    out.amount = +m[1];
    out.amount_certainty = /幾/.test(text) ? "approximate" : (approx ? "approximate" : "exact");
    if (/幾/.test(text) && text.indexOf(m[1] + "幾") !== -1) out.amount = +m[1] + 5;
  } else if (/廿四蚊/.test(text)) { out.amount = 24; out.amount_certainty = "exact"; }
  else if (/三草/.test(text)) { out.amount = 30; out.amount_certainty = "exact"; }

  var mer = [
    [/老麥|麥當勞/i, "McDonald's (老麥)", "Food & Dining"],
    [/黨鐵|港鐵|MTR/i, "港鐵", "Transport"],
    [/紅\s*van/i, "紅Van", "Transport"],
    [/巴士|九巴|城巴/, "巴士", "Transport"],
    [/小巴/, "小巴", "Transport"],
    [/的士|Taxi/i, "的士", "Transport"],
    [/茶記|茶餐廳/, "茶餐廳", "Food & Dining"],
  ];
  for (var i = 0; i < mer.length; i++) {
    if (mer[i][0].test(text)) {
      out.merchant = mer[i][1]; out.category = mer[i][2];
      if (mer[i][2] === "Transport") out.channel = mer[i][1];
      break;
    }
  }
  if (/搭車/.test(text)) out.category = "Transport";
  if (/PayMe/i.test(text)) out.payment_method = "PayMe";
  else if (/FPS|轉數快/.test(text)) out.payment_method = "FPS";
  else if (/八達通|嘟/.test(text)) out.payment_method = "Octopus";
  else if (/界咗|現金/.test(text)) out.payment_method = "Cash";
  if (/轉|過咗|夾錢|過數|畀|比/.test(text)) {
    out.transaction_type = "transfer";
    out.category = "Transfer";
  }
  if (/AA|拆帳|欠/.test(text)) out.transaction_type = "split";
  var who = text.match(/(?:界|比|過[咗左]?數?界)\s*([^\s，。]{1,8})/);
  if (who && !/咗|左|蚊/.test(who[1])) out.counterparty = who[1].replace(/夾錢|食飯/g, "");
  if (/夾錢/.test(text)) out.purpose = "夾錢";
  else if (/食/.test(text)) out.purpose = "食飯";
  else if (/搭/.test(text)) out.purpose = out.channel ? ("搭" + out.channel) : null;
  out.original_amount = out.amount;
  return out;
}

function showTab(id) {
  document.querySelectorAll(".dock button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.tab === id);
  });
  document.querySelectorAll(".panel").forEach(function(p) {
    p.classList.toggle("active", p.id === id);
  });
  document.body.classList.toggle("desktop-chart", id === "chart");
  applyDualPane();
}

function applyDualPane() {
  document.body.classList.toggle("dual-pane", dualPane);
  var histBtn = document.querySelector('.dock button[data-tab="history"]');
  if (histBtn) histBtn.style.display = dualPane ? "none" : "";
  var dualBtn = $("#dualPaneBtn");
  if (dualBtn) dualBtn.textContent = dualPane ? "單頁" : "雙頁";
}

$("#dock").onclick = function(e) {
  var b = e.target.closest("button");
  if (b) showTab(b.dataset.tab);
};
$("#composer").onsubmit = function(e) { e.preventDefault(); send(input.value); };
$("#chips").onclick = function(e) {
  var b = e.target.closest("button");
  if (b) send(b.dataset.q);
};
$("#budgetInput").onchange = function() {
  budget = Number($("#budgetInput").value || 0);
  saveLocal("kotau_budget", budget);
  renderChart();
};
$("#micBtn").onclick = function() { recordOrStop(); };

var recorder = null;
var chunks = [];

async function recordOrStop() {
  if (recorder && recorder.state === "recording") {
    recorder.stop();
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    browserStt();
    return;
  }
  try {
    var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = function(ev) { if (ev.data.size) chunks.push(ev.data); };
    recorder.onstop = async function() {
      stream.getTracks().forEach(function(t) { t.stop(); });
      $("#micBtn").textContent = "🎤";
      var blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      var text = await transcribeBlob(blob);
      if (text) send(text);
      else browserStt();
    };
    recorder.start();
    $("#micBtn").textContent = "⏹";
    addMsg("bot", "錄緊。再擊一次麥克風就停，交伴 SenseVoice。");
  } catch (e) {
    browserStt();
  }
}

async function transcribeBlob(blob) {
  try {
    var body = new FormData();
    body.append("file", blob, "speech.webm");
    var r = await fetch(API + "/api/transcribe", { method: "POST", body: body });
    if (!r.ok) return "";
    var data = await r.json();
    if (data.ok && data.text) {
      addMsg("bot", "SenseVoice 聽到：" + data.text);
      return data.text;
    }
  } catch (e) { /* offline or no model */ }
  return "";
}

function browserStt() {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { addMsg("bot", "後端未裝 SenseVoice，瀏覽器又未支援語音。可以打字。"); return; }
  addMsg("bot", "SenseVoice 未開，暫時用瀏覽器語音。粵語可能被改成書面語。");
  var rec = new SR();
  rec.lang = "zh-HK";
  rec.onresult = function(ev) { input.value = ev.results[0][0].transcript; send(input.value); };
  rec.onerror = function() { addMsg("bot", "聽唔到。試下再擊一次，或者打字。"); };
  rec.start();
}

function openPrefs() {
  $("#prefTransport").value = prefs.transport || "港鐵";
  $("#prefPurpose").value = prefs.transport_purpose || "";
  $("#prefPay").value = prefs.payment || "Octopus";
  $("#sheetBack").hidden = false;
}

$("#gearBtn").onclick = openPrefs;
$("#prefClose").onclick = function() { $("#sheetBack").hidden = true; };
$("#prefSheet").onsubmit = function(e) {
  e.preventDefault();
  prefs = {
    transport: $("#prefTransport").value,
    transport_purpose: $("#prefPurpose").value,
    payment: $("#prefPay").value,
  };
  saveLocal("kotau_prefs", prefs);
  $("#sheetBack").hidden = true;
  addMsg("bot", "喜好已儲存。");
};

$("#editClose").onclick = function() { $("#editBack").hidden = true; };
$("#editForm").onsubmit = function(e) {
  e.preventDefault();
  var sheet = $("#editSheet");
  var id = sheet.dataset.id;
  var data = {};
  sheet.querySelectorAll("input,select").forEach(function(el) { data[el.name] = el.value; });
  data.amount = data.amount === "" ? null : Number(data.amount);
  data.channel = data.channel === "未設定" ? null : data.channel;
  data.splits = parseSplit(data.split_with);
  data.split_with = splitsToText(data.splits);
  updateTxn(id, data);
  $("#editBack").hidden = true;
};

var searchInput = $("#searchInput");
if (searchInput) {
  searchInput.oninput = function() {
    searchTerm = searchInput.value;
    renderHistory();
  };
}

var monthSelect = $("#monthSelect");
if (monthSelect) {
  monthSelect.onchange = function() {
    selectedMonth = monthSelect.value;
    renderChart();
  };
}

var dualBtn = $("#dualPaneBtn");
if (dualBtn) {
  dualBtn.onclick = function() {
    if (!dualPane) {
      if (!confirm("切換去雙頁查看？")) return;
      dualPane = true;
    } else {
      dualPane = false;
    }
    saveLocal("kotau_dual_pane", dualPane);
    applyDualPane();
    if (dualPane) showTab("chat");
  };
}

var exportBtn = $("#exportBtn");
if (exportBtn) {
  exportBtn.onclick = function() {
    if (!txns.length) return addMsg("bot", "未有記錄可以匯出。");
    var headers = ["日期", "金額", "貨幣", "商戶", "畀邊個", "用途", "類別", "支付", "AA拆帳", "原文"];
    var rows = txns.map(function(t) {
      return [
        t.created_at ? new Date(t.created_at).toLocaleString("zh-HK") : "",
        t.amount ?? "", t.currency || "HKD", t.merchant || "", t.counterparty || "",
        t.purpose || "", CAT_LABEL[t.category] || t.category, t.payment_method || "", t.split_with || "", t.raw_text || ""
      ];
    });
    var csv = [headers].concat(rows).map(function(r) {
      return r.map(function(c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(",");
    }).join("\n");
    var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "kotau_" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
    addMsg("bot", "已匯出 CSV。");
  };
}

applyDualPane();
renderHistory();
renderChart();
addMsg("bot", "你好。講「今日搭車用咗 30 蚊」，如果右上角喜好設咗港鐵，確認卡會預填交通工具同用途。擊入帳之後先出現嘅「歷史」。");

// Text size
(function() {
  var slider = document.getElementById("sizeSlider");
  var preview = document.getElementById("sizePreview");
  if (!slider) return;
  function apply(v) {
    document.documentElement.style.fontSize = v + "px";
    if (preview) preview.style.fontSize = v + "px";
    localStorage.setItem("kotau_font", v);
  }
  slider.oninput = function() { apply(slider.value); };
  var down = document.getElementById("sizeDown");
  var up = document.getElementById("sizeUp");
  if (down) down.onclick = function() { slider.value = Math.max(13, +slider.value - 1); apply(slider.value); };
  if (up) up.onclick = function() { slider.value = Math.min(20, +slider.value + 1); apply(slider.value); };
  var saved = localStorage.getItem("kotau_font");
  if (saved) { slider.value = saved; apply(saved); }
})();

// Home pie + recent
function renderHome() {
  var month = monthTxns(selectedMonth);
  var total = month.reduce(function(s, t) { return s + Number(t.amount || 0); }, 0);
  var el = document.getElementById("monthTotal");
  if (el) el.textContent = total.toFixed(0);
  var catMap = {};
  month.forEach(function(t) {
    var c = t.category || "Others";
    catMap[c] = (catMap[c] || 0) + Number(t.amount || 0);
  });
  var data = Object.keys(catMap).map(function(c) { return { name: CAT_LABEL[c] || c, value: catMap[c], color: CAT_COLOR[c] || "#999" }; });
  var sum = data.reduce(function(s, d) { return s + d.value; }, 0) || 1;
  var svg = document.getElementById("pieSvg");
  var legend = document.getElementById("pieLegend");
  if (svg && data.length) {
    var acc = 0, r = 70, cx = 80, cy = 80, paths = "";
    data.forEach(function(d) {
      var a1 = (acc / sum) * Math.PI * 2 - Math.PI / 2;
      acc += d.value;
      var a2 = (acc / sum) * Math.PI * 2 - Math.PI / 2;
      var large = (a2 - a1) > Math.PI ? 1 : 0;
      var x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      var x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      paths += '<path d="M' + cx + ',' + cy + ' L' + x1 + ',' + y1 + ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' + x2 + ',' + y2 + ' Z" fill="' + d.color + '"/>';
    });
    svg.innerHTML = paths;
    if (legend) legend.innerHTML = data.map(function(d) { return '<span><i style="background:' + d.color + '"></i>' + d.name + ' ' + (d.value/sum*100).toFixed(0) + '%</span>'; }).join("");
  }
  var recent = document.getElementById("recentList");
  if (recent) recent.innerHTML = month.slice(0, 5).map(function(t) {
    return '<div class="row"><div><b>' + titleOf(t) + '</b><small>' + (t.payment_method || "") + ' · ' + (CAT_LABEL[t.category] || "") + '</small><small>' + relativeDate(t.created_at) + '</small></div><div class="amt">HKD ' + (t.amount || 0) + '</div></div>';
  }).join("") || '<p class="hint" style="padding:16px">未有記錄。</p>';
  var tips = document.getElementById("tipsList");
  if (tips) {
    var tipsHtml = "";
    if (total > budget) tipsHtml += '<div class="tip">本月已超支，建議先檢視大額項目。</div>';
    if ((catMap["Food & Dining"] || 0) > total * 0.25) tipsHtml += '<div class="tip">飲食佔比較高，可考慮多喺屋企煮，或設定每餐上限。</div>';
    if ((catMap["Transport"] || 0) > 0) tipsHtml += '<div class="tip">短途可改用八達通優惠或步行，慳交通費。</div>';
    if ((catMap["Transfer"] || 0) > total * 0.3) tipsHtml += '<div class="tip">轉帳／過數金額較大，確認係必要支出。</div>';
    tipsHtml += '<div class="tip">有 AA 未還清，可提醒朋友盡快還。</div>';
    tipsHtml += '<div class="tip">定期睇統計報告，掌握每月開支分佈。</div>';
    if (!tipsHtml) tipsHtml = '<div class="tip">開支正常，繼續保持。</div>';
    tips.innerHTML = tipsHtml;
  }
}
var origRender = renderChart;
renderChart = function() { origRender(); renderHome(); };
renderHome();
