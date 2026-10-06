from fastapi import APIRouter
from supabase_client import supabase

router = APIRouter(prefix="/api/supabase/lookup", tags=["Supabase Lookup"])


@router.get("/categories")
def get_categories():
    res = supabase.table("categories").select("*").execute()
    return res.data


@router.get("/payment-methods")
def get_payment_methods():
    res = supabase.table("payment_methods").select("*").execute()
    return res.data