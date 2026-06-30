"""
공구모아 스크래퍼 v2
===================
Instagram 로그인이 필요합니다. 아래 순서로 설정하세요.

1) .env.local 에 계정 추가:
      INSTAGRAM_USERNAME=아이디
      INSTAGRAM_PASSWORD=비밀번호

2) 또는 첫 실행 시 직접 입력:
      python3 scraper.py --setup

3) tracked_profiles.json 에 팔로우할 공구 계정 추가:
      ["계정1", "계정2", ...]

4) 이후 실행:
      python3 scraper.py
"""

import instaloader
import json
import re
import sys
import time
import argparse
import os
import getpass
from pathlib import Path
from datetime import datetime, date

try:
    import requests as _requests
    _HAS_REQUESTS = True
except ImportError:
    _HAS_REQUESTS = False

# .env.local 자동 로드 (Next.js 환경변수를 파이썬에서도 읽기 위해)
_env_file = Path(__file__).parent / ".env.local"
if _env_file.exists():
    for _line in _env_file.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip())


# ── 경로 설정 ────────────────────────────────────────────────────────────────

BASE_DIR          = Path(__file__).parent
# 웹앱(lib/store.ts)이 읽는 위치와 일치시킨다.
DATA_DIR          = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_FILE       = DATA_DIR / "posts.json"
STATUS_FILE       = DATA_DIR / "scraper_status.json"
SESSION_FILE      = BASE_DIR / ".instagram_session"
PROFILES_FILE     = DATA_DIR / "tracked_profiles.json"
IMG_DIR           = BASE_DIR / "public" / "scraped"
IMG_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_LIMIT     = 30
DELAY_POST        = 2.0
DELAY_PROFILE     = 5.0
CONFIG_FILE       = DATA_DIR / "scraper_config.json"


def load_config():
    if not CONFIG_FILE.exists():
        return {"include_keywords": [], "exclude_keywords": []}
    try:
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"include_keywords": [], "exclude_keywords": []}


# ── 카테고리 ─────────────────────────────────────────────────────────────────

CATEGORY_KEYWORDS = {
    "fashion": ["원피스","티셔츠","바지","코트","자켓","블라우스","스커트","가방","신발","패션","의류","옷","니트","청바지","레깅스","수영복","언더웨어","속옷","스니커즈","부츠"],
    "beauty":  ["립스틱","파운데이션","크림","에센스","세럼","토너","로션","마스크팩","선크림","뷰티","화장품","스킨케어","향수","칫솔","치약","구강","샴푸","린스","바디워시","클렌징"],
    "food":    ["삼겹살","과일","채소","쌀","김치","식품","간식","커피","견과류","홍삼","젤리","초콜릿","빵","밀키트","음료","올리브오일","오일","식용유","조미료","반찬","국"],
    "life":    ["수건","이불","베개","청소","주방","생활용품","인테리어","디퓨저","수납","식기","냄비","프라이팬","냉감","패드","빨래","바구니","소다","탄산","청소기","에어컨"],
    "kids":    ["아기","유아","어린이","키즈","장난감","기저귀","분유","유모차","아동복","학용품","비데","젖병","아기띠","보행기","카시트","유아식","이유식","선풍기"],
    "health":  ["비타민","오메가3","건강","영양제","보충제","프로바이오틱스","콜라겐","루테인","단백질","다이어트","홈트","마사지","안마"],
    "pet":     ["강아지","고양이","반려","펫","사료","간식","패드","목줄","급수기","하네스","케이지"],
    "digital": ["폰케이스","이어폰","에어팟","노트북","태블릿","디지털","충전기","보조배터리","키보드","라벨","프린터","스마트워치"],
}
CAT_EMOJI = {"fashion":"👗","beauty":"💄","food":"🍱","life":"🏠","kids":"🧸","health":"💊","pet":"🐾","digital":"📱"}


# ── 파싱 유틸 ─────────────────────────────────────────────────────────────────

