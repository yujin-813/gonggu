#!/usr/bin/env python3
"""위즈(WIZ) 계열 쇼핑몰의 깨진 og:image("h" 한 글자만 있는 템플릿 버그) 때문에
이미지 다운로드가 실패했던 공구를 다시 수집한다.

mamahome.co.kr·foryou-home.co.kr·rara-home.com·mariettle.co.kr 등에서 실측 확인 —
og:image content가 전부 "h" 하나뿐이라 img가 "https://d13k46lqgoj3d6.cloudfront.net/h"로
저장돼 있었다(inpock.py의 IMG_CDN 접두사 로직이 깨진 상대경로를 그대로 붙인 결과).
inpock.py의 fetch_product_info()에 대체 경로(bizpon.biz의 BIZ_PR_IMG)를 추가한 뒤,
이미 이 값으로 저장된 기존 게시물만 다시 수집한다.

사용법:
  python3 backfill_wiz_og_image.py --dry-run   # 무엇이 바뀔지만 확인, 저장 안 함
  python3 backfill_wiz_og_image.py             # 실제 반영
"""
import argparse
import os
import time
from pathlib import Path

_env_file = Path(__file__).parent / ".env.local"
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())

from inpock import load_posts, save_posts, fetch_product_info, resolve_img  # noqa: E402

BROKEN_SIGNATURE = "cloudfront.net/h"


def main():
    parser = argparse.ArgumentParser(description="위즈 계열 깨진 og:image 백필")
    parser.add_argument("--dry-run", action="store_true", help="저장하지 않고 결과만 출력")
    args = parser.parse_args()

    posts = load_posts()
    targets = [p for p in posts if (p.get("img") or "").endswith(BROKEN_SIGNATURE)]
    print(f"대상: {len(targets)}개{'(dry-run)' if args.dry_run else ''}")

    fixed = 0
    for p in targets:
        purchase_url = p.get("purchase_url") or p.get("store_url")
        domain = p.get("store_domain")
        if not purchase_url or not domain:
            print(f"  · {p['title'][:40]} → 구매링크/도메인 없음, 건너뜀")
            continue

        pi, _debug = fetch_product_info(purchase_url, domain)
        img_src = pi.get("img") or ""
        if not img_src or img_src.endswith("cloudfront.net/h") or img_src == "h":
            print(f"  ✗ {p['title'][:40]} → 여전히 못 찾음")
            time.sleep(0.3)
            continue

        img, ok = resolve_img(img_src, p.get("shortcode") or str(p["id"]))
        if not ok:
            print(f"  ✗ {p['title'][:40]} → 이미지는 찾았지만 다운로드 실패 ({img_src[:60]})")
            time.sleep(0.3)
            continue

        print(f"  ✓ {p['title'][:40]} → {img}")
        if not args.dry_run:
            p["img"] = img
            p["review_reason"] = [r for r in (p.get("review_reason") or []) if r != "이미지 다운로드 실패"]
        fixed += 1
        time.sleep(0.3)

    print(f"\n완료: {fixed}/{len(targets)}개 {'수정 가능(dry-run, 저장 안 함)' if args.dry_run else '수정'}")
    if not args.dry_run and fixed:
        save_posts(posts)
        print("저장 완료")


if __name__ == "__main__":
    main()
