from __future__ import annotations
import json, os, uuid
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from extractor import extract

load_dotenv()
ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)
TXN_FILE = DATA / "transactions.json"
CFG_FILE = Path(__file__).resolve().parent / "model_config.json"

app = FastAPI(title="Kotau Budgeting System")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def _load_txns():
    if not TXN_FILE.exists():
        return []
    try:
        return json.loads(TXN_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []

def _save_txns(rows):
    TXN_FILE.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

def _config():
    if CFG_FILE.exists():
        return json.loads(CFG_FILE.read_text(encoding="utf-8"))
    return {}

class TextIn(BaseModel):
    text: str

class ChatIn(BaseModel):
    text: str
    history: list[dict] = Field(default_factory=list)

class TxnIn(BaseModel):
    raw_text: str | None = None
    amount: float | None = None
    currency: str = "HKD"
    merchant: str | None = None
    category: str = "Others"
    payment_method: str | None = None
    original_amount: float | None = None
    discount_amount: float | None = 0
    transaction_type: str = "purchase"
    amount_certainty: str = "exact"

@app.get("/api/health")
def health():
    cfg = _config()
    key = bool(os.getenv("DEEPSEEK_API_KEY"))
    return {"ok": True, "ner": cfg.get("ner_runtime_now", "rule_based_v0"), "ner_target": cfg.get("ner_target_model"), "chat": "deepseek-chat" if key else "local_fallback", "deepseek_key_present": key}

@app.get("/api/model")
def model_info():
    return _config()

@app.post("/api/extract")
def api_extract(body: TextIn):
    return extract(body.text)

@app.post("/api/chat")
async def api_chat(body: ChatIn):
    parsed = extract(body.text)
    looks_like_expense = parsed.get("amount") is not None or any(w in body.text for w in ("\u868a", "\u754c", "\u98df", "\u642d", "PayMe", "FPS", "\u516b\u9054\u901a"))
    reply = _local_reply(body.text, parsed, looks_like_expense)
    if os.getenv("DEEPSEEK_API_KEY") and not looks_like_expense:
        try:
            reply = await _deepseek_reply(body.text, body.history)
        except Exception as exc:
            reply = _local_reply(body.text, parsed, looks_like_expense) + "\n(DeepSeek error: " + exc.__class__.__name__ + ")"
    return {"reply": reply, "extraction": parsed if looks_like_expense else None}

@app.get("/api/transactions")
def list_txns():
    return _load_txns()

@app.post("/api/transactions")
def add_txn(body: TxnIn):
    rows = _load_txns()
    item = body.model_dump()
    item["id"] = str(uuid.uuid4())
    item["created_at"] = datetime.now(timezone.utc).isoformat()
    rows.insert(0, item)
    _save_txns(rows)
    return item

@app.delete("/api/transactions/{txn_id}")
def del_txn(txn_id: str):
    _save_txns([r for r in _load_txns() if r.get("id") != txn_id])
    return {"ok": True}

def _local_reply(text, parsed, expense):
    if expense and parsed.get("amount") is not None:
        mer = parsed.get("merchant") or "unknown merchant"
        pay = parsed.get("payment_method") or "unknown pay"
        return f"Guess: {parsed['currency']} {parsed['amount']} / {mer} / {parsed['category']} / {pay}. Confirm the card to save."
    if expense:
        return "Looks like an expense, but no amount found."
    return "Kotau assistant. Say an expense like 'old mak 40 something dollars', or ask about budget/privacy. NER is rule-based for now. Final FYP model is self-trained Qwen-2.5-1.5B."

async def _deepseek_reply(text, history):
    import httpx
    key = os.getenv("DEEPSEEK_API_KEY")
    messages = [{"role": "system", "content": "You are a Hong Kong budgeting assistant. Reply in casual Cantonese. Do not give investment guarantees."}]
    for h in history[-8:]:
        role = h.get("role") or "user"
        if role not in ("user", "assistant"):
            role = "user"
        messages.append({"role": role, "content": str(h.get("content", ""))[:500]})
    messages.append({"role": "user", "content": text})
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post("https://api.deepseek.com/v1/chat/completions", headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, json={"model": "deepseek-chat", "messages": messages, "temperature": 0.4})
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]

frontend_dir = ROOT / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
