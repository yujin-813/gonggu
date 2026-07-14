#!/usr/bin/env python3
"""이미 공개/공개가능 상태인데 market_price(네이버 최저가)가 없는 공구에
값을 채워 넣는 일회성/재실행 가능한 백필 스크립트.

상태(status/published)는 건드리지 않는다 — 이미 검수·승인된 공구가
가격 비교 결과 때문에 갑자기 화면에서 사라지면 안 되므로, market_price/
market_source만 보강하고 판단은 프론트엔드 dealJudgment에 맡긴다.

사용법: python3 backfill_market_price.py
"""
import os
import time
from pathlib import Path

# cron/수동 실행 시 .env.local 이 자동 로드되지 않으므로 직접 주입
# (collector.py 의 동일 로직과 맞춤 — NAVER_CLIENT_ID/SECRET 미로드 이슈 재발 방지)
_env_file = Path(__file__).parent / ".env.local"
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())

from inpock import load_posts, save_posts, fetch_naver_market_price  # noqa: E402


def main():
    posts = load_posts()
    targets = [
        p for p in posts
        if p.get("status") in ("published", "ready")
        and not p.get("market_price")
        and (p.get("title") or "").strip()
    ]
    print(f"대상: {len(targets)}개")

    updated = 0
    for p in targets:
        market = fetch_naver_market_price(p["title"])
        mp = market.get("market_price")
        if not mp:
            print(f"  · {p['title'][:40]} → 매칭 없음")
            time.sleep(0.2)
            continue

        price = p.get("price") or 0
        if price and mp < price * 0.3:
            # 시세가 판매가의 30% 미만이면 다른 상품과 잘못 매칭됐을 가능성이 높음 — 스킵
            print(f"  · {p['title'][:40]} → 매칭 신뢰도 낮음(스킵): 시세 {mp}원 vs 판매가 {price}원")
            time.sleep(0.2)
            continue

        p["market_price"] = mp
        p["market_source"] = market.get("market_source")
        updated += 1
        print(f"  ✓ {p['title'][:40]} → {mp}원")
        time.sleep(0.2)

    save_posts(posts)
    print(f"완료: {updated}개 갱신")


if __name__ == "__main__":
    main()
