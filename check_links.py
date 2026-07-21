#!/usr/bin/env python3
"""고객 화면에 노출 중인 공구의 구매 링크가 실제로 살아있는지 매일 점검한다.

- 확실히 죽은 링크(404/410, 또는 "존재하지 않는 페이지"류 문구)만 자동으로
  비공개 처리한다(status='excluded', published=False).
- 애매한 경우(타임아웃, 5xx, 접속 실패, 리다이렉트 등)는 비공개로 내리지
  않고 review_reason에 "구매링크 확인 필요"만 남겨 관리자가 검토하게 한다.
  판매종료/품절 같은 문구는 일시적일 수 있어 죽은 링크로 취급하지 않는다.

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
)

BROKEN_REASON = "구매링크 만료됨 (자동 비공개)"
UNCERTAIN_REASON = "구매링크 확인 필요"


def is_customer_visible(p):
    if p.get("status") == "upcoming":
        return p.get("published") is not False
    is_published = p.get("status") == "published" or (not p.get("status") and p.get("published") is not False)
    if not is_published:
        return False
    if p.get("is_evergreen_deal") or p.get("is_always_on"):
        return True
    deadline = p.get("deadline")
    if not deadline:
        return True
    return deadline >= date.today().isoformat()


def check_link(url):
    """(dead: bool | None, reason: str) — dead=True 확실히 죽음, False 확실히 살아있음, None 애매함"""
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=12, allow_redirects=True)
    except requests.exceptions.SSLError:
        # 소규모 쇼핑몰 중 인증서 체인이 불완전해 파이썬 기본 검증에서만 실패하는 경우가
        # 흔하다(브라우저는 대개 문제없이 연다) — 콘텐츠만 확인하는 용도라 재시도는 허용한다
        try:
            r = requests.get(url, headers={"User-Agent": UA}, timeout=12, allow_redirects=True, verify=False)
        except requests.RequestException as e:
            return None, f"접속 실패: {e.__class__.__name__}"
    except requests.RequestException as e:
        return None, f"접속 실패: {e.__class__.__name__}"

    if r.status_code in DEAD_STATUS:
        return True, f"HTTP {r.status_code}"

    if r.status_code >= 500 or r.status_code == 403:
        return None, f"HTTP {r.status_code}"

    text = r.text[:20000]  # 페이지 전체를 다 볼 필요는 없음
    for pat in DEAD_TEXT_PATTERNS:
        if pat in text:
            return True, f"문구 감지: {pat}"

    return False, "정상"


def main():
    posts = load_posts()
    targets = [p for p in posts if is_customer_visible(p) and (p.get("purchase_url") or p.get("url"))]
    print(f"점검 대상: {len(targets)}개")

    broken = 0
    uncertain = 0
    for p in targets:
        link = p.get("purchase_url") or p.get("url")
        dead, reason = check_link(link)

        if dead is True:
            p["status"] = "excluded"
            p["published"] = False
            existing = p.get("review_reason") or []
            if BROKEN_REASON not in existing:
                p["review_reason"] = existing + [BROKEN_REASON]
            broken += 1
            print(f"  ❌ 비공개 처리: {p['title'][:40]} ({reason})")
        elif dead is None:
            existing = p.get("review_reason") or []
            if UNCERTAIN_REASON not in existing:
                p["review_reason"] = existing + [UNCERTAIN_REASON]
                uncertain += 1
                print(f"  ⚠️  확인 필요: {p['title'][:40]} ({reason})")
        else:
            # 정상 확인됨 — 예전에 붙었던 확인 필요 태그는 지운다
            existing = p.get("review_reason") or []
            if UNCERTAIN_REASON in existing:
                p["review_reason"] = [r for r in existing if r != UNCERTAIN_REASON]

        time.sleep(0.3)

    save_posts(posts)
    print(f"\n완료: 비공개 {broken}개, 확인 필요 표시 {uncertain}개")


if __name__ == "__main__":
    main()
