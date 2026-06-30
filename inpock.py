#!/usr/bin/env python3
"""
인포크링크(link.inpock.co.kr) 수집기.

인플루언서의 인포크 핸들 목록(data/inpock_sources.json)을 읽어 각 페이지의
__NEXT_DATA__ JSON을 파싱한다. 인스타 API를 거치지 않으므로 차단 위험이 없다.

- 비커머스 링크(카톡·카페·로그인 등)와 상시판매는 제외하고 공구만 수집
- 신규 공구는 '검수 대기(published=False)'로 추가
- '공구 보기'는 인플루언서 인스타 프로필로, 실제 구매처는 store_url에 보존

로컬에서 실행해 data/posts.json 을 갱신하고, sync-to-ec2.sh 로 서버에 병합한다.
"""

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import requests

# ── 경로 ──────────────────────────────────────────────────────────────────────
BASE_DIR     = Path(__file__).parent
DATA_DIR     = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_FILE  = DATA_DIR / "posts.json"
STATUS_FILE  = DATA_DIR / "inpock_status.json"
SOURCES_FILE = DATA_DIR / "inpock_sources.json"
IMG_DIR      = BASE_DIR / "public" / "scraped"
IMG_DIR.mkdir(parents=True, exist_ok=True)

# ── 상수 ──────────────────────────────────────────────────────────────────────
INPOCK        = "https://link.inpock.co.kr"
IMG_CDN       = "https://d13k46lqgoj3d6.cloudfront.net/"   # 상대 image 경로의 베이스
PRODUCT_TYPES = {"link", "collection", "smart_store"}
UA            = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"

# 비커머스 도메인 — 최종 리다이렉트 기준으로 이 도메인이면 공구가 아니므로 제외
BLOCK_DOMAINS = (
    "cafe.naver.com", "nid.naver.com", "blog.naver.com",
    "pf.kakao.com", "open.kakao.com", "talk.kakao.com",
    "instagram.com", "link.inpock.co.kr",
    "t.me", "band.us", "youtube.com", "youtu.be",
    "forms.gle", "docs.google.com",
)
# 상시판매 신호 — 제목에 있으면 공구가 아님
ALWAYS_ON_KW = ("상시판매", "상시 판매", "상시할인", "상시 할인", "상시구매", "상시 구매")


# ── 입출력 ────────────────────────────────────────────────────────────────────
def load_posts():
    if not OUTPUT_FILE.exists():
        return []
    try:
        return json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def save_posts(posts):
    posts.sort(key=lambda p: p.get("scraped_at", ""), reverse=True)
    tmp = OUTPUT_FILE.with_suffix(f".{datetime.now().timestamp()}.tmp")
    tmp.write_text(json.dumps(posts, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(OUTPUT_FILE)


def load_sources():
    if not SOURCES_FILE.exists():
        return []
    try:
        return json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def write_status(new_count, skipped_count, error=None):
    STATUS_FILE.write_text(json.dumps({
        "running": False,
        "last_run": datetime.now().isoformat(),
        "last_count": new_count,
        "skipped_count": skipped_count,
        "error": error,
    }, ensure_ascii=False, indent=2), encoding="utf-8")


# ── 파싱 ──────────────────────────────────────────────────────────────────────
def fetch_blocks(handle):
    r = requests.get(f"{INPOCK}/{handle}", headers={"User-Agent": UA}, timeout=15)
    r.raise_for_status()
    m = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
        r.text, re.S,
    )
    if not m:
        raise ValueError("__NEXT_DATA__ 를 찾을 수 없습니다 (페이지 구조 변경?)")
    pp = json.loads(m.group(1))["props"]["pageProps"]
    return pp, pp.get("blocks", [])


def extract_instagram(pp, fallback):
    for s in pp.get("design", {}).get("sns", []):
        if s.get("type") == "instagram":
            v = (s.get("value") or "").strip()
            m = re.search(r"instagram\.com/([^/?#]+)", v)
            return (m.group(1) if m else v.lstrip("@")) or fallback
    return fallback


def resolve_link(url):
    """리다이렉트를 따라가 (최종 URL, 최종 도메인) 반환. 실패 시 (None, None)."""
    if not url or not url.startswith("http"):
        return None, None
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=12,
                         allow_redirects=True, stream=True)
        final_url = r.url or ""
        r.close()
        host = final_url.split("/")[2] if "://" in final_url else ""
        return (final_url or None), (re.sub(r"^www\.", "", host) or None)
    except Exception:
        return None, None


