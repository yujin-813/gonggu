#!/usr/bin/env python3
"""이미 등록된 공구의 상세페이지를 다시 읽어 세트 옵션을 채워 넣는 백필.

수집기(inpock.py)는 새로 들어오는 글에만 옵션을 붙이므로, 그전에 쌓인 공구는
세트가 여러 개여도 대표 가격 하나만 들고 있다. 이 스크립트가 그 간극을 메운다.

건드리는 값은 options뿐이다. status/published/deadline/price는 손대지 않는다 —
이미 검수가 끝난 공구가 백필 때문에 화면에서 사라지면 안 되고, 옵션 최저가에는
부속품(마우스피스 단품 19,000원 등)이 섞여 있어서 그걸 대표가로 삼으면 15만원짜리
공구가 "19,000원부터"로 보이기 때문이다.

옵션을 못 뽑는 곳(스마트스토어는 네이버가 429로 차단, 스룩페이는 JS 렌더링)은
그냥 건너뛴다 — 관리자 화면의 붙여넣기 파서로 처리하면 된다.

사용법:
    python3 backfill_options.py            # 실제 저장
    python3 backfill_options.py --dry-run  # 저장 없이 결과만 확인
    python3 backfill_options.py --limit 20
"""
import argparse
import time
from urllib.parse import urlparse

import requests

from inpock import UA, load_posts, save_posts, extract_options, _get_with_cert_fallback


def fetch_html(url):
    r = _get_with_cert_fallback(url, timeout=12)
    if r.status_code != 200:
        return None, f"HTTP {r.status_code}"
    # 국내 자사몰은 EUC-KR이 흔한데 헤더에 charset이 없으면 requests가 ISO-8859-1로
    # 읽어 옵션명이 통째로 깨진다 (inpock.fetch_product_info와 같은 처리)
    if "charset" not in (r.headers.get("Content-Type") or "").lower():
        head = r.content[:2048].decode("ascii", "replace").lower()
        if "euc-kr" in head or "ks_c_5601" in head:
            r.encoding = "euc-kr"
        elif r.encoding and r.encoding.lower() == "iso-8859-1":
            r.encoding = r.apparent_encoding or "utf-8"
    return r.text, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="저장하지 않고 결과만 출력")
    ap.add_argument("--limit", type=int, default=0, help="처리할 최대 개수 (0=전체)")
    args = ap.parse_args()

    posts = load_posts()
    targets = [
        p for p in posts
        if p.get("status") in ("published", "ready")
        and p.get("purchase_url")
        and not p.get("options")
    ]
    if args.limit:
        targets = targets[: args.limit]
    print(f"대상 {len(targets)}개" + (" (dry-run)" if args.dry_run else ""))

    filled = skipped = failed = 0
    by_domain = {}
    for i, p in enumerate(targets, 1):
        url = p["purchase_url"]
        domain = urlparse(url).netloc
        try:
            html, err = fetch_html(url)
        except Exception as e:
            html, err = None, str(e)[:50]
        if not html:
            failed += 1
            continue

        opts = extract_options(html, url)
        if not opts:
            skipped += 1
            continue

        filled += 1
        by_domain[domain] = by_domain.get(domain, 0) + 1
        lo = min(o["price"] for o in opts)
        hi = max(o["price"] for o in opts)
        print(f"  [{i}/{len(targets)}] {p['title'][:34]:34} 구성 {len(opts)}개 "
              f"({lo:,}~{hi:,}원) · 대표가 {p.get('price') or 0:,}원 유지")
        for o in opts[:3]:
            print(f"        · {o['name'][:44]:44} {o['price']:,}원")

        if not args.dry_run:
            p["options"] = opts
            # price는 건드리지 않는다 — 옵션 최저가에는 부속품(마우스피스 단품 등)이 섞여
            # 있어서 그걸 대표가로 삼으면 공구가 실제보다 싸 보인다

        time.sleep(0.4)   # 같은 쇼핑몰에 연달아 때리지 않는다

    print(f"\n채움 {filled} · 옵션없음 {skipped} · 접속실패 {failed}")
    for d, n in sorted(by_domain.items(), key=lambda kv: -kv[1]):
        print(f"  {n:3}건  {d}")

    if not args.dry_run and filled:
        save_posts(posts)
        print("저장 완료")


if __name__ == "__main__":
    main()
