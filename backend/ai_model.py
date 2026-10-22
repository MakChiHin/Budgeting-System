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
    將用戶輸入的廣東話 Raw Text 發送至 Hugging Face Inference API
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
            "max_new_tokens": 150,  # 限制生成長度，防止 AI 自言自語太長
            "temperature": 0.3,     # 降低溫度讓理財/記賬回覆更精準、穩定
            "return_full_text": False  # 告訴 HF 不要把我傳過去的 prompt 重複吐回來
        }
    }

    # 使用異步 httpx 進行發送，不阻塞伺服器其他運作
    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            response = await client.post(API_URL, headers=headers, json=payload)
            
            # 如果 Hugging Face 模型正在載入 (503 狀態碼碼)，API 會返回估計載入時間
            if response.status_code == 503:
                return "AI 模型仲下載緊入雲端記憶體，請等埋呢幾秒再試吓！"
                
            response.raise_for_status()
            result = response.json()
            
            # 解析 Hugging Face 返回的資料結構
            ai_reply = ""
            if isinstance(result, list) and len(result) > 0:
                ai_reply = result[0].get("generated_text", "")
            elif isinstance(result, dict) and "generated_text" in result:
                ai_reply = result.get("generated_text", "")
            else:
                return "我一時間聽唔明，可以再講多次嗎？"
            
            # 清洗並過濾可能殘留的 Chat 結束符號
            cleaned_reply = ai_reply.split("<|im_end|>")[0].strip()
            return cleaned_reply if cleaned_reply else "我一時間聽唔明，可以再講多次嗎？"

        except httpx.HTTPStatusError as e:
            print(f"Hugging Face API 錯誤：{e.response.text}")
            return "呼叫 AI 時發生錯誤，請稍後再試。"
        except Exception as e:
            print(f"連線失敗：{e}")
            return "連唔到 AI 伺服器，請檢查網絡。"
