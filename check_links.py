#!/usr/bin/env python3
"""고객 화면에 노출 중인 공구의 구매 링크가 실제로 살아있는지 매일 점검한다.

- 확실히 죽은 링크(404/410, 또는 "존재하지 않는 페이지"류 문구)는 자동으로
  비공개 처리한다(status='excluded', published=False) — 재입고 걱정 없이 영구히 내린다.
- 품절/일시 품절 문구가 감지되면 기간종료(D-002)와 똑같은 경로를 탄다 — status는 안
  건드리고 ended_at만 찍는다. "품절도 공구가 끝난 것"이라(사장님 확인, D-068), 마감일이
  지난 공구와 다르게 취급할 이유가 없다. 이러면 상세 페이지는 계속 살아있고(isPagePublic),
  쿠팡 파트너스 링크가 이미 붙어 있으면 "종료됐지만 여기서 살 수 있어요"로 자동 공개되며,
  없으면 "종료됨, 대체 구매처 없음"으로 보인다 — 둘 다 목록에서는 빠진다.
  재입고는 흔한 일이라 판단을 되돌릴 수 있게, 다음 점검에서 품절 문구가 사라지면
  이 스크립트가 붙인 태그(SOLD_OUT_REASON)를 보고 ended_at을 지워 자동 복구한다. 관리자가
  다른 이유로 수동 종료 확인한 글은 이 태그가 없으므로 절대 건드리지 않는다.
- 애매한 경우(타임아웃, 5xx, 접속 실패, 리다이렉트 등)는 비공개로 내리지
  않고 review_reason에 "구매링크 확인 필요"만 남겨 관리자가 검토하게 한다.

⚠️ 품절 태그(SOLD_OUT_REASON)가 붙은 공구는 지금 고객 화면에 안 보이더라도 점검 대상에
계속 포함시켜야 한다 — 안 그러면 ended_at으로 숨겨지는 순간 is_customer_visible이 False가
되어 점검 대상에서 빠지고, 재입고를 영영 다시 확인할 기회가 없어진다(D-068 전까지 실제로
이 버그로 재입고 자동 복구가 한 번도 동작하지 않았다 — status='ready'로 내리던 예전 방식도
같은 이유로 막혀 있었다).

사용법: python3 check_links.py
"""
import os
import re
import time
import warnings
from datetime import date, datetime, timedelta, timezone
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

# 카페24류 쇼핑몰은 구매 버튼 자체가 "품절" 두 글자만 라벨로 박혀 있다("<span
# class="butn-soldout">품절</span>"). 이건 SOLD_OUT_TEXT_PATTERNS의 긴 문구엔 안 걸리는데,
# 그렇다고 "품절" 두 글자를 문장 어디서나 매칭하면 "배송 지연 및 품절이 발생할 수
# 있습니다" 같은 안내 문구에도 걸린다 — 태그 안에 "품절" 딱 두 글자만 있을 때만 잡는다
SOLD_OUT_TAG_PATTERNS = (
    re.compile(r">\s*품절\s*<"),
    re.compile(r'alt=["\']품절["\']'),
)

# 카페24류 쇼핑몰은 "구매하기"·"품절" 버튼을 둘 다 항상 마크업에 넣어두고 재고에 따라
# JS로 하나만 보여준다 — 실제로 안 보이는 품절 버튼도 class="... displaynone"이 그대로
# 남아 있어서 태그 매칭에 걸린다("워터쥬시젤리" 공구가 진행 중인데 마감으로 잘못
# 처리된 사례로 확인). 매칭된 태그 자체에 이 클래스가 있으면 품절로 안 본다.
_HIDDEN_CLASS_RE = re.compile(r'class=["\'][^"\']*\b(?:displaynone|d-none|hidden|hide)\b')


def _tag_is_hidden(text, match_start):
    tag_start = text.rfind("<", 0, match_start)
    tag_end = text.find(">", tag_start)
    if tag_start == -1 or tag_end == -1:
        return False
    return bool(_HIDDEN_CLASS_RE.search(text[tag_start:tag_end + 1]))

BROKEN_REASON = "구매링크 만료됨 (자동 비공개)"
SOLD_OUT_REASON = "품절 감지 (자동 숨김 · 재입고 시 자동 복구)"
UNCERTAIN_REASON = "구매링크 확인 필요"


# lib/period.ts의 DEADLINE_UNKNOWN_DAYS와 같은 값이어야 한다.
# 마감일을 못 읽은 공구를 언제까지 진행 중으로 볼지 — 두 곳에 있으니 함께 고칠 것.
DEADLINE_UNKNOWN_DAYS = 21