def price_from_stickers(stickers):
    for s in stickers or []:
        m = re.search(r"([\d,]{2,})\s*원", s.get("title", ""))
        if m:
            return int(m.group(1).replace(",", ""))
    return 0


def fetch_store_price(url, domain):
    """구매 페이지에서 가격 파싱. 실패 시 0 반환.
    전략 1: JSON-LD @type=Product (smartstore, 29cm, musinsa 등 표준)
    전략 2: Open Graph / meta 태그 (og:price:amount, product:price:amount)
    두 방법 모두 사이트가 SEO용으로 공개하는 데이터이므로 차단 위험 없음."""
    if not url or not domain:
        return 0
    # 쇼핑몰이 아닌 도메인은 시도하지 않음
    skip = ("instagram.com", "youtube.com", "youtu.be", "kakao.com",
            "naver.com/cafe", "band.us", "t.me", "forms.gle", "docs.google.com")
    if any(s in url for s in skip):
        return 0
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=10)
        if r.status_code != 200:
            return 0
        html = r.text

        # 전략 1: JSON-LD structured data
        for m in re.finditer(
            r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
            html, re.S,
        ):
            try:
                data = json.loads(m.group(1))
                items = data if isinstance(data, list) else [data]
                for item in items:
                    if item.get("@type") == "Product":
                        offers = item.get("offers", {})
                        # offers가 리스트인 경우도 처리
                        if isinstance(offers, list):
                            offers = offers[0] if offers else {}
                        price = offers.get("price") or offers.get("lowPrice")
                        if price:
                            val = int(float(str(price).replace(",", "").replace(" ", "")))
                            if 1000 <= val <= 10_000_000:
                                return val
            except Exception:
                continue

        # 전략 2: Open Graph / meta 태그
        for pattern in (
            r'<meta[^>]+property=["\']og:price:amount["\'][^>]+content=["\']([0-9,. ]+)["\']',
            r'<meta[^>]+content=["\']([0-9,. ]+)["\'][^>]+property=["\']og:price:amount["\']',
            r'<meta[^>]+property=["\']product:price:amount["\'][^>]+content=["\']([0-9,. ]+)["\']',
            r'<meta[^>]+content=["\']([0-9,. ]+)["\'][^>]+property=["\']product:price:amount["\']',
        ):
            m = re.search(pattern, html, re.I)
            if m:
                try:
                    val = int(float(m.group(1).replace(",", "").replace(" ", "")))
                    if 1000 <= val <= 10_000_000:
                        return val
                except Exception:
                    continue

    except Exception:
        pass
    return 0


def is_product(domain, price, title=""):
    """공구인지 판정. 가격 뱃지가 있으면 도메인 무관 공구. 상시판매·비커머스는 제외.
    도메인을 못 구하면 보수적으로 공구로 간주(검수 대기에서 사람이 판단)."""
    if any(kw in title for kw in ALWAYS_ON_KW):
        return False
    if price:
        return True
    if domain is None:
        return True
    return not any(domain == b or domain.endswith("." + b) or domain.endswith(b)
                   for b in BLOCK_DOMAINS)


