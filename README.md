# 口頭帳 Budgeting System

HKIIT / IVE Tuen Mun FYP — Title 4  
On-Device SLM for Code-Switching Financial NER + Intelligent Budgeting

## 而家做到哪

- 網頁 PWA（唔使分開 Android / iOS）
- 傾偉式入帳 + 確認卡（5-tuple + original_amount / discount / type / certainty）
- 帳本、每月預算
- 瀏覽器粵語語音（Chrome `zh-HK`）
- NER：**規則引擎 v0**（等 Qwen-2.5 fine-tune 完再換）
- Chat：有 `DEEPSEEK_API_KEY` 就用 **deepseek-chat 暫時頂住**；冇 key 都有本地回覆

## 模型

| 用途 | 而家 | FYP 最終 |
|---|---|---|
| 口語 → JSON | `rule_based_v0` | QLoRA **Qwen-2.5-1.5B** |
| 答理財問題 | DeepSeek Chat（可選） | 自訓 SLM |

DeepSeek 只係 demo 傾偉，唔係最終模型。

## 開機

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

http://127.0.0.1:8000/
