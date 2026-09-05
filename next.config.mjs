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
  // /admin은 sitemap에도 없고 어디서도 링크가 안 걸리지만, 로그인 없이도 페이지 자체(로그인
  // 폼)는 열린다 — 그 URL이 어쩌다 발견돼도 검색엔진이 색인하지 않도록 HTTP 헤더로 한 번
  // 더 막는다. <meta name="robots">보다 확실하다(HTML을 안 읽어도 적용됨).
  async headers() {
    return [
      {
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ]
  },
}

export default nextConfig
