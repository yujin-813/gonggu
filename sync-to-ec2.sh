#!/bin/bash
# ============================================================
# 공구모아 — 로컬 수집 → EC2 병합 동기화
# ============================================================
#
# 구조: 로컬(집 IP)에서 인스타를 수집하고, '신규 공구만' EC2로 보낸다.
#       EC2는 기존 데이터(수동등록·검수상태·공개여부)를 그대로 보존하고
#       신규만 '검수 대기'로 추가한다. 서버 데이터는 절대 덮어쓰지 않는다.
#
# 인스타 차단 위험을 집 IP로 분산하고, EC2(클라우드 IP)에서는
# 스크래핑을 하지 않으므로 안정적으로 서비스만 한다.
#
# ── 동작 방식 ──────────────────────────────────────────────
#   1) (옵션) 로컬에서 인스타 수집
#   2) 로컬 posts.json 을 /api/ingest 로 전송 → 서버가 신규만 병합 추가
#      (덮어쓰기 X — shortcode/id 중복은 건너뜀)
#   3) 수집 이미지는 추가만 (rsync, 서버 기존 이미지 삭제 안 함)
#
# ── 사용 전 1회 설정 ────────────────────────────────────────
#   아래 BASE_URL / EC2_HOST / EC2_PATH / SSH_KEY 를 본인 값으로 수정.
#   .env.local 의 ADMIN_PASSWORD 로 인증한다.
#
# ── 평소 사용 ──────────────────────────────────────────────
#   bash sync-to-ec2.sh            # 로컬 데이터만 서버로 병합
#   bash sync-to-ec2.sh --scrape   # 수집부터 하고 병합
# ============================================================

set -e
cd "$(dirname "$0")"

# ── 설정 (본인 값으로 수정) ─────────────────────────────────
BASE_URL="https://gonggu.askdatanugget.com"   # 서비스 주소
EC2_HOST="ubuntu@YOUR_EC2_IP"                  # 예: ubuntu@13.125.xxx.xxx
EC2_PATH="/home/ubuntu/gonggu"                 # EC2 프로젝트 경로
SSH_KEY="$HOME/.ssh/your-key.pem"              # ssh 키 파일
# ───────────────────────────────────────────────────────────

if [ "$EC2_HOST" = "ubuntu@YOUR_EC2_IP" ]; then
  echo "❌ 먼저 스크립트 상단의 EC2_HOST / EC2_PATH / SSH_KEY 를 본인 값으로 수정하세요."
  exit 1
fi

PW=$(grep '^ADMIN_PASSWORD=' .env.local | cut -d= -f2-)
if [ -z "$PW" ]; then
  echo "❌ .env.local 에서 ADMIN_PASSWORD 를 찾지 못했습니다."
  exit 1
fi

# 1) (옵션) 로컬 수집
if [ "$1" = "--scrape" ]; then
  echo "▶ 1. 로컬 인스타 수집..."
  ./venv/bin/python scraper.py
fi

# 2) 서버에 로그인 (httpOnly 쿠키 발급)
echo "▶ 서버 인증..."
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT
http_code=$(curl -s -o /dev/null -w "%{http_code}" -c "$COOKIE_JAR" \
  -X POST "$BASE_URL/api/auth" \
  -H 'Content-Type: application/json' \
  -d "{\"password\":\"$PW\"}")
if [ "$http_code" != "200" ]; then
  echo "❌ 서버 인증 실패 (HTTP $http_code). ADMIN_PASSWORD 가 서버와 같은지 확인하세요."
  exit 1
fi

# 3) posts.json 을 병합 API 로 전송 (신규만 추가, 기존 보존)
echo "▶ 신규 공구 병합 전송..."
resp=$(curl -s -b "$COOKIE_JAR" \
  -X POST "$BASE_URL/api/ingest" \
  -H 'Content-Type: application/json' \
  -d "{\"posts\": $(cat data/posts.json)}")
echo "   서버 응답: $resp"

# 4) 수집 이미지 동기화 (추가만 — 서버 기존 이미지 삭제 안 함)
if [ -d public/scraped ] && [ -n "$(ls -A public/scraped 2>/dev/null)" ]; then
  echo "▶ 수집 이미지 동기화..."
  rsync -avz -e "ssh -i $SSH_KEY" public/scraped/ "$EC2_HOST:$EC2_PATH/public/scraped/"
fi

echo "✅ 완료 — 서버 기존 데이터는 보존되고 신규 공구만 검수대기로 추가됐습니다."
echo "   $BASE_URL/admin 에서 검수 후 공개하세요."
