from fastapi import APIRouter, Depends, HTTPException
from schemas import TransactionCreate
from auth import get_current_user
from supabase_client import supabase

router = APIRouter(prefix="/api/supabase/transactions", tags=["Supabase Transactions"])


@router.post("/")
def create_transaction(tx_in: TransactionCreate, user=Depends(get_current_user)):
    data = tx_in.model_dump()
    data["user_id"] = user.id

    profile = (
        supabase.table("profiles")
        .select("store_raw_text")
        .eq("id", user.id)
        .single()
        .execute()
    )
    if profile.data and not profile.data.get("store_raw_text"):
        data["raw_text"] = None

    res = supabase.table("transactions").insert(data).execute()
    return res.data


@router.get("/")
def list_transactions(user=Depends(get_current_user)):
    res = (
        supabase.table("transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("transaction_date", desc=True)
        .execute()
    )
    return res.data


@router.delete("/{tx_id}")
def delete_transaction(tx_id: str, user=Depends(get_current_user)):
    res = (
        supabase.table("transactions")
        .delete()
        .eq("id", tx_id)
        .eq("user_id", user.id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"ok": True}