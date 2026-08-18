/** @type {import('next').NextConfig} */
const nextConfig = {
  // 배포 때 돌아가는 서버 밑에서 .next를 덮어쓰면 빌드가 끝날 때까지(1분 남짓) 사이트가
  // 깨진다. deploy.sh는 다른 디렉터리에 빌드해 두었다가 다 되면 통째로 바꿔치기한다.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '*.cdninstagram.com' },
      { protocol: 'https', hostname: 'scontent.cdninstagram.com' },
    ],
  },
}

export default nextConfig
