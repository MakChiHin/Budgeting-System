import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_Publishable_KEY")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_Secret_KEY")

if not SUPABASE_URL or not SUPABASE_PUBLISHABLE_KEY:
    raise RuntimeError(
        "Missing SUPABASE_URL or SUPABASE_Publishable_KEY in .env"
    )

# 给一般用户操作用（受 RLS 限制）
supabase: Client = create_client(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

# 给后端管理用（绕过 RLS，小心使用）
supabase_admin: Client = (
    create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)
    if SUPABASE_SECRET_KEY
    else None
)