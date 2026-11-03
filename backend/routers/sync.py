from fastapi import APIRouter, Depends, HTTPException
from schemas import TransactionCreate
from auth import get_current_user
from supabase_client import supabase
from datetime import datetime, timezone
from typing import List

router = APIRouter(prefix="/api/supabase/sync", tags=["Supabase Sync"])

# ==========================================
# 1. Pull（下載）：PWA 打開時，拉取雲端最新資料
# ==========================================
@router.get("/pull")
def pull_data(user=Depends(get_current_user)):
    res = (
        supabase.table("transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("transaction_date", desc=True)
        .execute()
    )
    return res.data

# ==========================================
# 2. Push（上傳）：PWA 把離線存的資料一次傳上來
# ==========================================
@router.post("/push")
def push_data(tx_list: List[TransactionCreate], user=Depends(get_current_user)):
    if not tx_list:
        return {"message": "No data to sync", "count": 0}

    profile = (
        supabase.table("profiles")
        .select("store_raw_text")
        .eq("id", user.id)
        .single()
        .execute()
    )
    allow_raw_text = profile.data.get("store_raw_text", False) if profile.data else False

    records_to_insert = []
    for tx in tx_list:
        data = tx.model_dump()
        data["user_id"] = user.id
        data["is_synced"] = True
        
        if not allow_raw_text:
            data["raw_text"] = None
            
        records_to_insert.append(data)

    try:
        res = supabase.table("transactions").insert(records_to_insert).execute()
        return {"message": "Sync successful", "count": len(res.data), "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# 3. Log（記錄）：PWA 每次同步時，記錄設備和時間
# ==========================================
@router.post("/log")
def log_sync(user=Depends(get_current_user)):
    try:
        res = supabase.table("sync_logs").insert({
            "user_id": user.id,
            "device_id": "web-pwa",
            "device_name": "Web Browser",
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
            "status": "success"
        }).execute()
        return {"message": "Sync log recorded", "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))