def kst_today():
    """lib/kst.ts의 kstToday()와 같은 계산 — 서버가 UTC로 도는데(Etc/UTC 확인됨) 공구
    일정은 KST 기준이다. 이 스크립트는 cron으로 매일 KST 05:00(UTC 20:00)에 도는데, 그
    시각은 UTC 날짜가 KST보다 하루 뒤처지는 구간(UTC 15:00~23:59)에 정확히 걸린다 —
    date.today()를 그대로 쓰면 매일 실행할 때마다 하루 늦은 날짜로 판정했다는 뜻이다.
    """
    return (datetime.now(timezone.utc) + timedelta(hours=9)).date()


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
            since = (kst_today() - date.fromisoformat(basis)).days
        except ValueError:
            return True
        return since <= DEADLINE_UNKNOWN_DAYS
    return deadline[:10] >= kst_today().isoformat()


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

    # 앞 20000자만 보다가 실제 품절 배지를 놓친 적이 있다(카페24 옵션 목록이 길어
    # 구매 버튼이 그 뒤에 나오는 몰) — 페이지 전체를 본다. 문자열 검색이라 비용은 작다
    text = r.text
    for pat in DEAD_TEXT_PATTERNS:
        if pat in text:
            return "dead", f"문구 감지: {pat}"

    text_lower = text.lower()
    for pat in SOLD_OUT_TEXT_PATTERNS:
        if pat.lower() in text_lower:
            return "sold_out", f"품절 문구 감지: {pat}"
    for pat in SOLD_OUT_TAG_PATTERNS:
        for m in pat.finditer(text):
            if not _tag_is_hidden(text, m.start()):
                return "sold_out", "품절 문구 감지: 품절(버튼/배지)"

    return "alive", "정상"


def mark_sold_out(p):
    """품절 감지 — 기간종료와 같은 방식으로 처리한다(status는 그대로, ended_at만 찍는다).
    lib/period.ts의 isExpired()가 ended_at을 최우선으로 보므로, status/published를 안
    건드려도 isCustomerVisible이 알아서 목록에서 뺀다 — 상세 페이지(isPagePublic)는
    status만 보므로 계속 살아있다.

    'upcoming'(오픈 전) 상태는 예외다 — isCustomerVisible이 upcoming일 때 ended_at을
    아예 안 보므로(오픈 전인데 "종료"라는 게 말이 안 됨), 여기서는 published만 내린다.
    이 경우는 재입고 시 published만 되돌리면 된다(아래 clear_sold_out과 짝).

    예전 방식(status='ready')으로 멈춰 있던 공구도 여기서 함께 정상화한다 — status를
    'published'로 되돌리고 ended_at을 찍는다. 그래야 다음 재입고 점검 때도 정상 경로를
    탄다."""
    if p.get("status") == "upcoming":
        p["published"] = False
        return
    if p.get("status") == "ready":
        p["status"] = "published"
    p["published"] = True
    if not p.get("ended_at"):
        p["ended_at"] = datetime.now(timezone.utc).isoformat()


def clear_sold_out(p):
    """mark_sold_out으로 내렸던 걸 원래대로 되돌린다 — 예전 방식(status='ready')으로
    멈춰 있던 것도 함께 정상화한다."""
    if p.get("status") == "upcoming":
        p["published"] = True
        return
    if p.get("status") == "ready":
        p["status"] = "published"
    p["published"] = True
    p["ended_at"] = None


def needs_recheck(p):
    """점검 대상인지 — 지금 고객 화면에 보이거나, 이 스크립트가 품절로 숨겨 재입고를
    기다리는 중이거나. 후자를 빼면 한 번 숨긴 공구는 재확인 기회 자체가 없어진다."""
    if is_customer_visible(p):
        return True
    return SOLD_OUT_REASON in (p.get("review_reason") or [])


def main():
    posts = load_posts()
    targets = [p for p in posts if needs_recheck(p) and (p.get("purchase_url") or p.get("url"))]
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
            mark_sold_out(p)  # ended_at을 찍는다 — 기간종료와 같은 경로(D-068)
            if SOLD_OUT_REASON not in existing:
                p["review_reason"] = existing + [SOLD_OUT_REASON]
            sold_out += 1
            print(f"  📦 품절로 종료 처리: {p['title'][:40]} ({reason})")
        elif result == "uncertain":
            if UNCERTAIN_REASON not in existing:
                p["review_reason"] = existing + [UNCERTAIN_REASON]
            uncertain += 1
            print(f"  ⚠️  확인 필요: {p['title'][:40]} ({reason})")
        else:  # alive
            # 이 스크립트가 붙인 태그만 정리한다 — 관리자가 다른 이유로 비공개한 건 안 건드림
            if SOLD_OUT_REASON in existing:
                clear_sold_out(p)
                restocked += 1
                print(f"  ✅ 재입고 감지, 다시 공개: {p['title'][:40]}")
            if SOLD_OUT_REASON in existing or UNCERTAIN_REASON in existing:
                p["review_reason"] = [r for r in existing if r not in (SOLD_OUT_REASON, UNCERTAIN_REASON)]

        time.sleep(0.3)

    save_posts(posts)
    print(f"\n완료: 비공개 {broken}개, 품절 숨김 {sold_out}개, 재입고 복구 {restocked}개, 확인 필요 표시 {uncertain}개")


if __name__ == "__main__":
    main()
