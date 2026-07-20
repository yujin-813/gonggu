#!/usr/bin/env python3
""""생활(life)"로 잘못 분류된 유아동 상품만 좁혀서 고치는 백필 스크립트.

카테고리를 8개 → 6개(상시딜/유아동/생활/식품/건강/뷰티)로 개편하면서 kids
키워드를 보강했는데, 그 결과로 life → kids가 될 상품만 대상으로 한다.
- life → kids 이외의 이동(예: food → life)은 다루지 않는다 — 카테고리 간
  임의 이동은 오탐 위험이 커서, 이번에 신고된 "유아동인데 생활/반려동물로
  보인다"는 문제에 좁게 대응한다.
- 캡션은 보지 않고 제목만 본다 — "이번 주 리빙템/육아템 알림 이벤트"처럼
  여러 상품을 나열하는 게시물은 캡션에 육아 관련 단어가 스치듯 섞여 있어
  캡션까지 보면 오탐이 늘어난다.
- 패션·반려동물·디지털로 이미 태그된 상품은 건드리지 않는다(기존 표기 유지).

기본은 미리보기만 하고 실제로 저장하지 않는다. 확인 후 --apply로 재실행.

사용법:
    python3 backfill_category.py          # 미리보기만
    python3 backfill_category.py --apply  # 실제로 저장
"""
import sys

from inpock import load_posts, save_posts, classify_category


def main():
    apply = "--apply" in sys.argv
    posts = load_posts()

    changes = []
    for p in posts:
        if p.get("cat") != "life":
            continue
        new_cat = classify_category(p.get("title", ""), "")
        if new_cat == "kids":
            changes.append(p)

    for p in changes:
        print(f"  life → kids · {p.get('title', '')[:60]}")

    print(f"{'적용' if apply else '미리보기(저장 안 함, --apply로 실제 적용)'}: {len(changes)}개")

    if apply:
        for p in changes:
            p["cat"] = "kids"
        save_posts(posts)


if __name__ == "__main__":
    main()