def _parse_price_str(s: str) -> int | None:
    """숫자 문자열 → 정수 원화. 콤마·만원 표기 처리."""
    s = s.strip()
    # 만원 표기: "3만8천", "3.8만", "38만", "3만"
    m = re.match(r'^(\d+(?:\.\d+)?)\s*만\s*(\d+)?\s*천?$', s)
    if m:
        man = float(m.group(1))
        chun = int(m.group(2)) * 1000 if m.group(2) else 0
        val = int(man * 10000 + chun)
        return val if 1000 <= val <= 10_000_000 else None
    val = int(s.replace(",", ""))
    return val if 1000 <= val <= 10_000_000 else None


def extract_price(text):
    # 명시적 레이블 + 숫자 (콤마 유무 모두)
    label_patterns = [
        r'판매가[:\s]*(\d[\d,]*(?:\.\d+)?만?\d*)',
        r'공구가[:\s]*(\d[\d,]*(?:\.\d+)?만?\d*)',
        r'할인가[:\s]*(\d[\d,]*(?:\.\d+)?만?\d*)',
        r'특가[:\s]*(\d[\d,]*(?:\.\d+)?만?\d*)',
        r'가격[:\s]*(\d[\d,]*(?:\.\d+)?만?\d*)',
        r'₩\s*(\d[\d,]*)',
    ]
    for p in label_patterns:
        m = re.search(p, text)
        if m:
            val = _parse_price_str(m.group(1))
            if val:
                return val

    # 만원 표기: "3만원", "3.8만원", "38만원"
    m = re.search(r'(\d+(?:\.\d+)?)\s*만\s*원', text)
    if m:
        val = int(float(m.group(1)) * 10000)
        if 1000 <= val <= 10_000_000:
            return val

    # 숫자+원: "38,000원" / "38000원"
    for m in re.finditer(r'(\d[\d,]{2,})\s*원', text):
        val = _parse_price_str(m.group(1))
        if val:
            return val

    return None


def extract_orig_price(text):
    for p in [r'정가[:\s]*(\d[\d,]*)', r'원가[:\s]*(\d[\d,]*)',
              r'시중가[:\s]*(\d[\d,]*)', r'소비자가[:\s]*(\d[\d,]*)']:
        m = re.search(p, text)
        if m:
            val = _parse_price_str(m.group(1))
            if val:
                return val
    return None


def parse_date(month, day, year=None):
    y = year or datetime.now().year
    try:
        d = date(y, int(month), int(day))
        if d < date.today():
            d = date(y + 1, int(month), int(day))
        return d.isoformat()
    except ValueError:
        return None


def extract_date_range(text):
    """공구 기간 추출 → (시작일, 종료일) YYYY-MM-DD 또는 None"""
    # 범위 패턴: 6/25~7/2, 6.25-7.2, 6월25일~7월2일
    range_pats = [
        r'(\d{1,2})[./](\d{1,2})\s*[~\-–]+\s*(\d{1,2})[./](\d{1,2})',
        r'(\d{1,2})월\s*(\d{1,2})일?\s*[~\-–]+\s*(\d{1,2})월\s*(\d{1,2})일?',
    ]
    for p in range_pats:
        m = re.search(p, text)
        if m:
            sm, sd, em, ed = m.groups()
            start = parse_date(sm, sd)
            end   = parse_date(em, ed)
            if start and end:
                return start, end

    # 단일 마감일 패턴
    single_pats = [
        r'~\s*(\d{1,2})[./](\d{1,2})',
        r'마감[:\s]*(\d{1,2})[./](\d{1,2})',
        r'(\d{1,2})[./](\d{1,2})\s*마감',
        r'(\d{1,2})월\s*(\d{1,2})일',
    ]
    for p in single_pats:
        m = re.search(p, text)
        if m:
            end = parse_date(m.group(1), m.group(2))
            if end:
                return None, end

    return None, None


def make_title(caption):
    lines = [l.strip() for l in caption.split("\n") if l.strip()]
    if not lines:
        return "공구 게시글"
    for line in lines:
        # 해시태그·이모지·특수문자로만 이루어진 줄, 너무 짧은 줄 건너뜀
        clean = re.sub(r'[#\U0001F000-\U0001FFFF☀-⟿\s]', '', line)
        if len(clean) < 4:
            continue
        if line.startswith("#"):
            continue
        return (line[:60] + "…") if len(line) > 60 else line
    # 모든 줄이 걸러지면 첫 줄 사용
    return (lines[0][:60] + "…") if len(lines[0]) > 60 else lines[0]


