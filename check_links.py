#!/usr/bin/env python3
"""고객 화면에 노출 중인 공구의 구매 링크가 실제로 살아있는지 매일 점검한다.

- 확실히 죽은 링크(404/410, 또는 "존재하지 않는 페이지"류 문구)는 자동으로
  비공개 처리한다(status='excluded', published=False) — 재입고 걱정 없이 영구히 내린다.
- 품절/일시 품절 문구가 감지되면 published만 False로 내리고 status는 건드리지 않는다 —
  재입고는 흔한 일이라 판단을 되돌릴 수 있게, 다음 점검에서 품절 문구가 사라지면
  이 스크립트가 붙인 태그(SOLD_OUT_REASON)를 보고 자동으로 다시 공개한다. 관리자가
  다른 이유로 수동 비공개한 글은 이 태그가 없으므로 절대 건드리지 않는다.
- 애매한 경우(타임아웃, 5xx, 접속 실패, 리다이렉트 등)는 비공개로 내리지
  않고 review_reason에 "구매링크 확인 필요"만 남겨 관리자가 검토하게 한다.

사용법: python3 check_links.py
"""
import os
import time
import warnings
from datetime import date
from pathlib import Path

import requests
import urllib3

# 인증서 체인이 불완전한 소규모 쇼핑몰 확인용 verify=False 재시도에서 나오는 경고 억제
warnings.filterwarnings("ignore", category=urllib3.exceptions.InsecureRequestWarning)

_env_file = Path(__file__).parent / ".env.local"
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())

from inpock import load_posts, save_posts  # noqa: E402

UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"

DEAD_STATUS = {404, 410}
DEAD_TEXT_PATTERNS = (
    "존재하지 않는 페이지",
    "삭제된 게시물",
    "삭제된 상품",
    "요청하신 페이지를 찾을 수 없습니다",
    "페이지를 찾을 수 없습니다",
    "이 페이지의 링크가 작동하지 않습니다",  # 인스타그램 삭제된 게시물
    "판매가 종료된 상품입니다",
    "이벤트가 종료되었습니다",
    "종료된 이벤트입니다",
)

# "품절임박"/"품절 알림 받기"처럼 아직 구매 가능한데 마케팅 문구로 품절이 섞여 들어가는
# 경우가 많아서, 확실히 "지금 못 산다"는 뜻일 때만 걸리도록 문구를 좁게 잡는다
SOLD_OUT_TEXT_PATTERNS = (
    "품절되었습니다",
    "현재 품절",
    "일시 품절",
    "재고가 없습니다",
    "재고 소진",
    "sold out",
)

BROKEN_REASON = "구매링크 만료됨 (자동 비공개)"
SOLD_OUT_REASON = "품절 감지 (자동 숨김 · 재입고 시 자동 복구)"
UNCERTAIN_REASON = "구매링크 확인 필요"


# lib/period.ts의 DEADLINE_UNKNOWN_DAYS와 같은 값이어야 한다.
# 마감일을 못 읽은 공구를 언제까지 진행 중으로 볼지 — 두 곳에 있으니 함께 고칠 것.
DEADLINE_UNKNOWN_DAYS = 21


def is_customer_visible(p):
    """lib/period.ts의 isCustomerVisible과 같은 규칙 — 한쪽만 고치면 갈라진다."""
    if p.get("status") == "upcoming":
        return p.get("published") is not False
    is_published = p.get("status") == "published" or (not p.get("status") and p.get("published") is not False)
    if not is_published:
        return False
    # 사람이 끝났다고 확인한 공구는 내린다
    if p.get("ended_at"):
        return False
    # 사람이 "계속 판다"고 확인해 준 것만 마감일 없이도 계속 보인다
    if p.get("is_evergreen_deal") or p.get("is_always_on") or p.get("sale_until_sold_out"):
        return True
    deadline = p.get("deadline")
    if not deadline:
        # 마감일 미확인 — 시작일(없으면 수집일)로부터 정해진 기간까지만 진행 중으로 본다
        basis = (p.get("start_date") or p.get("scraped_at") or "")[:10]
        if not basis:
            return True
        try:
            since = (date.today() - date.fromisoformat(basis)).days
        except ValueError:
            return True
        return since <= DEADLINE_UNKNOWN_DAYS
    return deadline[:10] >= date.today().isoformat()


