import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_Publishable_KEY")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_Secret_KEY")

# Optional. If not set, local JSON + browser storage still works.
supabase: Client | None = None
supabase_admin: Client | None = None

if SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    if SUPABASE_SECRET_KEY:
        supabase_admin = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)