def categorize(text):
    scores = {cat: 0 for cat in CATEGORY_KEYWORDS}
    for cat, kws in CATEGORY_KEYWORDS.items():
        for kw in kws:
            if kw in text:
                scores[cat] += 1
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "life"


# 상시판매 신호 — 있으면 공구가 아니다 (한정 기간이 핵심이므로)
_ALWAYS_ON = ("상시판매", "상시 판매", "상시할인", "상시 할인", "상시구매", "상시 구매")

# 정보성/팁 게시글 신호 — 공구 키워드가 있어도 이게 있으면 제외
_INFO_SIGNALS = (
    "이렇게 하면", "이렇게 보관", "이런 경우", "알고 계셨나요", "꿀팁", "tip",
    "방법을 알려", "주의하세요", "조심하세요", "알아두세요", "참고하세요",
    "후기입니다", "사용후기", "체험단모집", "체험단 모집", "체험단신청", "체험단 신청",
    "협찬", "광고", "내돈내산 아님",
)

# 공구 종료 선언 신호
_CLOSED_SIGNALS = (
    "마감됐습니다", "마감되었습니다", "마감완료", "판매종료", "공구종료",
    "종료되었", "종료됐", "판매가 종료", "공구가 종료", "마감했습니다",
)

# 공구 키워드
_GONGGU_KW = (
    "공구", "공동구매", "공구중", "공구가", "공구오픈", "공구마감", "공구진행", "공구알림",
    "같이사요", "함께사요", "모집중", "모집", "소량공구", "공구가격",
    "마감임박", "마감 임박", "한정수량", "한정판매", "수량한정", "오늘마감", "오늘 마감", "마감일",
    "오픈안내", "오픈 안내", "오픈알림", "오픈 알림", "오픈예정", "오픈 예정",
    "기획전", "선착순", "입고안내", "재입고", "2차오픈", "3차오픈", "차오픈",
    "구매링크", "구매 링크", "구매하기", "주문하기", "주문링크",
    "할인코드", "특가", "단독특가", "공식판매", "판매시작", "판매오픈",
)

def _end_date_passed(caption):
    """캡션에서 마감일을 추출해 이미 지났으면 True 반환.
    parse_date()의 연도 자동 보정 없이 올해 기준으로만 판단한다."""
    today = date.today()

    # 범위 패턴: 6/25~7/2, 6월25일~7월2일
    range_pats = [
        r'(\d{1,2})[./](\d{1,2})\s*[~\-–]+\s*(\d{1,2})[./](\d{1,2})',
        r'(\d{1,2})월\s*(\d{1,2})일?\s*[~\-–]+\s*(\d{1,2})월\s*(\d{1,2})일?',
    ]
    for p in range_pats:
        m = re.search(p, caption)
        if m:
            try:
                end = date(today.year, int(m.group(3)), int(m.group(4)))
                return end < today
            except ValueError:
                pass

    # 단일 마감일 패턴
    single_pats = [
        r'~\s*(\d{1,2})[./](\d{1,2})',
        r'마감[:\s]*(\d{1,2})[./](\d{1,2})',
        r'(\d{1,2})[./](\d{1,2})\s*마감',
        r'(\d{1,2})월\s*(\d{1,2})일',
    ]
    for p in single_pats:
        m = re.search(p, caption)
        if m:
            try:
                end = date(today.year, int(m.group(1)), int(m.group(2)))
                return end < today
            except ValueError:
                pass

    return False  # 날짜 없으면 만료되지 않은 것으로 간주


