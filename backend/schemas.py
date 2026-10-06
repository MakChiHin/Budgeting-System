from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


# ---------- User ----------
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    display_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserRead(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None
    preferred_currency: str = "HKD"
    store_raw_text: bool = False


# ---------- Transaction ----------
class TransactionCreate(BaseModel):
    amount: float
    currency: str = "HKD"
    merchant: Optional[str] = None
    category_id: Optional[str] = None
    payment_method_id: Optional[str] = None
    raw_text: Optional[str] = None
    input_type: str = "text"   # "text" or "voice"


class TransactionRead(TransactionCreate):
    id: str
    user_id: str
    transaction_date: datetime
    created_at: datetime
    is_synced: bool


# ---------- Lookup ----------
class CategoryRead(BaseModel):
    id: str
    name: str
    icon: Optional[str] = None


class PaymentMethodRead(BaseModel):
    id: str
    name: str
    icon: Optional[str] = None