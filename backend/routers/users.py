from fastapi import APIRouter, HTTPException
from schemas import UserRegister, UserLogin, UserRead
from supabase_client import supabase

router = APIRouter(prefix="/api/supabase/users", tags=["Supabase Users"])


@router.post("/register", response_model=UserRead)
def register(user_in: UserRegister):
    try:
        res = supabase.auth.sign_up({
            "email": user_in.email,
            "password": user_in.password,
            "options": {"data": {"display_name": user_in.display_name}},
        })
        if not res.user:
            raise HTTPException(status_code=400, detail="Registration failed")
        return UserRead(
            id=res.user.id,
            email=res.user.email,
            display_name=user_in.display_name,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login")
def login(user_in: UserLogin):
    try:
        res = supabase.auth.sign_in_with_password({
            "email": user_in.email,
            "password": user_in.password,
        })
        if not res.session:
            raise HTTPException(status_code=401, detail="Login failed")
        return {
            "access_token": res.session.access_token,
            "refresh_token": res.session.refresh_token,
            "user_id": res.user.id,
            "email": res.user.email,
        }
    except Exception:
        raise HTTPException(status_code=401, detail="Incorrect email or password")


@router.post("/logout")
def logout():
    try:
        supabase.auth.sign_out()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))