def is_gonggu_post(caption, config=None):
    """공구 게시글인지 판정. 핵심 조건은 '한정 기간'.
    상시판매/정보성/종료 표현이 있으면 제외하고, 공구 키워드나 명시적 마감일이 있으면 공구로 본다."""
    if not caption:
        return False

    cfg = config or {}
    extra_include = cfg.get("include_keywords", [])
    extra_exclude = cfg.get("exclude_keywords", [])

    cap_lower = caption.lower()
    if any(kw in caption for kw in _ALWAYS_ON):
        return False
    if any(kw in cap_lower for kw in _INFO_SIGNALS):
        return False
    if any(kw in caption for kw in _CLOSED_SIGNALS):
        return False
    if any(kw in caption for kw in extra_exclude):
        return False

    # 날짜가 명시되어 있고 이미 지났으면 제외 (기간 없는 건 수집)
    if _end_date_passed(caption):
        return False

    if any(kw in caption for kw in extra_include) or any(kw in caption for kw in _GONGGU_KW):
        return True

    # 키워드 없어도 캡션에 미래 마감일이 있으면 공구로 간주
    _, end = extract_date_range(caption)
    if end:
        try:
            return date.fromisoformat(end) >= date.today()
        except ValueError:
            pass
    return False


# ── 이미지 다운로드 ───────────────────────────────────────────────────────────

def download_image(cdn_url, shortcode):
    if not _HAS_REQUESTS:
        return None
    local = IMG_DIR / f"{shortcode}.jpg"
    if local.exists():
        return f"/scraped/{shortcode}.jpg"
    try:
        r = _requests.get(cdn_url, headers={
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
            "Referer": "https://www.instagram.com/",
        }, timeout=10)
        r.raise_for_status()
        local.write_bytes(r.content)
        return f"/scraped/{shortcode}.jpg"
    except:
        return None


# ── Instaloader 초기화 ────────────────────────────────────────────────────────

def make_loader():
    return instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        save_metadata=False,
        compress_json=False,
        quiet=True,
        user_agent=(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        ),
    )


def login(L, username=None, password=None, interactive=False):
    """로그인 시도. 성공 시 True, 실패 시 False"""
    username = username or os.environ.get("INSTAGRAM_USERNAME", "")
    password = password or os.environ.get("INSTAGRAM_PASSWORD", "")

    # 저장된 세션 시도
    if SESSION_FILE.exists() and username:
        try:
            L.load_session_from_file(username, str(SESSION_FILE))
            print(f"✅ 저장된 세션으로 로그인: @{username}")
            return True
        except Exception as e:
            print(f"  세션 만료됨, 재로그인 필요: {e}")

    # 자격증명으로 로그인
    if not username and interactive:
        username = input("인스타그램 아이디: ").strip()
    if not password and interactive:
        password = getpass.getpass("비밀번호: ")

    if username and password:
        try:
            L.login(username, password)
            L.save_session_to_file(str(SESSION_FILE))
            print(f"✅ 로그인 성공, 세션 저장됨: @{username}")
            return True
        except instaloader.exceptions.BadCredentialsException:
            print("❌ 아이디/비밀번호가 틀렸습니다")
        except instaloader.exceptions.TwoFactorAuthRequiredException:
            code = input("📱 2단계 인증 코드 입력: ").strip()
            try:
                L.two_factor_login(code)
                L.save_session_to_file(str(SESSION_FILE))
                print(f"✅ 로그인 성공 (2FA), 세션 저장됨: @{username}")
                return True
            except Exception as e2:
                print(f"❌ 2FA 실패: {e2}")
        except Exception as e:
            msg = str(e)
            if "Checkpoint required" in msg:
                # URL 추출
                import re as _re
                url_match = _re.search(r'Point your browser to (/\S+)', msg)
                checkpoint_url = ("https://www.instagram.com" + url_match.group(1)) if url_match else "https://www.instagram.com/challenge"
                print("\n🔐 인스타그램 보안 인증이 필요합니다.")
                print(f"\n아래 URL을 브라우저에서 열고 인증을 완료하세요:\n")
                print(f"  {checkpoint_url}\n")
                input("인증 완료 후 Enter 키를 누르세요...")
                try:
                    L.login(username, password)
                    L.save_session_to_file(str(SESSION_FILE))
                    print(f"✅ 로그인 성공, 세션 저장됨: @{username}")
                    return True
                except Exception as e3:
                    print(f"❌ 재시도 실패: {e3}")
            else:
                print(f"❌ 로그인 실패: {e}")

    print("⚠️  로그인 없이는 스크래핑이 불가합니다.")
    print("   .env.local 에 INSTAGRAM_USERNAME / INSTAGRAM_PASSWORD 를 설정하거나")
    print("   python3 scraper.py --setup 을 실행하세요")
    return False


