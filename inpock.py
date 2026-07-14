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
import os
import re
import sys
from datetime import datetime, date
from pathlib import Path

import requests

# ── 네이버 쇼핑 API ────────────────────────────────────────────────────────────
_NAVER_CLIENT_ID     = os.environ.get("NAVER_CLIENT_ID", "")
_NAVER_CLIENT_SECRET = os.environ.get("NAVER_CLIENT_SECRET", "")
try:
    import dateparser
    _DATEPARSER_OK = True
except ImportError:
    _DATEPARSER_OK = False

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

# 비공구 신호 — 제목에 있으면 즉시 제외 (CS, 문의, 이벤트폼 등)
NON_DEAL_KW = (
    "cs문의", " cs",
    "고객센터", "고객문의",
    "배송조회", "주문조회", "주문/배송",
    "이벤트 폼", "후기이벤트", "리뷰이벤트",
    "무료체험", "무료 체험",
    "알림 받", "문자 알림",
    "문의하기", "네이버톡톡", "톡톡",
    "레시피북",
)

# 공구 신호 — 하나라도 있으면 공구 가능성 높음
DEAL_KW = (
    "공구", "공동구매",
    "특가", "단독특가", "단독구매",
    "오픈", "오픈예정",
    "마감", "마감임박",
    "선착순",
    "최저가", "역대최저",
    "할인", "할인가",
    "사은품", "증정",
    "주문받", "신청받",
    "기간한정", "한정수량",
    "공구가", "공구특가",
)

# 카테고리 자동 분류 — 순서 중요 (구체적인 것부터)
_CAT_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("kids",    ("어린이", "유아", "아기", "키즈", "초등", "영아", "육아", "그림책", "동화책",
                 "교구", "완구", "장난감", "학습지", "워크북", "문제집", "읽기독립", "리더기",
                 "신생아", "베이비", "유아복", "어린이책", "보드북", "동요", "동화", "저학년",
                 "아이들", "아이옷", "아이용")),
    ("pet",     ("강아지", "고양이", "반려견", "반려묘", "반려동물", "펫용품", "사료", "켄넬", "리드줄")),
    ("digital", ("핸드폰", "스마트폰", "태블릿", "노트북", "이어폰", "헤드폰", "충전기", "케이블",
                 "카메라", "가전", "전자기기", "디지털", "컴퓨터", "모니터", "키보드", "마우스")),
    ("beauty",  ("화장품", "스킨케어", "로션", "세럼", "앰플", "마스크팩", "선크림", "파운데이션",
                 "립스틱", "립글로스", "립밤", "아이섀도", "클렌징", "미백", "수분크림", "뷰티",
                 "기초화장", "색조", "향수", "에센스", "토너", "선스틱", "비비크림", "메이크업")),
    ("health",  ("영양제", "비타민", "건강기능식품", "프로바이오틱스", "오메가", "콜라겐", "마그네슘",
                 "다이어트", "보충제", "헬스", "필라테스", "요가", "운동용품", "단백질")),
    ("food",    ("식품", "간식", "과자", "스낵", "커피", "차류", "음료", "유기농", "채소", "과일",
                 "고기", "해산물", "김치", "반찬", "쌀", "견과류", "떡", "빵", "쿠키", "젤리",
                 "식재료", "냉동식품", "밀키트", "도시락")),
    ("fashion", ("원피스", "티셔츠", "바지", "자켓", "코트", "패딩", "니트", "셔츠", "블라우스",
                 "스커트", "청바지", "신발", "운동화", "가방", "지갑", "액세서리", "목걸이",
                 "귀걸이", "의류", "패션", "레깅스", "맨투맨", "후드", "샌들", "슬리퍼")),
]


def classify_category(title: str, caption: str = "") -> str:
    text = (title + " " + caption).lower()
    for cat, keywords in _CAT_KEYWORDS:
        if any(kw in text for kw in keywords):
            return cat
    return "life"


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


