#!/bin/bash
# ============================================================
# 공구모아 배포 스크립트 — gonggu.askdatanugget.com
# ============================================================
#
# [최초 배포 절차 — EC2에서 한 번만 실행]
#
# 1. EC2 접속
#    ssh -i your-key.pem ubuntu@<EC2_IP>
#
# 2. Node.js / PM2 / Python 설치 (없으면)
#    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
#    sudo apt-get install -y nodejs python3 python3-venv python3-pip
#    sudo npm install -g pm2
#
# 3. 저장소 클론
#    git clone https://github.com/yujin-813/gonggu.git ~/gonggu
#    cd ~/gonggu
#
# 4. 환경 변수 파일 생성 (절대 git에 올리지 말 것)
#    cat > .env.local << 'EOF'
#    ADMIN_PASSWORD=여기에_비밀번호
#    INSTAGRAM_USERNAME=인스타_아이디
#    INSTAGRAM_PASSWORD=인스타_비밀번호
#    EOF
#
# 5. 빌드 & 시작
#    npm ci
#    npm run build
#    mkdir -p public/uploads
#    pm2 start ecosystem.config.js
#    pm2 save
#    pm2 startup   # 부팅 시 자동 시작 명령어 출력 → 복사 후 실행
#
# 6. Nginx 설정
#    sudo cp nginx.conf.example /etc/nginx/sites-available/gonggu
#    sudo ln -s /etc/nginx/sites-available/gonggu /etc/nginx/sites-enabled/gonggu
#    sudo nginx -t && sudo systemctl reload nginx
#
# 7. SSL 인증서 (Let's Encrypt)
#    sudo apt install -y certbot python3-certbot-nginx
#    sudo certbot --nginx -d gonggu.askdatanugget.com
#
# [이후 배포는 이 스크립트 실행]
#    bash deploy.sh
# ============================================================

set -e

echo "▶ 코드 업데이트..."
git pull origin main

echo "▶ 의존성 설치..."
npm ci --production=false

echo "▶ 빌드..."
npm run build

echo "▶ 파이썬 스크래퍼 환경 구성..."
if [ ! -d venv ]; then
  python3 -m venv venv
fi
venv/bin/pip install -q --upgrade pip
venv/bin/pip install -q -r requirements.txt
echo "  ✓ instaloader 등 파이썬 의존성 설치 완료"

echo "▶ 데이터 디렉토리 확인..."
mkdir -p public/uploads data

echo "▶ PM2 재시작..."
pm2 reload gonggu || pm2 start ecosystem.config.js

echo "✅ 배포 완료 → https://gonggu.askdatanugget.com"