def post_to_dict(post, shortcode):
    caption = post.caption or ""
    cat = categorize(caption)
    local_img = download_image(post.url, shortcode)
    start_date, end_date = extract_date_range(caption)

    return {
        "id":         abs(hash(shortcode)) % (10**9),
        "shortcode":  shortcode,
        "title":      make_title(caption),
        "account":    f"@{post.owner_username}",
        "cat":        cat,
        "price":      extract_price(caption) or 0,
        "origPrice":  extract_orig_price(caption),
        "start_date": start_date or "",
        "deadline":   end_date or "",
        "img":        local_img or post.url,
        "url":        f"https://www.instagram.com/p/{shortcode}/",
        "profile_url":f"https://www.instagram.com/{post.owner_username}/",
        "participants": post.likes or 0,
        "comments":   getattr(post, "comments", 0) or 0,
        "avatar":     CAT_EMOJI.get(cat, "🛍️"),
        "caption":    caption[:500],
        "scraped_at": datetime.now().isoformat(),
        "source":     "scraper",
        "published":  False,                         # 검수 대기 (관리자 보완 후 공개)
    }


# ── 데이터 저장 ───────────────────────────────────────────────────────────────

def load_posts():
    if not OUTPUT_FILE.exists(): return [], set()
    posts = json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))
    seen  = {p.get("shortcode") for p in posts if p.get("shortcode")}
    return posts, seen


def save_posts(posts):
    posts.sort(key=lambda p: p.get("scraped_at",""), reverse=True)
    OUTPUT_FILE.write_text(json.dumps(posts, ensure_ascii=False, indent=2), encoding="utf-8")


def write_status(last_count, error=None):
    """스크래퍼 종료 상태를 기록. 웹앱(route.ts)이 이 값을 읽어 last_count를 표시한다."""
    STATUS_FILE.write_text(json.dumps({
        "running": False,
        "last_run": datetime.now().isoformat(),
        "last_count": last_count,
        "error": error,
    }, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Instagram API (requests 직접 호출) ───────────────────────────────────────

_IG_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    ),
    "X-IG-App-ID": "936619743392459",
    "Accept": "*/*",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Referer": "https://www.instagram.com/",
}


def _get_browser_cookies():
    try:
        import browser_cookie3
        cj = browser_cookie3.chrome(domain_name="instagram.com")
        return {c.name: c.value for c in cj}
    except Exception:
        return {}


def _ig_session(cookies):
    s = _requests.Session()
    s.headers.update(_IG_HEADERS)
    s.cookies.update(cookies)
    csrf = cookies.get("csrftoken", "")
    if csrf:
        s.headers["X-CSRFToken"] = csrf
    return s