def _clean_text(html):
    text = re.sub(r'<script[^>]*>.*?</script>', ' ', html, flags=re.S)
    text = re.sub(r'<style[^>]*>.*?</style>', ' ', text, flags=re.S)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&[a-z]+;', '', text)
    return re.sub(r'\s+', ' ', text).strip()


def _find_price_candidates(text):
    candidates = []
    for pat, label in [
        (r'(?:공구가|할인가|판매가|특가|정가|원가)[^\d]*([\d,]{3,})\s*원', "label_price"),
        (r'([\d,]{3,})\s*원', "원_pattern"),
        (r'₩\s*([\d,]{3,})', "won_symbol"),
    ]:
        for m in re.finditer(pat, text):
            raw = m.group(1).replace(',', '')
            try:
                val = int(raw)
                if 1000 <= val <= 10_000_000:
                    snippet = text[max(0, m.start()-15):m.end()+15].strip()
                    candidates.append({"value": val, "source": label, "context": snippet})
            except Exception:
                pass
    return candidates


def _find_deadline_candidates(text):
    candidates = []
    for pat, label in [
        (r'(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})', "iso_date"),
        (r'(\d{1,2})[월]\s*(\d{1,2})[일]', "korean_date"),
        (r'~\s*(\d{1,2})[./](\d{1,2})', "tilde_date"),
        (r'(\d{1,2})[./](\d{1,2})\s*(?:까지|마감)', "until_date"),
    ]:
        for m in re.finditer(pat, text):
            snippet = text[max(0, m.start()-20):m.end()+20].strip()
            candidates.append({"raw": m.group(0), "source": label, "context": snippet})
    return candidates


def _parse_deadline_candidate(raw):
    """문자열을 YYYY-MM-DD로 변환. dateparser → regex 순서로 시도."""
    raw = raw.strip()
    # ISO 형식은 직접 처리 (빠르고 오인식 없음)
    m = re.match(r'(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})', raw)
    if m:
        return f"{m.group(1)}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"
    # dateparser로 한국어 날짜 파싱
    if _DATEPARSER_OK:
        parsed = dateparser.parse(
            raw,
            languages=["ko"],
            settings={"PREFER_DATES_FROM": "future", "RETURN_AS_TIMEZONE_AWARE": False},
        )
        if parsed:
            result = parsed.strftime("%Y-%m-%d")
            # 오늘보다 과거이면 내년으로 조정
            if result < date.today().strftime("%Y-%m-%d"):
                parsed = parsed.replace(year=parsed.year + 1)
                result = parsed.strftime("%Y-%m-%d")
            return result
    # regex fallback
    m = re.match(r'(\d{1,2})[월]\s*(\d{1,2})[일]', raw)
    if m:
        return f"{date.today().year}-{m.group(1).zfill(2)}-{m.group(2).zfill(2)}"
    m = re.match(r'~?\s*(\d{1,2})[./](\d{1,2})', raw)
    if m:
        return f"{date.today().year}-{m.group(1).zfill(2)}-{m.group(2).zfill(2)}"
    return None


