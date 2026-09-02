#!/usr/bin/env python3
"""
쿠팡 파트너스 Open API 클라이언트 — 서명(HMAC) 로직만 분리.

네이버 쇼핑 API와 달리 요청마다 HMAC-SHA256 서명이 필요하다(단순 헤더 인증이 아님).
이 모듈은 서명 + 상품 검색 하나만 담당한다 — 나중에 딥링크 생성 등 다른 쿠팡 API를
쓰게 되더라도 이 모듈의 _sign()/_request() 만 재사용하면 된다.

크리덴셜(COUPANG_ACCESS_KEY/COUPANG_SECRET_KEY)이 없으면 모든 함수가 조용히 빈 값을
반환한다 — 네이버 함수가 크리덴셜 없을 때 {} 를 반환하던 것과 같은 안전한 기본값이다.
"""

import hashlib
import hmac
import os
from datetime import datetime, timezone
from urllib.parse import urlencode

import requests

_ACCESS_KEY = os.environ.get("COUPANG_ACCESS_KEY", "")
_SECRET_KEY = os.environ.get("COUPANG_SECRET_KEY", "")

_DOMAIN = "https://api-gateway.coupang.com"
_SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/v1/products/search"


def _signed_date():
    return datetime.now(timezone.utc).strftime("%y%m%dT%H%M%SZ")


def _sign(method, path, query):
    """쿠팡 문서의 서명 방식: datetime + method + path + query 를 secret key로 HMAC-SHA256.
    Authorization 헤더: CEA algorithm=HmacSHA256, access-key=..., signed-date=..., signature=..."""
    dt = _signed_date()
    message = dt + method + path + query
    signature = hmac.new(_SECRET_KEY.encode(), message.encode(), hashlib.sha256).hexdigest()
    return (
        f"CEA algorithm=HmacSHA256, access-key={_ACCESS_KEY}, "
        f"signed-date={dt}, signature={signature}"
    )


def search_products(keyword, limit=5):
    """상품명으로 쿠팡 상품을 검색해 [{"productName", "productPrice", "productUrl"}, ...] 반환.
    크리덴셜 미설정이거나 요청 실패 시 빈 리스트 — 한 상품 조회 실패가 전체 수집을 막으면 안 된다."""
    if not _ACCESS_KEY or not _SECRET_KEY:
        return []
    query = urlencode({"keyword": keyword, "limit": limit})
    try:
        r = requests.get(
            _DOMAIN + _SEARCH_PATH,
            params={"keyword": keyword, "limit": limit},
            headers={
                "Authorization": _sign("GET", _SEARCH_PATH, query),
                "Content-Type": "application/json",
            },
            timeout=5,
        )
        if r.status_code != 200:
            return []
        data = r.json().get("data") or {}
        return data.get("productData") or []
    except Exception:
        return []