def _fetch_profile_posts_api(username, cookies, limit, seen, loader=None, config=None):
    """Instagram 비공식 모바일 API로 게시글 수집"""
    # instaloader 세션 쿠키 우선 사용 (browser_cookie3보다 안정적)
    if loader is not None:
        try:
            il_cookies = {c.name: c.value for c in loader.context._session.cookies}
            if il_cookies.get("sessionid"):
                cookies = il_cookies
        except Exception:
            pass

    s = _ig_session(cookies)

    # 1) 유저 ID 조회
    r = s.get(
        f"https://www.instagram.com/api/v1/users/web_profile_info/?username={username}",
        timeout=15,
    )
    if r.status_code != 200:
        raise Exception(f"프로필 조회 실패 ({r.status_code}): {r.text[:200]}")

    user = r.json()["data"]["user"]
    user_id = user["id"]

    # web_profile_info 응답에 최근 게시글이 포함되어 있음 (피드 API 불필요)
    edges = (
        user.get("edge_owner_to_timeline_media", {}).get("edges", [])
        or user.get("edge_felix_video_timeline", {}).get("edges", [])
    )
    if not edges:
        raise Exception("게시글 데이터 없음 (edge_owner_to_timeline_media 비어 있음)")

    new_posts = []
    count = 0

    for edge in edges:
        if count >= limit:
            break
        node = edge.get("node", {})
        shortcode = node.get("shortcode", "")
        if not shortcode or shortcode in seen:
            count += 1
            continue

        caption_edges = node.get("edge_media_to_caption", {}).get("edges", [])
        caption_text = caption_edges[0]["node"]["text"] if caption_edges else ""

        if not is_gonggu_post(caption_text, config):
            count += 1
            continue

        img_url = node.get("display_url", "") or node.get("thumbnail_src", "")
        local_img = download_image(img_url, shortcode) if img_url else None
        start_date, end_date = extract_date_range(caption_text)
        cat = categorize(caption_text)

        post_data = {
            "id":          abs(hash(shortcode)) % (10**9),
            "shortcode":   shortcode,
            "title":       make_title(caption_text),
            "account":     f"@{username}",
            "cat":         cat,
            "price":       extract_price(caption_text) or 0,
            "origPrice":   extract_orig_price(caption_text),
            "start_date":  start_date or "",
            "deadline":    end_date or "",
            "img":         local_img or img_url,
            "url":         f"https://www.instagram.com/p/{shortcode}/",
            "profile_url": f"https://www.instagram.com/{username}/",
            "participants": node.get("edge_liked_by", {}).get("count", 0),
            "comments":    node.get("edge_media_to_comment", {}).get("count", 0),
            "avatar":      CAT_EMOJI.get(cat, "🛍️"),
            "caption":     caption_text[:500],
            "scraped_at":  datetime.now().isoformat(),
            "source":      "scraper",
            "published":   False,
        }
        new_posts.append(post_data)
        seen.add(shortcode)
        price_str = f"{post_data['price']:,}원" if post_data['price'] else "가격미상"
        print(f"  ✔ {post_data['title'][:35]} | {price_str}")
        count += 1
        time.sleep(DELAY_POST)

    return new_posts


# ── 스크래핑 ──────────────────────────────────────────────────────────────────

def scrape_profiles(L, profiles, limit, existing_posts, seen, config=None):
    new_posts = []
    cookies = _get_browser_cookies() if _HAS_REQUESTS else {}
    cfg = config or {}

    for username in profiles:
        print(f"\n👤 @{username} 스크래핑 중...")

        if _HAS_REQUESTS:
            try:
                posts = _fetch_profile_posts_api(username, cookies, limit, seen, loader=L, config=cfg)
                new_posts += posts
            except Exception as e:
                print(f"  ❌ @{username} API 오류: {e}")
        else:
            try:
                profile = instaloader.Profile.from_username(L.context, username)
                count = 0
                for post in profile.get_posts():
                    if count >= limit: break
                    shortcode = post.shortcode
                    if shortcode in seen:
                        count += 1; continue
                    caption = post.caption or ""
                    if not is_gonggu_post(caption, cfg):
                        count += 1; time.sleep(0.5); continue
                    try:
                        data = post_to_dict(post, shortcode)
                        new_posts.append(data)
                        seen.add(shortcode)
                        price_str = f"{data['price']:,}원" if data['price'] else "가격미상"
                        print(f"  ✔ {data['title'][:35]} | {price_str}")
                    except Exception as e:
                        print(f"  ⚠️ 포스트 처리 오류: {e}")
                    count += 1
                    time.sleep(DELAY_POST)
            except Exception as e:
                print(f"  ❌ @{username} 오류: {e}")

        time.sleep(DELAY_PROFILE)
    return new_posts


def scrape_hashtags(L, hashtags, limit, existing_posts, seen):
    new_posts = []
    for tag in hashtags:
        print(f"\n🔍 #{tag} 스크래핑 중...")
        count = 0
        try:
            hashtag = instaloader.Hashtag.from_name(L.context, tag)
            for post in hashtag.get_posts():
                if count >= limit: break
                shortcode = post.shortcode
                if shortcode in seen:
                    count += 1; continue
                caption = post.caption or ""
                if not is_gonggu_post(caption):
                    count += 1; time.sleep(0.5); continue
                try:
                    data = post_to_dict(post, shortcode)
                    new_posts.append(data)
                    seen.add(shortcode)
                    print(f"  ✔ {data['title'][:35]}")
                except Exception as e:
                    print(f"  ⚠️ {e}")
                count += 1
                time.sleep(DELAY_POST)
        except instaloader.exceptions.LoginRequiredException:
            print(f"  ⚠️ #{tag}: 로그인 필요 (--setup 실행)")
            break
        except Exception as e:
            print(f"  ❌ #{tag} 오류: {e}")
        time.sleep(DELAY_PROFILE)
    return new_posts


