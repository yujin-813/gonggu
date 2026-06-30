#!/usr/bin/env python3
"""
인플루언서 링크 수집기 디스패처
influencer_sources.json 의 source_type 에 따라 수집 방식을 라우팅한다.
"""
import json
import sys
from datetime import datetime
from pathlib import Path

DATA_DIR               = Path(__file__).parent / "data"
INFLUENCER_SOURCES_FILE = DATA_DIR / "influencer_sources.json"
INPOCK_SOURCES_FILE    = DATA_DIR / "inpock_sources.json"
INPOCK_STATUS_FILE     = DATA_DIR / "inpock_status.json"


def load_sources():
    """influencer_sources.json 읽기 (없으면 inpock_sources.json 에서 마이그레이션)."""
    if INFLUENCER_SOURCES_FILE.exists():
        try:
            return json.loads(INFLUENCER_SOURCES_FILE.read_text("utf-8"))
        except Exception:
            return []
    if INPOCK_SOURCES_FILE.exists():
        try:
            handles = json.loads(INPOCK_SOURCES_FILE.read_text("utf-8"))
            now = datetime.now().isoformat()
            migrated = [
                {
                    "id": f"inpock_{h}",
                    "url": f"https://link.inpock.co.kr/{h}",
                    "source_type": "inpock",
                    "handle": h,
                    "influencer_name": h,
                    "added_at": now,
                }
                for h in handles
            ]
            tmp = str(INFLUENCER_SOURCES_FILE) + ".tmp"
            Path(tmp).write_text(json.dumps(migrated, ensure_ascii=False, indent=2), "utf-8")
            Path(tmp).rename(INFLUENCER_SOURCES_FILE)
            return migrated
        except Exception:
            return []
    return []


def write_status(new_count, skipped_count, error=None):
    status = {
        "running": False,
        "last_run": datetime.now().isoformat(),
        "last_count": new_count,
        "skipped_count": skipped_count,
        "error": error,
    }
    tmp = str(INPOCK_STATUS_FILE) + ".tmp"
    Path(tmp).write_text(json.dumps(status, ensure_ascii=False, indent=2), "utf-8")
    Path(tmp).rename(INPOCK_STATUS_FILE)


def collect_inpock(source):
    """인포크 수집 — inpock.py 의 collect() 재사용."""
    import inpock
    handle = source.get("handle", "")
    if not handle:
        print(f"  ⚠️  핸들이 없습니다: {source}")
        return 0, 0
    return inpock.collect([handle], source_obj=source, write_result=False)


def collect_linkhub(source):
    """링크트리·릿.리 등 링크허브 페이지 — 외부 링크를 수동 검수 후보로 출력."""
    try:
        import requests
        from bs4 import BeautifulSoup
        ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        r = requests.get(source["url"], headers={"User-Agent": ua}, timeout=15)
        soup = BeautifulSoup(r.text, "html.parser")
        links = [a["href"] for a in soup.find_all("a", href=True) if a["href"].startswith("http")]
        print(f"  ℹ️  {source['influencer_name']}: 링크 {len(links)}개 발견 — 수동 검수 필요")
    except Exception as e:
        print(f"  ⚠️  링크허브 수집 실패 ({source['url']}): {e}")
    return 0, 0


def collect_unknown(source):
    """미지원 소스 — 로그만 남긴다."""
    print(f"  ℹ️  미지원 소스 타입 ({source.get('source_type', '?')}): {source['url']} — 수동 검수 필요")
    return 0, 0


def run():
    sources = load_sources()
    if not sources:
        print("⚠️  등록된 소스가 없습니다.")
        write_status(0, 0, "등록된 소스가 없습니다")
        sys.exit(0)

    total_new = 0
    total_skipped = 0

    for source in sources:
        st   = source.get("source_type", "unknown")
        name = source.get("influencer_name") or source.get("handle", "?")
        print(f"\n🔗 {name} ({st}) 수집 중...")

        try:
            if st == "inpock":
                new, skipped = collect_inpock(source)
            elif st in ("linktree", "littly"):
                new, skipped = collect_linkhub(source)
            else:
                new, skipped = collect_unknown(source)
        except Exception as e:
            print(f"  ⚠️  수집 실패: {e}")
            new, skipped = 0, 0

        total_new     += new
        total_skipped += skipped

    write_status(total_new, total_skipped)
    print(f"\n{'=' * 50}")
    print(f"✅ 완료! 신규 검수대기: {total_new}개 | 비공구 제외: {total_skipped}개")
    print(f"{'=' * 50}")


if __name__ == "__main__":
    run()