def check_link(url):
    """('dead'|'sold_out'|'uncertain'|'alive', reason)"""
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=12, allow_redirects=True)
    except requests.exceptions.SSLError:
        # 소규모 쇼핑몰 중 인증서 체인이 불완전해 파이썬 기본 검증에서만 실패하는 경우가
        # 흔하다(브라우저는 대개 문제없이 연다) — 콘텐츠만 확인하는 용도라 재시도는 허용한다
        try:
            r = requests.get(url, headers={"User-Agent": UA}, timeout=12, allow_redirects=True, verify=False)
        except requests.RequestException as e:
            return "uncertain", f"접속 실패: {e.__class__.__name__}"
    except requests.RequestException as e:
        return "uncertain", f"접속 실패: {e.__class__.__name__}"

    if r.status_code in DEAD_STATUS:
        return "dead", f"HTTP {r.status_code}"

    if r.status_code >= 500 or r.status_code == 403:
        return "uncertain", f"HTTP {r.status_code}"

    text = r.text[:20000]  # 페이지 전체를 다 볼 필요는 없음
    for pat in DEAD_TEXT_PATTERNS:
        if pat in text:
            return "dead", f"문구 감지: {pat}"

    text_lower = text.lower()
    for pat in SOLD_OUT_TEXT_PATTERNS:
        if pat.lower() in text_lower:
            return "sold_out", f"품절 문구 감지: {pat}"

    return "alive", "정상"


def hide_from_customers(p):
    """admin/page.tsx의 togglePublished와 동일한 규칙으로 숨긴다 — status가 'published'인
    동안은 published 불리언만 바꿔선 안 보여지지 않는다(isCustomerVisible이 status==='published'
    이면 published 값을 아예 안 본다), 그래서 status도 같이 내려야 실제로 숨겨진다."""
    if p.get("status") == "upcoming":
        p["published"] = False
    else:
        p["status"] = "ready"
        p["published"] = False


def restore_to_customers(p):
    """hide_from_customers로 내렸던 걸 원래대로 되돌린다"""
    if p.get("status") == "ready":
        p["status"] = "published"
    p["published"] = True


def main():
    posts = load_posts()
    targets = [p for p in posts if is_customer_visible(p) and (p.get("purchase_url") or p.get("url"))]
    print(f"점검 대상: {len(targets)}개")

    broken = 0
    sold_out = 0
    restocked = 0
    uncertain = 0
    for p in targets:
        link = p.get("purchase_url") or p.get("url")
        result, reason = check_link(link)
        existing = p.get("review_reason") or []

        if result == "dead":
            p["status"] = "excluded"
            p["published"] = False
            if BROKEN_REASON not in existing:
                p["review_reason"] = existing + [BROKEN_REASON]
            broken += 1
            print(f"  ❌ 비공개 처리: {p['title'][:40]} ({reason})")
        elif result == "sold_out":
            hide_from_customers(p)  # status도 함께 내려야 실제로 숨겨짐 (재입고 시 자동 복구 가능)
            if SOLD_OUT_REASON not in existing:
                p["review_reason"] = existing + [SOLD_OUT_REASON]
            sold_out += 1
            print(f"  📦 품절로 숨김: {p['title'][:40]} ({reason})")
        elif result == "uncertain":
            if UNCERTAIN_REASON not in existing:
                p["review_reason"] = existing + [UNCERTAIN_REASON]
            uncertain += 1
            print(f"  ⚠️  확인 필요: {p['title'][:40]} ({reason})")
        else:  # alive
            # 이 스크립트가 붙인 태그만 정리한다 — 관리자가 다른 이유로 비공개한 건 안 건드림
            if SOLD_OUT_REASON in existing:
                restore_to_customers(p)
                restocked += 1
                print(f"  ✅ 재입고 감지, 다시 공개: {p['title'][:40]}")
            if SOLD_OUT_REASON in existing or UNCERTAIN_REASON in existing:
                p["review_reason"] = [r for r in existing if r not in (SOLD_OUT_REASON, UNCERTAIN_REASON)]

        time.sleep(0.3)

    save_posts(posts)
    print(f"\n완료: 비공개 {broken}개, 품절 숨김 {sold_out}개, 재입고 복구 {restocked}개, 확인 필요 표시 {uncertain}개")


if __name__ == "__main__":
    main()