def scrape_single_post(url_or_shortcode):
    """단일 인스타그램 게시글을 URL 또는 숏코드로 수집."""
    m = re.search(r'instagram\.com/(?:p|reel)/([A-Za-z0-9_-]+)', url_or_shortcode)
    shortcode = m.group(1) if m else url_or_shortcode.strip().rstrip('/')

    existing_posts, seen = load_posts()
    if shortcode in seen:
        write_status(0, f"이미 수집된 게시글: {shortcode}")
        print(f"⚠️  이미 수집된 게시글입니다: {shortcode}")
        return

    L = make_loader()
    ok = login(L)
    if not ok:
        write_status(0, "인스타그램 로그인 실패")
        return

    try:
        print(f"🔍 게시글 수집 중: {shortcode}")
        post = instaloader.Post.from_shortcode(L.context, shortcode)
        data = post_to_dict(post, shortcode)
        existing_posts.insert(0, data)
        save_posts(existing_posts)
        write_status(1)
        price_str = f"{data['price']:,}원" if data['price'] else "가격미상"
        print(f"✅ 수집 완료: {data['title'][:40]} | {price_str}")
    except Exception as e:
        write_status(0, str(e))
        print(f"❌ 수집 실패: {e}")


def scrape(profiles=None, hashtags=None, limit=DEFAULT_LIMIT,
           username=None, password=None, interactive=False):
    L = make_loader()
    ok = login(L, username, password, interactive)
    if not ok:
        write_status(0, "인스타그램 로그인 실패")
        return []

    existing_posts, seen = load_posts()
    print(f"📂 기존 데이터: {len(existing_posts)}개")

    config = load_config()
    if config.get("include_keywords") or config.get("exclude_keywords"):
        print(f"⚙️  키워드 설정: 포함 {len(config['include_keywords'])}개, 제외 {len(config['exclude_keywords'])}개")

    new_posts = []

    # 1) 프로필 스크래핑 (hashtags만 지정된 경우 건너뜀)
    profiles_to_use = profiles or (
        [] if hashtags else (
            json.loads(PROFILES_FILE.read_text(encoding="utf-8"))
            if PROFILES_FILE.exists() else []
        )
    )
    if profiles_to_use:
        new_posts += scrape_profiles(L, profiles_to_use, limit, existing_posts, seen, config=config)
    elif not hashtags:
        print("\n⚠️  tracked_profiles.json 에 팔로우할 계정을 추가하세요.")
        print('   예: ["shop_account1", "gonggu_kr"]')

    # 2) 해시태그 스크래핑 (선택)
    if hashtags:
        new_posts += scrape_hashtags(L, hashtags, limit, existing_posts, seen)

    all_posts = existing_posts + new_posts
    save_posts(all_posts)
    write_status(len(new_posts))

    print(f"\n{'='*50}")
    print(f"✅ 완료! 신규: {len(new_posts)}개 | 전체: {len(all_posts)}개")
    print(f"{'='*50}")
    return all_posts


# ── 브라우저 쿠키로 세션 생성 ─────────────────────────────────────────────────

