import os
import httpx
from dotenv import load_dotenv

# 自動載入同目錄下 .env 檔案中的環境變數
load_dotenv()

HF_TOKEN = os.getenv("HF_TOKEN")
MODEL_ID = "fargou/qwen2.5-7b-cantonese-billing"

# 【修正 1】改用 Hugging Face 官方推薦的 OpenAI 相容 Chat Completions 路由
API_URL = "https://router.huggingface.co/v1/chat/completions"

async def ask_cantonese_ai(user_raw_text: str) -> str:
    """
    將用戶輸入的廣東話 Raw Text 發送至 Hugging Face Inference API 並安全解析回覆
    """
    if not HF_TOKEN:
        print("⚠️ 錯誤：後端未偵測到 HF_TOKEN 環境變數，請檢查 .env 檔案。")
        return "對唔住，系統設定出錯（未偵測到 API 密鑰）。"

    # 【修正 2】改用標準的 messages 結構，免去手動拼湊 <|im_start|> 的麻煩，模型會自動處理
    payload = {
        "model": MODEL_ID,
        "messages": [
            {
                "role": "system",
                "content": "你是一個廣東話理財記賬助理，負責分析用戶的記賬意圖並給予回覆。"
            },
            {
                "role": "user",
                "content": user_raw_text
            }
        ],
        "max_tokens": 150,
        "temperature": 0.3
    }

    headers = {
        "Authorization": f"Bearer {HF_TOKEN}",
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(API_URL, headers=headers, json=payload)
            
            # 如果模型正在載入 (503 狀態碼)
            if response.status_code == 503:
                return "AI 模型仲下載緊入雲端記憶體，請等埋呢幾秒再試吓！"
                
            response.raise_for_status()
            result = response.json()
            
            print(f"DEBUG - HF Raw Response: {result}") # 印出原始回應方便除錯
            
            ai_reply = ""
            
            # 【修正 3】適應 OpenAI 相容格式的回應解析 (`choices[0]["message"]["content"]`)
            if isinstance(result, dict) and "choices" in result:
                choices = result["choices"]
                if isinstance(choices, list) and len(choices) > 0:
                    message = choices[0].get("message", {})
                    ai_reply = message.get("content", "")
            
            # 備用：若未來切回舊格式或自定義格式時的相容防護
            elif isinstance(result, list) and len(result) > 0:
                first_item = result[0]
                if isinstance(first_item, dict):
                    ai_reply = first_item.get("generated_text", "")
            elif isinstance(result, dict):
                ai_reply = result.get("generated_text", "")
            
            if not ai_reply:
                return "我一時間聽唔明，可以再講多次嗎？(未能在回應中提取文字)"
            
            # 清洗並過濾可能殘留的前後空格
            cleaned_reply = ai_reply.strip()
            return cleaned_reply if cleaned_reply else "我一時間聽唔明，可以再講多次嗎？"

        except httpx.HTTPStatusError as e:
            # 修正原本字串斷行造成的 SyntaxError
            print(f"Hugging Face API 錯誤：{e.response.status_code}\n{e.response.text}")
            return f"呼叫 AI 時發生錯誤 (HTTP {e.response.status_code})，請稍後再試。"
        except Exception as e:
            # 修正原本字串斷行造成的 SyntaxError
            print(f"後端連線或解析失敗，具體原因：{type(e).__name__}\n{e}")
            return "連唔到 AI 伺服器，請檢查網絡。"