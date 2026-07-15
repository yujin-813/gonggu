#!/usr/bin/env python3
"""브랜드가 비어 있는 published/ready 공구에 브랜드명을 채워 넣는 백필 스크립트.

구매 페이지 JSON-LD의 brand를 우선 쓰고, 없으면 네이버쇼핑 매칭 결과의
brand/maker를 사용한다. 상태(status/published)는 건드리지 않는다.

사용법: python3 backfill_brand.py
"""
import os
import time
from pathlib import Path

# cron/수동 실행 시 .env.local 이 자동 로드되지 않으므로 직접 주입
_env_file = Path(__file__).parent / ".env.local"
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())

from inpock import load_posts, save_posts, fetch_naver_market_price, fetch_product_info, _guess_brand_from_title  # noqa: E402


def main():
    posts = load_posts()
    targets = [
        p for p in posts
        if p.get("status") in ("published", "ready")
        and not p.get("brand")
        and (p.get("title") or "").strip()
    ]
    print(f"대상: {len(targets)}개")

    updated = 0
    for p in targets:
        brand = None

        purchase_url = p.get("purchase_url") or p.get("store_url")
        domain = p.get("store_domain")
        if purchase_url and domain:
            pi, _debug = fetch_product_info(purchase_url, domain)
            brand = pi.get("brand")

        if not brand:
            market = fetch_naver_market_price(p["title"], p.get("price") or None)
            brand = market.get("brand")

        if not brand:
            brand = _guess_brand_from_title(p["title"])

        if brand:
            p["brand"] = brand
            updated += 1
            print(f"  ✓ {p['title'][:40]} → {brand}")
        else:
            print(f"  · {p['title'][:40]} → 못 찾음")
        time.sleep(0.2)

    save_posts(posts)
    print(f"완료: {updated}개 갱신")


if __name__ == "__main__":
    main()