def setup_from_browser(browser="chrome", username=None):
    """이미 브라우저에 로그인된 인스타 세션 쿠키를 빌려 세션 파일을 만든다.
    자동 로그인을 거치지 않으므로 체크포인트를 회피할 수 있다.
    username을 주면 로그인 확인(test_login)을 건너뛴다 — 차단(rate limit) 상태에서
    요청 폭주를 피하기 위함."""
    try:
        import browser_cookie3
    except ImportError:
        print("❌ browser_cookie3 가 필요합니다: ./venv/bin/pip install browser_cookie3")
        return False

    print(f"\n[브라우저 쿠키 모드] {browser} 에서 instagram.com 쿠키를 읽는 중...")
    print(f"  ※ {browser} 가 실행 중이면 종료한 뒤 다시 시도하세요. (쿠키 DB 잠김 방지)")
    try:
        cj = getattr(browser_cookie3, browser)(domain_name="instagram.com")
    except Exception as e:
        print(f"❌ 브라우저 쿠키를 읽지 못했습니다: {e}")
        return False

    L = make_loader()
    L.context.max_connection_attempts = 1   # 차단 상태에서 재시도 폭주 방지
    L.context._session.cookies.update(cj)

    # username을 직접 받으면 확인을 건너뛰고 바로 저장 (차단 회피)
    if username:
        L.context.username = username
        L.save_session_to_file(str(SESSION_FILE))
        print(f"\n✅ 세션 저장 완료 (쿠키, 확인 생략): @{username} → {SESSION_FILE}")
        print("   ※ 실제 수집 시 쿠키 유효성이 확인됩니다.")
        return True

    try:
        username = L.test_login()
    except Exception as e:
        print(f"❌ 로그인 확인 중 오류: {e}")
        print("   인스타가 일시 차단(rate limit) 중일 수 있습니다. 몇 분 뒤")
        print("   --username 인스타아이디 를 붙여 다시 시도하세요 (확인 단계 생략).")
        return False

    if not username:
        print(f"⚠️  {browser} 에서 인스타 로그인 쿠키를 찾지 못했습니다.")
        print(f"   {browser} 에서 instagram.com 에 로그인되어 있는지 확인하고 다시 시도하세요.")
        return False

    L.context.username = username
    L.save_session_to_file(str(SESSION_FILE))
    print(f"\n✅ 세션 저장 완료 (브라우저 쿠키): @{username} → {SESSION_FILE}")
    print("   이제 관리자 페이지에서 '지금 수집'을 눌러보세요.")
    return True


# ── CLI ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="공구모아 스크래퍼 v2")
    parser.add_argument("--setup",   action="store_true", help="로그인 후 세션 저장 (최초 1회)")
    parser.add_argument("--from-browser", help="브라우저 쿠키로 세션 생성 (chrome/firefox/edge/brave/safari)")
    parser.add_argument("--post",     help="특정 게시글 URL 또는 숏코드 수집")
    parser.add_argument("--profile", "-p", nargs="+",    help="스크래핑할 계정 (공백으로 구분)")
    parser.add_argument("--hashtag", "-t", nargs="+",    help="스크래핑할 해시태그")
    parser.add_argument("--limit",   "-l", type=int, default=DEFAULT_LIMIT)
    parser.add_argument("--username","-u", help="인스타그램 아이디")
    parser.add_argument("--password",      help="인스타그램 비밀번호")
    args = parser.parse_args()

    print("🛍️  공구모아 스크래퍼 v2")

    if args.from_browser:
        setup_from_browser(args.from_browser, username=args.username)
    elif args.post:
        scrape_single_post(args.post)
    elif args.setup:
        print("\n[세션 설정 모드]")
        username = args.username or os.environ.get("INSTAGRAM_USERNAME", "")
        if not username:
            username = input("인스타그램 아이디: ").strip()

        print(f"\n▶ instaloader CLI로 로그인 시도 중...")
        print("  체크포인트가 뜨면 브라우저 URL을 열고, 이메일/SMS 인증 코드를 여기에 입력하세요.\n")

        import subprocess as _sp
        # sys.executable: 현재 실행 중인 파이썬(venv)을 그대로 사용해야 instaloader를 찾는다
        result = _sp.run(
            [
                sys.executable, "-m", "instaloader",
                "--login", username,
                "--sessionfile", str(SESSION_FILE),
            ],
            cwd=str(BASE_DIR),
        )
        if SESSION_FILE.exists():
            print(f"\n✅ 세션 저장 완료 → {SESSION_FILE}")
            print("   이제 관리자 페이지에서 '스크래핑 시작'을 눌러보세요.")
        else:
            print("\n❌ 세션 저장 실패. 위 오류 메시지를 확인하세요.")
    else:
        scrape(
            profiles  = args.profile,
            hashtags  = args.hashtag,
            limit     = args.limit,
            username  = args.username,
            password  = args.password,
            interactive = False,
        )
