from __future__ import annotations
import json, os, uuid
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from extractor import extract
try:
    from supabase_client import supabase_admin
except ImportError:
    supabase_admin = None

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
    counterparty: str | None = None
    purpose: str | None = None
    channel: str | None = None


def _sensevoice_ready() -> bool:
    try:
        import funasr  # noqa: F401
        return True
    except ImportError:
        return False


@app.get("/api/health")
def health():
    cfg = _config()
    key = bool(os.getenv("DEEPSEEK_API_KEY"))
    return {
        "ok": True,
        "ner": cfg.get("ner_runtime_now", "rule_based_v0"),
        "ner_target": cfg.get("ner_target_model"),
        "chat": "deepseek-chat" if key else "local_fallback",
        "deepseek_key_present": key,
        "stt": "sensevoice" if _sensevoice_ready() else "browser_fallback",
    }


@app.get("/api/model")
def model_info():
    return _config()


@app.post("/api/transcribe")
async def api_transcribe(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        return {"ok": False, "error": "empty audio"}
    text, engine = _transcribe(data, file.filename or "audio.webm")
    if text is None:
        return {"ok": False, "error": "sensevoice_unavailable", "engine": "none"}
    return {"ok": True, "text": text, "engine": engine}


def _transcribe(data: bytes, filename: str):
    if not _sensevoice_ready():
        return None, "none"
    import tempfile
    suffix = Path(filename).suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        path = tmp.name
    try:
        from funasr import AutoModel
        model = AutoModel(model="iic/SenseVoiceSmall", disable_update=True)
        res = model.generate(input=path, cache={}, language="yue", use_itn=True)
        raw = (res[0].get("text") or "").strip()
        try:
            from funasr.utils.postprocess_utils import rich_transcription_postprocess
            raw = rich_transcription_postprocess(raw)
        except Exception:
            pass
        return raw, "sensevoice"
    except Exception:
        return None, "none"
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


@app.post("/api/extract")
def api_extract(body: TextIn):
    return extract(body.text)


@app.post("/api/chat")
async def api_chat(body: ChatIn):
    parsed = extract(body.text)
    looks_like_expense = parsed.get("amount") is not None or any(
        w in body.text for w in ("蚊", "畀", "食", "搭", "PayMe", "FPS", "八達通")
    )
    reply = _local_reply(body.text, parsed, looks_like_expense)
    if os.getenv("DEEPSEEK_API_KEY") and not looks_like_expense:
        try:
            reply = await _deepseek_reply(body.text, body.history)
        except Exception as exc:
            reply = _local_reply(body.text, parsed, looks_like_expense) + f"\n(DeepSeek error: {exc.__class__.__name__})"
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
    # Supabase sync disabled until login system is ready
    # if supabase_admin:
    #     try:
    #         sb_data = {...}
    #         supabase_admin.table("transactions").insert(sb_data).execute()
    #     except Exception as e:
    #         print(f"Supabase sync failed: {e}")
    return item


@app.delete("/api/transactions/{txn_id}")
def del_txn(txn_id: str):
    _save_txns([r for r in _load_txns() if r.get("id") != txn_id])
    return {"ok": True}


def _local_reply(text, parsed, expense):
    if expense and parsed.get("amount") is not None:
        mer = parsed.get("merchant") or parsed.get("channel") or "未命名"
        pay = parsed.get("payment_method") or "未設定支付"
        return f"估：{parsed['currency']} {parsed['amount']} / {mer} / {parsed['category']} / {pay}。核對確認卡再入帳。"
    if expense:
        return "呢句似記帳，但未見到金額。"
    return "可以講開支，或者去「圖表」睇本月分佈。喜好喺右上角齒輪。"


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
        r = await client.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"model": "deepseek-chat", "messages": messages, "temperature": 0.4},
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


# ---------- Supabase routes (Chan Yin Hei) — optional ----------
try:
    from routers import users as sb_users, transactions as sb_txns, lookup as sb_lookup
    app.include_router(sb_users.router)
    app.include_router(sb_txns.router)
    app.include_router(sb_lookup.router)
except Exception:
    pass  # no supabase key / package → local mode only


frontend_dir = ROOT / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
