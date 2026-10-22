import os
import httpx
from dotenv import load_dotenv

# 自動載入同目錄下 .env 檔案中的環境變數
load_dotenv()

HF_TOKEN = os.getenv("HF_TOKEN")
MODEL_ID = "fargou/qwen2.5-7b-cantonese-billing"
API_URL = f"https://huggingface.co{MODEL_ID}"

async def ask_cantonese_ai(user_raw_text: str) -> str:
    """
    將用戶輸入的廣東話 Raw Text 發送至 Hugging Face Inference API 並安全解析回覆
    """
    if not HF_TOKEN:
        print("⚠️ 錯誤：後端未偵測到 HF_TOKEN 環境變數，請檢查 .env 檔案。")
        return "對唔住，系統設定出錯（未偵測到 API 密鑰）。"

    # 構造符合 Qwen 2.5 Chat 結構的 Prompt 格式
    prompt = (
        f"<|im_start|>system\n"
        f"你是一個廣東話理財記賬助理，負責分析用戶的記賬意圖並給予回覆。\n"
        f"<|im_end|>\n"
        f"<|im_start|>user\n"
        f"{user_raw_text}\n"
        f"<|im_end|>\n"
        f"<|im_start|>assistant\n"
    )

    headers = {
        "Authorization": f"Bearer {HF_TOKEN}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "inputs": prompt,
        "parameters": {
            "max_new_tokens": 150,  
            "temperature": 0.3,     
            "return_full_text": False  # 告訴 HF 不要包含前面的 prompt
        }
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(API_URL, headers=headers, json=payload)
            
            # 如果模型正在載入 (503 狀態碼)
            if response.status_code == 503:
                return "AI 模型仲下載緊入雲端記憶體，請等埋呢幾秒再試吓！"
                
            response.raise_for_status()
            result = response.json()
            
            print(f"DEBUG - HF Raw Response: {result}") # 這行會在 VS Code 終端機印出原始 HF 回應，方便除錯
            
            ai_reply = ""
            
            # === 【關鍵修正】強大的多重結構安全解析 ===
            if isinstance(result, list) and len(result) > 0:
                # 處理最標準的 [{"generated_text": "..."}] 格式
                first_item = result[0]
                if isinstance(first_item, dict):
                    ai_reply = first_item.get("generated_text", "")
            elif isinstance(result, dict):
                # 備用處理 {"generated_text": "..."} 格式
                ai_reply = result.get("generated_text", "")
            
            if not ai_reply:
                return "我一時間聽唔明，可以再講多次嗎？(未能在回應中提取文字)"
            
            # 清洗並過濾可能殘留的 Chat 結束符號與前後空格
            cleaned_reply = ai_reply.split("<|im_end|>")[0].strip()
            return cleaned_reply if cleaned_reply else "我一時間聽唔明，可以再講多次嗎？"

        except httpx.HTTPStatusError as e:
            print(f"Hugging Face API 錯誤：{e.response.status_code} - {e.response.text}")
            return f"呼叫 AI 時發生錯誤 (HTTP {e.response.status_code})，請稍後再試。"
        except Exception as e:
            # 這裡印出詳細的 Python 報錯到 VS Code 終端機
            print(f"後端連線或解析失敗，具體原因：{type(e).__name__} - {e}")
            return "連唔到 AI 伺服器，請檢查網絡。"