# ── 도메인별 전용 추출기 ───────────────────────────────────────────────────────
_DOMAIN_PRICE_PATTERNS = {
    "smartstore.naver.com": [
        r'"sellingPrice"\s*:\s*(\d{4,8})',
        r'"discountedSalePrice"\s*:\s*(\d{4,8})',
        r'"salePrice"\s*:\s*(\d{4,8})',
        r'"dcPrice"\s*:\s*(\d{4,8})',
        r'"benefitPrice"\s*:\s*(\d{4,8})',
    ],
    "mkt.shopping.naver.com": [
        r'"sellingPrice"\s*:\s*(\d{4,8})',
        r'"salePrice"\s*:\s*(\d{4,8})',
    ],
    "11st.co.kr":       [r'"finalDscAmt"\s*:\s*(\d{4,8})', r'"saleAmt"\s*:\s*(\d{4,8})'],
    "interpark.com":    [r'"discountPrice"\s*:\s*(\d{4,8})', r'"price"\s*:\s*(\d{4,8})'],
    "ssg.com":          [r'"salePrc"\s*:\s*"?(\d{4,8})"?'],
    "oliveyoung.co.kr": [r'"finalPrice"\s*:\s*"?(\d{4,8})"?'],
    "kurly.com":        [r'"sales_price"\s*:\s*(\d{4,8})'],
    "a-bly.com":        [r'"discountedPrice"\s*:\s*(\d{4,8})'],
    "ohou.se":          [r'"salePrice"\s*:\s*(\d{4,8})', r'"discountPrice"\s*:\s*(\d{4,8})'],
    "musinsa.com":      [r'"sale_price"\s*:\s*(\d{4,8})', r'"price"\s*:\s*(\d{4,8})'],
    "29cm.co.kr":       [r'"sellingPrice"\s*:\s*(\d{4,8})', r'"salePrice"\s*:\s*(\d{4,8})'],
    "tagby.io":         [r'"price"\s*:\s*(\d{4,8})', r'"salePrice"\s*:\s*(\d{4,8})'],
    "wadiz.kr":         [r'"rewardPrice"\s*:\s*(\d{4,8})', r'"price"\s*:\s*(\d{4,8})'],
}

_DOMAIN_DEADLINE_PATTERNS = {
    "smartstore.naver.com": [r'판매기간[^<]*?(\d{4}[.\-]\d{2}[.\-]\d{2})'],
    "11st.co.kr":           [r'판매종료일[^<]*?(\d{4}[.\-]\d{2}[.\-]\d{2})'],
    "interpark.com":        [r'"endDate"\s*:\s*"(\d{4}-\d{2}-\d{2})"'],
}


def _extract_from_domain(html, domain):
    """도메인에 특화된 가격/마감일 패턴 추출. 결과가 없으면 {} 반환."""
    result = {}
    for dom, patterns in _DOMAIN_PRICE_PATTERNS.items():
        if dom in domain:
            for pat in patterns:
                m = re.search(pat, html)
                if m:
                    try:
                        val = int(m.group(1))
                        if 1000 <= val <= 10_000_000:
                            result["price"] = val
                            result["price_method"] = f"domain:{dom}"
                            break
                    except Exception:
                        pass
            if result.get("price"):
                break
    for dom, patterns in _DOMAIN_DEADLINE_PATTERNS.items():
        if dom in domain:
            for pat in patterns:
                m = re.search(pat, html)
                if m:
                    parsed = _parse_deadline_candidate(m.group(1))
                    if parsed:
                        result["deadline"] = parsed
                        result["deadline_method"] = f"domain:{dom}"
                        break
            if result.get("deadline"):
                break
    return result


