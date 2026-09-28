# 口頭帳 Budgeting System

HKIIT / IVE Tuen Mun FYP — Title 4  
On-Device SLM for Code-Switching Financial NER + Intelligent Budgeting

Repo：https://github.com/MakChiHin/Budgeting-System

---

## 組員點樣開嚟測試（Windows）

1. 安裝 [Python 3.11+](https://www.python.org/downloads/)（安裝時剜「Add Python to PATH」）
2. 開 **PowerShell**：

```powershell
git clone https://github.com/MakChiHin/Budgeting-System.git
cd Budgeting-System
git pull
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

3. 見到 `Uvicorn running on http://127.0.0.1:8000` 之後，用 Chrome 開：

http://127.0.0.1:8000/

4. 如果畫面仲係舊版：Chrome 撴 **Ctrl+F5**。仍然舊就 F12 → Application → Service Workers → Unregister，再 Refresh。

**唔好淨係打 `uvicorn`。** Windows 多數入唔到 PATH，一定要用：

```powershell
python -m uvicorn main:app --reload --port 8000
```

如果 `python` 都唔識，改用：

```powershell
py -3.11 -m pip install -r requirements.txt
py -3.11 -m uvicorn main:app --reload --port 8000
```

DeepSeek 可選。複製 `backend/.env.example` 做 `backend/.env`，填 `DEEPSEEK_API_KEY=`。冇 key 都測到記帳。

唔開後端都可以雙擊 `frontend/index.html`，帳會存瀏覽器 localStorage。

Mac / Linux 同樣用 `python -m uvicorn ...`。

---

## 而家做到哪

- 同一個網站：電腦左右分欄（傾偉 + 預算／帳本），手機三個 tab
- 傾偉入帳 + 確認卡（amount / currency / merchant / category / payment_method + original_amount / discount / type / certainty）
- 每月預算同分類統計
- Chrome 粵語語音（`zh-HK`）
- NER：規則引擎 `rule_based_v0`（等 Qwen-2.5 fine-tune 完再換）
- Chat：有 key 用 deepseek-chat 暫時頂；冇 key 用本地回覆

## 模型

| 用途 | 而家 | FYP 最終 |
|---|---|---|
| 口語 → JSON | `rule_based_v0` | 自己 QLoRA 嘅 **Qwen-2.5-1.5B** |
| 答理財問題 | DeepSeek Chat（可選） | 自訓 SLM |

DeepSeek 只係 demo，唔可以當最終模型。

## 組員

- Mak Chi Hin：Frontend / UX / STT
- Tang Wai Kit：語料
- Yiu Tsz Fan：QLoRA + 量化
- Chan Yin Hei：之後接 Supabase