def resolve_img(img, shortcode):
    if not img:
        return ""
    src = img if img.startswith("http") else IMG_CDN + re.sub(r"^images/", "", img)
    ext = re.search(r"\.(jpg|jpeg|png|webp|gif|avif)", src, re.I)
    ext = ext.group(1).lower() if ext else "jpg"
    try:
        r = requests.get(src, headers={"User-Agent": UA, "Referer": INPOCK + "/"}, timeout=15)
        if r.status_code == 200 and r.content:
            dest = IMG_DIR / f"{shortcode}.{ext}"
            dest.write_bytes(r.content)
            return f"/scraped/{shortcode}.{ext}"
    except Exception:
        pass
    return src


def block_to_post(b, ig_handle, price, domain, profile_url, store_url):
    sc = f"inpock_{b['id']}"
    return {
        "id":         abs(hash(sc)) % (10 ** 9),
        "shortcode":  sc,
        "title":      (b.get("title") or "").strip(),
        "account":    f"@{ig_handle}",
        "cat":        "life",                       # 분류 불가 → 기본값, 관리자 보정
        "price":      price,
        "origPrice":  None,
        "start_date": "",
        "deadline":   b.get("open_until") or "",
        "brand":      None,
        "img":        resolve_img(b.get("image"), sc),
        "url":        profile_url,                   # '공구 보기' → 인스타 프로필
        "store_url":  store_url,                     # 실제 구매처 (검수용)
        "store_domain": domain or "",
        "participants": 0,
        "avatar":     "🛍️",
        "caption":    "",
        "scraped_at": datetime.now().isoformat(),
        "source":     "inpock",
        "published":  False,                         # 검수 대기
        "is_open":    bool(b.get("is_open", True)),
    }


# ── 수집 ──────────────────────────────────────────────────────────────────────
def collect(handles):
    posts = load_posts()
    by_sc = {p["shortcode"]: p for p in posts if p.get("shortcode")}
    new_count = 0
    skipped_count = 0

    for handle in handles:
        print(f"\n🔗 @{handle} 수집 중...")
        try:
            pp, blocks = fetch_blocks(handle)
        except Exception as e:
            print(f"  ⚠️  실패: {e}")
            continue

        ig_handle = extract_instagram(pp, handle)
        profile_url = f"https://instagram.com/{ig_handle}"

        for b in blocks:
            if b.get("block_type") not in PRODUCT_TYPES:
                continue
            if not (b.get("title") and b.get("url")):
                continue

            sc = f"inpock_{b['id']}"
            if sc in by_sc:
                continue  # 이미 수집됨 (검수상태 보존)
            if not bool(b.get("is_open", True)):
                continue  # 닫힌 공구는 추가 안 함

            url_abs = b["url"] if b["url"].startswith("http") else INPOCK + b["url"]
            price = price_from_stickers(b.get("stickers"))
            final_url, domain = resolve_link(url_abs)
            if not price and final_url:
                price = fetch_store_price(final_url, domain)
            if not is_product(domain, price, b.get("title", "")):
                skipped_count += 1
                print(f"  - (제외) {b['title'][:34]} [{domain}]")
                continue

            posts.insert(0, block_to_post(b, ig_handle, price, domain, profile_url, final_url or url_abs))
            by_sc[sc] = posts[0]
            new_count += 1
            print(f"  + {b['title'][:34]} [{domain}]")

    save_posts(posts)
    write_status(new_count, skipped_count)
    print(f"\n{'=' * 50}")
    print(f"✅ 완료! 신규 검수대기: {new_count}개 | 비공구 제외: {skipped_count}개")
    print(f"{'=' * 50}")
    return new_count, skipped_count


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="인포크링크 수집기")
    parser.add_argument("--handle", "-H", nargs="+", help="인포크 핸들 (생략 시 data/inpock_sources.json)")
    args = parser.parse_args()

    handles = args.handle or load_sources()
    if not handles:
        print("⚠️  수집할 인포크 핸들이 없습니다. data/inpock_sources.json 에 추가하세요.")
        write_status(0, 0, "등록된 소스가 없습니다")
        sys.exit(0)

    print("🔗 인포크링크 수집기")
    print(f"   대상: {', '.join(handles)}")
    collect(handles)