def fetch_product_info(url, domain):
    debug = {
        "purchase_url_found": bool(url),
        "page_fetch_status": None,
        "jsonld_found": False,
        "price_candidates": [],
        "deadline_candidates": [],
        "selected_price": None,
        "selected_deadline": None,
        "extraction_method": None,
        "extraction_confidence": None,
        "extraction_error": None,
    }

    if not url or not domain:
        debug["extraction_error"] = "URL 없음"
        return {}, debug

    skip = ("instagram.com", "youtube.com", "youtu.be", "kakao.com",
            "naver.com/cafe", "band.us", "t.me", "forms.gle", "docs.google.com")
    if any(s in url for s in skip):
        debug["extraction_error"] = "지원되지 않는 도메인"
        return {}, debug

    manual_only = ("coupang.com", "gmarket.co.kr", "auction.co.kr")
    if any(s in url for s in manual_only):
        debug["extraction_error"] = "수동 입력 필요 (JS 렌더링 전용 사이트)"
        return {}, debug

    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=10)
        debug["page_fetch_status"] = r.status_code
        if r.status_code != 200:
            debug["extraction_error"] = f"HTTP {r.status_code}"
            return {}, debug
        html = r.text
    except Exception as e:
        debug["extraction_error"] = str(e)[:120]
        return {}, debug

    result = {}

    # Strategy 1: JSON-LD
    for m in re.finditer(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html, re.S,
    ):
        try:
            data = json.loads(m.group(1))
            items = data if isinstance(data, list) else [data]
            for item in items:
                if item.get("@type") != "Product":
                    continue
                debug["jsonld_found"] = True
                if not result.get("title") and item.get("name"):
                    result["title"] = item["name"].strip()
                if not result.get("img"):
                    raw = item.get("image")
                    if isinstance(raw, list): raw = raw[0]
                    if isinstance(raw, dict): raw = raw.get("url", "")
                    if raw: result["img"] = raw
                offers = item.get("offers", {})
                if isinstance(offers, list): offers = offers[0] if offers else {}
                price = offers.get("price") or offers.get("lowPrice")
                if price:
                    try:
                        val = int(float(str(price).replace(",", "").replace(" ", "")))
                        if 1000 <= val <= 10_000_000:
                            debug["price_candidates"].append({"value": val, "source": "jsonld", "context": "JSON-LD offers.price"})
                            if not result.get("price"):
                                result["price"] = val
                                debug["extraction_method"] = "jsonld"
                                debug["extraction_confidence"] = "high"
                    except Exception:
                        pass
                for key in ("availabilityEnds", "priceValidUntil"):
                    raw_d = offers.get(key)
                    if raw_d:
                        dm = re.match(r"(\d{4}-\d{2}-\d{2})", str(raw_d))
                        if dm:
                            debug["deadline_candidates"].append({"raw": dm.group(1), "source": "jsonld", "context": f"JSON-LD offers.{key}"})
                            if not result.get("deadline"):
                                result["deadline"] = dm.group(1)
        except Exception:
            continue

    # Strategy 2: Meta / OG tags + JS JSON keys
    if not result.get("title"):
        for pat in (
            r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:title["\']',
        ):
            mt = re.search(pat, html, re.I)
            if mt: result["title"] = mt.group(1).strip(); break
    if not result.get("img"):
        for pat in (
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        ):
            mt = re.search(pat, html, re.I)
            if mt: result["img"] = mt.group(1).strip(); break
    for pat in (
        r'<meta[^>]+property=["\']og:price:amount["\'][^>]+content=["\']([0-9,. ]+)["\']',
        r'<meta[^>]+content=["\']([0-9,. ]+)["\'][^>]+property=["\']og:price:amount["\']',
        r'<meta[^>]+property=["\']product:price:amount["\'][^>]+content=["\']([0-9,. ]+)["\']',
        r'<meta[^>]+content=["\']([0-9,. ]+)["\'][^>]+property=["\']product:price:amount["\']',
    ):
        mt = re.search(pat, html, re.I)
        if mt:
            try:
                val = int(float(mt.group(1).replace(",", "").replace(" ", "")))
                if 1000 <= val <= 10_000_000:
                    debug["price_candidates"].append({"value": val, "source": "meta_tag", "context": "og:price"})
                    if not result.get("price"):
                        result["price"] = val
                        if not debug["extraction_method"]:
                            debug["extraction_method"] = "meta"
                            debug["extraction_confidence"] = "high"
                    break
            except Exception:
                continue
    for pat in (
        r'["\']salePrice["\']\s*:\s*(\d{4,8})',
        r'["\']sale_price["\']\s*:\s*(\d{4,8})',
        r'["\']sellingPrice["\']\s*:\s*(\d{4,8})',
        r'["\']currentPrice["\']\s*:\s*(\d{4,8})',
        r'["\']discountedPrice["\']\s*:\s*(\d{4,8})',
        r'["\']discountedSalePrice["\']\s*:\s*(\d{4,8})',
        r'["\']finalPrice["\']\s*:\s*(\d{4,8})',
        r'["\']goodsPrice["\']\s*:\s*(\d{4,8})',
        r'["\']sellPrice["\']\s*:\s*(\d{4,8})',
        r'["\']dcPrice["\']\s*:\s*(\d{4,8})',
        r'["\']benefitPrice["\']\s*:\s*(\d{4,8})',
        r'["\']cpnAplcPrice["\']\s*:\s*(\d{4,8})',
    ):
        mt = re.search(pat, html)
        if mt:
            try:
                val = int(mt.group(1))
                if 1000 <= val <= 10_000_000:
                    debug["price_candidates"].append({"value": val, "source": "js_json", "context": "script key match"})
                    if not result.get("price"):
                        result["price"] = val
                        if not debug["extraction_method"]:
                            debug["extraction_method"] = "js_json"
                            debug["extraction_confidence"] = "medium"
                    break
            except Exception:
                continue

    # Strategy 3: Clean HTML text regex
    clean = _clean_text(html)
    price_cands = _find_price_candidates(clean)
    deadline_cands = _find_deadline_candidates(clean)
    debug["price_candidates"].extend(price_cands)
    debug["deadline_candidates"].extend(deadline_cands)

    if not result.get("price") and price_cands:
        labeled = [c for c in price_cands if c["source"] == "label_price"]
        if labeled:
            chosen = labeled[0]
        else:
            # 배송비(3000원 미만) 제거 후, 빈도 가장 높은 값 선택
            filtered = [c for c in price_cands if c["value"] >= 3000]
            if filtered:
                from collections import Counter
                freq = Counter(c["value"] for c in filtered)
                top_val = freq.most_common(1)[0][0]
                chosen = next(c for c in filtered if c["value"] == top_val)
            else:
                chosen = min(price_cands, key=lambda c: c["value"])
        result["price"] = chosen["value"]
        if not debug["extraction_method"]:
            debug["extraction_method"] = "text_regex"
            debug["extraction_confidence"] = "medium"

    if not result.get("deadline") and deadline_cands:
        for cand in deadline_cands:
            parsed = _parse_deadline_candidate(cand["raw"])
            if parsed:
                result["deadline"] = parsed
                break

    # Strategy 4: 도메인 전용 파서 + dateparser 재파싱
    domain_info = _extract_from_domain(html, domain)
    if not result.get("price") and domain_info.get("price"):
        result["price"] = domain_info["price"]
        debug["price_candidates"].append({"value": domain_info["price"], "source": domain_info.get("price_method", "domain"), "context": "도메인 전용 파서"})
        if not debug["extraction_method"]:
            debug["extraction_method"] = "domain"
            debug["extraction_confidence"] = "medium"
    if not result.get("deadline") and domain_info.get("deadline"):
        result["deadline"] = domain_info["deadline"]
        debug["deadline_candidates"].append({"raw": domain_info["deadline"], "source": domain_info.get("deadline_method", "domain"), "context": "도메인 전용 파서"})

    # dateparser로 마감일 후보 재파싱 (regex가 파싱 못한 한국어 표현 처리)
    if not result.get("deadline") and _DATEPARSER_OK:
        for cand in debug["deadline_candidates"]:
            parsed = _parse_deadline_candidate(cand["raw"])
            if parsed:
                result["deadline"] = parsed
                debug["deadline_candidates"].append({"raw": parsed, "source": "dateparser_reparse", "context": cand["context"]})
                break

    debug["selected_price"] = result.get("price")
    debug["selected_deadline"] = result.get("deadline")
    if result.get("price") and not debug["extraction_method"]:
        debug["extraction_method"] = "unknown"
        debug["extraction_confidence"] = "low"

    return result, debug


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
    """이미지를 로컬로 다운로드한다. 반환: (경로 또는 원격 URL, 다운로드 성공 여부).
    소스 이미지가 아예 없는 경우는 실패로 취급하지 않는다 (원본에 이미지가 없을 뿐)."""
    if not img:
        return "", True
    src = img if img.startswith("http") else IMG_CDN + re.sub(r"^images/", "", img)
    ext = re.search(r"\.(jpg|jpeg|png|webp|gif|avif)", src, re.I)
    ext = ext.group(1).lower() if ext else "jpg"
    try:
        r = requests.get(src, headers={"User-Agent": UA, "Referer": INPOCK + "/"}, timeout=15)
        if r.status_code == 200 and r.content:
            dest = IMG_DIR / f"{shortcode}.{ext}"
            dest.write_bytes(r.content)
            return f"/scraped/{shortcode}.{ext}", True
    except Exception:
        pass
    # 다운로드 실패 — 원격 CDN URL은 만료/차단될 수 있으므로 그대로 쓰되 검수 대상으로 표시
    return src, False


_QUERY_PROMO_WORDS = [
    "구매하기", "바로가기", "구매링크", "신청하기", "주문하기", "보러가기", "주문링크",
    "회원가입", "카카오채널", "카톡채널", "중복할인", "특별기획전", "단독특가", "신제품출시",
    "공동구매", "한정수량", "선착순", "공구", "오픈", "특가", "모음전", "기획전",
]

# 브랜드/상품명과 감성적 설명 문구를 가르는 흔한 구분자 — "브랜드 - 설명" 패턴에서
# 구분자 앞부분만 따로 검색해보면 매칭률이 오른다 (예: "시간고양이 - 줄글책 힘들어..." → "시간고양이")
_QUERY_SEPARATORS = [" - ", " × ", " X ", " x ", " : ", " ~ ", " | "]


def clean_market_query(title):
    """네이버쇼핑 검색어 정제 — 인포크 링크 제목엔 상품명 뒤에 프로모션 조건(괄호 안 회원가입/
    할인조건/기간)이나 "구매하기" 같은 CTA 문구가 섞여 있어 그대로 검색하면 매칭률이 낮다."""
    t = title or ""
    # 괄호류(및 그 안의 내용) 통째로 제거 — 보통 프로모션 조건/기간이지 상품명이 아님
    t = re.sub(r"[\(\[\{【（][^)\]}】）]*[\)\]\}】）]", " ", t)
    for w in _QUERY_PROMO_WORDS:
        t = t.replace(w, " ")
    # "최대할인 40%", "할인53%" 류, "11차" 같은 회차 표기 제거
    t = re.sub(r"(최대)?할인\s*\d+\s*%", " ", t)
    t = re.sub(r"\d+\s*차\b", " ", t)
    # 특수문자·이모지 제거
    t = re.sub(r"[^\w\s가-힣]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def _query_variants(title):
    """검색 후보를 여러 개 만든다.
    인포크 제목은 "인플루언서 캠페인명 × 실제 브랜드/상품명 - 쇼핑몰명" 패턴이 흔한데
    (예: "트니맘 11차 공구 × 베베루트 링크형 카시트발판 - 이고다"), "×" 뒤가 진짜
    상품이고 앞은 캠페인 라벨, 맨 끝 " - 쇼핑몰명"은 상품명이 아닌 경우가 많다.
    그래서 원제목 정제본보다 이 "× 뒤 ~ 마지막 구분자 전" 구간을 먼저 시도하고,
    실패하면 "브랜드 - 설명" 패턴의 앞부분, 그래도 안 되면 단어 수를 줄여가며 재시도한다."""
    variants = []

    def add(q):
        q = (q or "").strip()
        if q and q not in variants:
            variants.append(q)

    base = clean_market_query(title)

    # "캠페인명 × 실제상품 - 쇼핑몰명" — × 뒤, 마지막 " - "/" : " 앞까지가 가장 신뢰도 높은 후보
    m = re.search(r"[×xX]\s*(.+)", title)
    if m:
        after = re.split(r"\s+[-:]\s+", m.group(1))[0]
        add(clean_market_query(after))

    add(base)

    for sep in _QUERY_SEPARATORS:
        if sep in title:
            add(clean_market_query(title.split(sep)[0]))

    words = base.split()
    if len(words) > 4:
        add(" ".join(words[:4]))
    if len(words) > 3:
        add(" ".join(words[:3]))
    if len(words) > 2:
        add(" ".join(words[:2]))

    return variants


def _naver_shop_search(query):
    """단일 검색어로 네이버쇼핑 API를 호출해 최저가를 반환. 결과 없으면 None."""
    try:
        r = requests.get(
            "https://openapi.naver.com/v1/search/shop.json",
            headers={
                "X-Naver-Client-Id":     _NAVER_CLIENT_ID,
                "X-Naver-Client-Secret": _NAVER_CLIENT_SECRET,
            },
            params={"query": query, "display": 5, "sort": "asc"},
            timeout=5,
        )
        if r.status_code != 200:
            return None
        items = r.json().get("items", [])
        prices = []
        for item in items:
            lp = item.get("lprice")
            if lp:
                try:
                    prices.append(int(lp))
                except ValueError:
                    pass
        return min(prices) if prices else None
    except Exception:
        return None


def fetch_naver_market_price(title, price=None):
    """네이버 쇼핑 검색 API로 현재 시장 최저가를 조회한다. 검색어 후보를 여러 개
    (× 뒤 상품명 → 원제목 정제본 → 구분자 앞부분 → 단어 수 축약본) 순서로 시도한다.
    price(공구 판매가)가 주어지면, 검색된 최저가가 판매가의 30% 미만인 매칭은
    다른 상품일 가능성이 높다고 보고 건너뛰고 다음 후보를 계속 시도한다 — 그래야
    앞쪽의 애매한 후보가 뒤쪽의 더 정확한 후보를 가로막지 않는다.
    반환: {market_price: int|None, market_source: str|None}
    API 미설정이거나 실패하면 빈 dict 반환."""
    if not _NAVER_CLIENT_ID or not _NAVER_CLIENT_SECRET:
        return {}
    for query in _query_variants(title):
        mp = _naver_shop_search(query[:50])
        if not mp:
            continue
        if price and mp < price * 0.3:
            continue
        return {"market_price": mp, "market_source": "naver_shopping"}
    return {}


def classify_status(title, purchase_url, price, deadline, extraction_confidence=None):
    if not title:
        return "excluded", ["상품명 없음"]

    t = title.lower()

    # 비공구 신호 즉시 제외
    if any(kw in t for kw in NON_DEAL_KW):
        return "excluded", ["비공구"]

    # 가격·마감일·공구 키워드 모두 없으면 상품 추천 링크로 판단
    has_deal_signal = any(kw in t for kw in DEAL_KW)
    if not price and not deadline and not has_deal_signal:
        return "excluded", ["상품 추천 (비공구)"]

    reasons = []
    if not price:
        reasons.append("가격 미입력")
    if not deadline:
        reasons.append("마감일 미확인")
    if not purchase_url:
        reasons.append("구매페이지 미확인")
    if purchase_url and price and deadline:
        # JSON-LD/meta(high)만 자동 승인, 그 외는 사람이 확인
        if extraction_confidence == "high":
            return "ready", []
        reasons.append("추출 데이터 확인 필요")
        return "needs_review", reasons
    return "needs_review", reasons


def block_to_post(b, ig_handle, price, domain, profile_url, purchase_url, deadline, product_info=None, debug_info=None, source_obj=None):
    sc = f"inpock_{b['id']}"
    pi = product_info or {}
    raw_title = (b.get("title") or "").strip() or pi.get("title", "")
    # 버튼 텍스트성 suffix 제거 ("구매하기", "바로가기" 등)
    title = re.sub(r'\s*(구매하기|바로가기|구매링크|신청하기|주문하기|보러가기)\s*$', '', raw_title).strip()
    img_src = b.get("image") or pi.get("img", "")
    img, img_ok = resolve_img(img_src, sc)
    confidence = (debug_info or {}).get("extraction_confidence")
    status, review_reason = classify_status(title, purchase_url, price, deadline, confidence)
    # 신뢰도 낮은 매칭(판매가의 30% 미만)은 fetch_naver_market_price 내부에서 이미 걸러진다
    market = fetch_naver_market_price(title, price) if title else {}
    mp = market.get("market_price")
    if mp and price and price >= mp:
        status, review_reason = "excluded", ["시장 최저가 이상"]
    if not img_ok and status != "excluded":
        # 이미지 다운로드 실패 — 원격 URL이 나중에 만료/차단되어 깨진 이미지로 보일 수 있으므로 검수 대상으로 표시
        status = "needs_review"
        if "이미지 다운로드 실패" not in review_reason:
            review_reason = list(review_reason) + ["이미지 다운로드 실패"]
    return {
        "id":              abs(hash(sc)) % (10 ** 9),
        "shortcode":       sc,
        "title":           title,
        "account":         f"@{ig_handle}",
        "cat":             classify_category(title, b.get("caption", "") or ""),
        "price":           price,
        "origPrice":       None,
        "start_date":      "",
        "deadline":        deadline,
        "brand":           None,
        "img":             img,
        "url":             profile_url,
        "store_url":       purchase_url,
        "purchase_url":    purchase_url,
        "store_domain":    domain or "",
        "participants":    0,
        "avatar":          "🛍️",
        "caption":         "",
        "scraped_at":      datetime.now().isoformat(),
        "source":          "inpock",
        "is_always_on":    False,
        "is_evergreen_deal": False,
        "extraction_debug": debug_info,
        "status":          status,
        "review_reason":   review_reason,
        "published":       False,
        "is_open":         bool(b.get("is_open", True)),
        "source_type":     source_obj.get("source_type", "inpock") if source_obj else "inpock",
        "source_url":      source_obj.get("url") if source_obj else None,
        "influencer_name": source_obj.get("influencer_name") if source_obj else ig_handle,
        "influencer_handle": source_obj.get("handle") if source_obj else ig_handle,
        "original_link":   b.get("url"),
        "extracted_link":  purchase_url,
        "collection_status": "collected",
        "collection_error": None,
        "influencer_id":   source_obj.get("id") if source_obj else None,
        "market_price":    market.get("market_price"),
        "market_source":   market.get("market_source"),
    }


# ── 수집 ──────────────────────────────────────────────────────────────────────
def collect(handles, source_obj=None, write_result=True):
    """handles: 수집할 인포크 핸들 목록.
    source_obj: collector.py 에서 전달하는 InfluencerSource 딕셔너리 (optional).
    write_result: False 면 inpock_status.json 을 직접 기록하지 않는다
                  (collector.py 가 집계 후 한 번만 기록하기 위해 사용).
    """
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
            deadline = b.get("open_until") or ""
            final_url, domain = resolve_link(url_abs)
            purchase_url = final_url or url_abs

            product_info, debug_info = fetch_product_info(purchase_url, domain) if (purchase_url and domain) else ({}, {})
            if not price and product_info.get("price"):
                price = product_info["price"]
            if not deadline and product_info.get("deadline"):
                deadline = product_info["deadline"]

            if not is_product(domain, price, b.get("title", "")):
                skipped_count += 1
                print(f"  - (제외) {b.get('title', '')[:34]} [{domain}]")
                continue

            posts.insert(0, block_to_post(b, ig_handle, price, domain, profile_url, purchase_url, deadline, product_info, debug_info, source_obj))
            by_sc[sc] = posts[0]
            new_count += 1
            print(f"  + {b['title'][:34]} [{domain}]")

    save_posts(posts)
    if write_result:
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
