from __future__ import annotations
import re
from typing import Any

CN_NUM = {"\u96f6":0,"\u4e00":1,"\u4e8c":2,"\u5169":2,"\u4e24":2,"\u4e09":3,"\u56db":4,"\u4e94":5,"\u516d":6,"\u4e03":7,"\u516b":8,"\u4e5d":9,"\u5341":10}
MERCHANTS = [
    (r"\u8001\u9ea5|\u9ea5\u7576\u52de|McDonald", "McDonald's (\u8001\u9ea5)", "Food & Dining"),
    (r"\u80af\u5fb7\u57fa|KFC", "KFC", "Food & Dining"),
    (r"Starbucks?|\u661f\u5df4\u514b", "Starbucks", "Food & Dining"),
    (r"\u8336\u8a18|\u8336\u9910\u5ef3", "\u8336\u9910\u5ef3", "Food & Dining"),
    (r"\u9ee8\u9435|\u6e2f\u9435|MTR", "MTR", "Transport"),
    (r"\u7d05\s*van|\u7d05Van", "\u7d05Van", "Transport"),
    (r"\u7da0\s*van|\u7da0Van", "\u7da0Van", "Transport"),
]
PAYMENTS = [
    (r"PayMe|payme", "PayMe"),
    (r"FPS|\u8f49\u6578\u5feb", "FPS"),
    (r"\u516b\u9054\u901a|\u561f\u5497|Octopus", "Octopus"),
    (r"Alipay|\u652f\u4ed8\u5bf6", "AlipayHK"),
    (r"\u4fe1\u7528\u5361|Visa|Master", "Credit Card"),
    (r"\u73fe\u91d1|\u754c\u5497", "Cash"),
]

def _cn_to_int(s: str):
    s = s.strip()
    if not s:
        return None
    total = 0
    if "\u5343" in s:
        a, s = s.split("\u5343", 1)
        total += (CN_NUM.get(a, 1) if a else 1) * 1000
    if "\u767e" in s:
        a, s = s.split("\u767e", 1)
        total += (CN_NUM.get(a, 1) if a else 1) * 100
    if s == "\u5341":
        return float(total + 10)
    if s.startswith("\u5341"):
        return float(total + 10 + CN_NUM.get(s[1:], 0))
    if "\u5341" in s:
        a, b = s.split("\u5341", 1)
        return float(total + CN_NUM.get(a, 0) * 10 + (CN_NUM.get(b, 0) if b else 0))
    if s in CN_NUM:
        return float(total + CN_NUM[s])
    return float(total) if total else None

def _parse_amount(text: str):
    if re.search(r"\u5e7e\u591a|\u5514\u8a18\u5f97|\u672a\u77e5", text):
        return None, "unknown"
    m = re.search(r"(\d+)\s*\u868a\s*(\d)", text)
    if m:
        return float(m.group(1)) + float(m.group(2)) / 10.0, "exact"
    m = re.search(r"(\d+(?:\.\d+)?)\s*(\u868a|\u584a|\u5143|HKD|\u6e2f\u5e63)?", text, re.I)
    approx = bool(re.search(r"\u5e7e|\u5de6\u53f3|\u5927\u6982|\u7d04", text))
    if m:
        val = float(m.group(1))
        if "\u5e7e" in text and re.search(rf"{m.group(1)}\s*\u5e7e", text):
            return val + 5.0, "approximate"
        return val, "approximate" if approx else "exact"
    m = re.search(r"([\u4e00\u4e8c\u5169\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+)\s*\u8349", text)
    if m:
        n = _cn_to_int(m.group(1))
        if n is not None:
            return n * 10.0, "exact"
    m = re.search(r"\u5eff\s*([\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d])?\s*\u868a", text)
    if m:
        extra = CN_NUM.get(m.group(1), 0) if m.group(1) else 0
        return 20.0 + extra, "exact"
    m = re.search(r"([\u4e00\u4e8c\u5169\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343]+)\s*(\u5e7e)?\s*\u868a", text)
    if m:
        base = _cn_to_int(m.group(1))
        if base is not None:
            if m.group(2):
                return base + 5.0, "approximate"
            return base, "exact"
    return None, "unknown"

def extract(text: str) -> dict[str, Any]:
    text = (text or "").strip()
    amount, certainty = _parse_amount(text)
    merchant = None
    category = "Others"
    for pat, name, cat in MERCHANTS:
        if re.search(pat, text, re.I):
            merchant = name
            category = cat
            break
    payment = None
    for pat, name in PAYMENTS:
        if re.search(pat, text, re.I):
            payment = name
            break
    if payment is None and re.search(r"\u754c\u5497|\u73fe\u91d1", text):
        payment = "Cash"
    if category == "Others":
        if re.search(r"\u98df|\u9910|\u98f2|\u8336|\u98ef", text):
            category = "Food & Dining"
        elif re.search(r"\u642d|\u8eca|van|\u7684\u58eb", text, re.I):
            category = "Transport"
    txn_type = "purchase"
    if re.search(r"\u9000", text):
        txn_type = "refund"
    elif re.search(r"\u8f49|\u904e\u5497|\u593e\u9322", text):
        txn_type = "transfer"
    return {
        "raw_text": text,
        "amount": amount,
        "currency": "HKD",
        "merchant": merchant,
        "category": category,
        "payment_method": payment,
        "original_amount": amount,
        "discount_amount": 0.0,
        "transaction_type": txn_type,
        "amount_certainty": certainty,
        "extractor": "rule_based_v0",
    }
