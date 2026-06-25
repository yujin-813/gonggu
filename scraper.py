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


# ── 경로 설정 ────────────────────────────────────────────────────────────────

BASE_DIR          = Path(__file__).parent
OUTPUT_FILE       = BASE_DIR / "posts.json"
SESSION_FILE      = BASE_DIR / ".instagram_session"
PROFILES_FILE     = BASE_DIR / "tracked_profiles.json"
IMG_DIR           = BASE_DIR / "public" / "scraped"
IMG_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_LIMIT     = 30
DELAY_POST        = 2.0
DELAY_PROFILE     = 5.0


# ── 카테고리 ─────────────────────────────────────────────────────────────────

CATEGORY_KEYWORDS = {
    "fashion": ["원피스","티셔츠","바지","코트","자켓","블라우스","스커트","가방","신발","패션","의류","옷","니트","청바지","레깅스"],
    "beauty":  ["립스틱","파운데이션","크림","에센스","세럼","토너","로션","마스크팩","선크림","뷰티","화장품","스킨케어","향수"],
    "food":    ["삼겹살","과일","채소","쌀","김치","식품","간식","커피","견과류","홍삼","젤리","초콜릿","빵","밀키트","음료"],
    "life":    ["수건","이불","베개","청소","주방","생활용품","인테리어","디퓨저","수납","식기","냄비","프라이팬"],
    "kids":    ["아기","유아","어린이","키즈","장난감","기저귀","분유","유모차","아동복","학용품"],
    "health":  ["비타민","오메가3","건강","영양제","보충제","프로바이오틱스","콜라겐","루테인","단백질","다이어트"],
    "pet":     ["강아지","고양이","반려","펫","사료","간식","패드","목줄","급수기"],
    "digital": ["폰케이스","이어폰","에어팟","노트북","태블릿","디지털","충전기","보조배터리","키보드"],
}
CAT_EMOJI = {"fashion":"👗","beauty":"💄","food":"🍱","life":"🏠","kids":"🧸","health":"💊","pet":"🐾","digital":"📱"}


# ── 파싱 유틸 ─────────────────────────────────────────────────────────────────

def extract_price(text):
    patterns = [
        r'판매가[:\s]*(\d{1,3}(?:,\d{3})*)',
        r'공구가[:\s]*(\d{1,3}(?:,\d{3})*)',
        r'가격[:\s]*(\d{1,3}(?:,\d{3})*)',
        r'(\d{1,3}(?:,\d{3})*)\s*원',
        r'₩\s*(\d{1,3}(?:,\d{3})*)',
    ]
    for p in patterns:
        m = re.search(p, text)
        if m:
            val = int(m.group(1).replace(",",""))
            if 1000 <= val <= 10_000_000:
                return val
    return None


def extract_orig_price(text):
    for p in [r'정가[:\s]*(\d{1,3}(?:,\d{3})*)', r'원가[:\s]*(\d{1,3}(?:,\d{3})*)',
              r'시중가[:\s]*(\d{1,3}(?:,\d{3})*)', r'소비자가[:\s]*(\d{1,3}(?:,\d{3})*)']:
        m = re.search(p, text)
        if m:
            val = int(m.group(1).replace(",",""))
            if 1000 <= val <= 10_000_000:
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
    if not lines: return "공구 게시글"
    first = lines[0]
    if first.startswith("#"):
        first = lines[1] if len(lines) > 1 else "공구 게시글"
    return (first[:60] + "…") if len(first) > 60 else first


def categorize(text):
    scores = {cat: 0 for cat in CATEGORY_KEYWORDS}
    for cat, kws in CATEGORY_KEYWORDS.items():
        for kw in kws:
            if kw in text:
                scores[cat] += 1
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "life"


def is_gonggu_post(caption):
    return any(kw in caption for kw in ["공구","공동구매","공구중","공구가","같이사요","함께사요","모집중","공구알림"])


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


# ── 스크래핑 ──────────────────────────────────────────────────────────────────

def scrape_profiles(L, profiles, limit, existing_posts, seen):
    new_posts = []
    for username in profiles:
        print(f"\n👤 @{username} 스크래핑 중...")
        count = 0
        try:
            profile = instaloader.Profile.from_username(L.context, username)
            for post in profile.get_posts():
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
                    price_str = f"{data['price']:,}원" if data['price'] else "가격미상"
                    print(f"  ✔ {data['title'][:35]} | {price_str}")
                except Exception as e:
                    print(f"  ⚠️ 포스트 처리 오류: {e}")
                count += 1
                time.sleep(DELAY_POST)
        except instaloader.exceptions.LoginRequiredException:
            print(f"  ⚠️ @{username}: 로그인 필요")
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


def scrape(profiles=None, hashtags=None, limit=DEFAULT_LIMIT,
           username=None, password=None, interactive=False):
    L = make_loader()
    ok = login(L, username, password, interactive)
    if not ok:
        return []

    existing_posts, seen = load_posts()
    print(f"📂 기존 데이터: {len(existing_posts)}개")

    new_posts = []

    # 1) 프로필 스크래핑 (우선)
    profiles_to_use = profiles or (
        json.loads(PROFILES_FILE.read_text(encoding="utf-8"))
        if PROFILES_FILE.exists() else []
    )
    if profiles_to_use:
        new_posts += scrape_profiles(L, profiles_to_use, limit, existing_posts, seen)
    elif not hashtags:
        print("\n⚠️  tracked_profiles.json 에 팔로우할 계정을 추가하세요.")
        print('   예: ["shop_account1", "gonggu_kr"]')

    # 2) 해시태그 스크래핑 (선택)
    if hashtags:
        new_posts += scrape_hashtags(L, hashtags, limit, existing_posts, seen)

    all_posts = existing_posts + new_posts
    save_posts(all_posts)

    print(f"\n{'='*50}")
    print(f"✅ 완료! 신규: {len(new_posts)}개 | 전체: {len(all_posts)}개")
    print(f"{'='*50}")
    return all_posts


# ── CLI ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="공구모아 스크래퍼 v2")
    parser.add_argument("--setup",   action="store_true", help="로그인 후 세션 저장 (최초 1회)")
    parser.add_argument("--profile", "-p", nargs="+",    help="스크래핑할 계정 (공백으로 구분)")
    parser.add_argument("--hashtag", "-t", nargs="+",    help="스크래핑할 해시태그")
    parser.add_argument("--limit",   "-l", type=int, default=DEFAULT_LIMIT)
    parser.add_argument("--username","-u", help="인스타그램 아이디")
    parser.add_argument("--password",      help="인스타그램 비밀번호")
    args = parser.parse_args()

    print("🛍️  공구모아 스크래퍼 v2")

    if args.setup:
        print("\n[세션 설정 모드]")
        username = args.username or os.environ.get("INSTAGRAM_USERNAME", "")
        if not username:
            username = input("인스타그램 아이디: ").strip()

        print(f"\n▶ instaloader CLI로 로그인 시도 중...")
        print("  체크포인트가 뜨면 브라우저 URL을 열고, 이메일/SMS 인증 코드를 여기에 입력하세요.\n")

        import subprocess as _sp
        result = _sp.run(
            [
                "python3", "-m", "instaloader",
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
