# 03 · 시스템 — 지금 상태

> **"지금"만 쓴다.** 변경 이력과 "예전에는 ○○였다"는 여기 쓰지 않는다. 과거는 `02-DECISIONS.md`에 있다.
> 마지막 갱신: 2026-08-23

---

## 한눈에 보기

| | |
|---|---|
| 단계 | 운영 중 · 실사용자 있음 (2026-08-19 기준 사람 방문 고유 IP 163명/2일) |
| 스택 | Next.js 14 (App Router) · React 18 · TypeScript · 파이썬 수집기 |
| 저장소 | **파일 기반** — `data/*.json`. DB 없음 |
| 코드 규모 | `lib/` 2,687줄 · `app/admin` + `components/` 4,785줄 · 파이썬 2,986줄 |
| 데이터 규모 | 게시물 2,317건 (공개 277건) · 인플루언서 소스 58개 · analytics 31일치 |
| 배포 | EC2 `13.125.121.62` · PM2(fork, 포트 3002) + nginx · `bash deploy.sh` |
| 도메인 | https://gonggu.asknuggetdata.com |

---

## 기능

### 있는 것

**고객 화면**
- 홈 큐레이션 — 꿀픽(관리자 선정), 오늘의 공구, 마감 임박, 이달의 공구, 카테고리별, 인플루언서별, 많이 보는 공구, 종료됐지만 살 수 있는 공구
- 공구 판정 — 4단계 등급 + 비등급 3상태, 판정 근거 표, 세트 옵션 표
- 상세 페이지 `/post/[id]` — 마감돼도 URL이 살아 있고 종료 안내·대체 구매처를 보여준다
- 랜딩 페이지 — `/today`, `/deadline`, `/monthly`, `/category/[cat]`, `/influencer/[account]`, `/influencers`, `/collection/[id]`
- 검색 (마감 공구 포함), 찜, 공유(카카오/네이티브/복사 — utm 자동 부착)
- 공유 카드 이미지 `/api/og/deal/[id]` — 판정 결과를 그린 800×400 PNG
- SEO — JSON-LD(WebSite/ItemList/Product·Offer/BreadcrumbList), sitemap.xml(356 URL), robots.txt, 네이버·구글 소유확인

**관리자 `/admin`**
- 공구 목록·검수·공개/숨김·수정·삭제, 필터 탭(개수 0이면 자동 숨김)
- 채우기 화면 — **비교 상태 3분류**(미확인 / 비교불가 / 비교가 있음) + 종료 공구용(제휴 링크) 탭.
  행마다 **공구 판매 페이지 열기 · 검색어 복사 · 네이버쇼핑/쿠팡 파트너스 바로 열기**가 있다
  (작업 순서가 "판매 페이지에서 구성 확인 → 같은 구성 검색 → 가격 입력"이라 그 순서로 놓았다).
  동일상품 후보를 내밀고 고르면 비교가로 저장하며, 찾아봐도 없으면 사유를 골라 비교불가로 남긴다.
  목록은 **최근 14일 상세 조회 많은 순** — 상세 페이지가 열릴 때 찍는 `clickType: 'detail'`이 곧 조회수다.
  ⚠️ 갓 올라온 공구는 조회가 0이라 뒤로 밀린다 (조회 동률일 때 최신순으로 받는다)
- 「종료·링크없음」 탭도 **최근 14일 조회 많은 순**이다. 마감 공구가 상세 조회의 56%를 받는데
  190건이 살 곳을 못 알려주고 있고, 그중 상위 10건이 조회의 86%다 (2026-08-23)
- **「마감일 미확인」 탭** — 수집기가 마감일을 못 읽은 공구. 마감일을 넣거나 상시딜로 확정한다.
  이미 자동으로 내려간 것까지 함께 보여준다 (되살릴 대상이 화면에서 사라지면 안 되므로)
- 옵션 관리 — 수동 입력, **붙여넣기 파서**, **옵션 가져오기**(자동 수집)
- 꿀픽 선정·순서, 상시딜·소진시마감 토글, 여러상품 토글
- 인플루언서 소스 관리·개별 수집, 컬렉션 관리
- **수익화 현황** — 상품별 `상세조회 · 검색유입 · 공구 클릭 · 쿠팡 · 네이버 · 제휴링크 유무`를
  한 표로. 「수익화 필요」(사람이 보고 있는데 나갈 곳이 없는 상품) 필터가 기본이다
- 방문자 분석 — 일자별 방문/재방문, **유입 경로**, 많이 본 상품, 많이 공유된 상품
- 인플루언서 이름이 핸들 그대로인 소스를 표시하고 인스타 프로필로 바로 보낸다
  (검색 결과에 &quot;bobpro__ 공구&quot;로 나가면 안 눌린다 — 인플루언서 페이지 CTR 3.9% vs 상세 9.7~16.8%)
- 관리자 IP 관리, 인스타용 링크 복사(utm 부착)

**수집 (파이썬)**
- `collector.py` — 소스 타입에 따라 수집기 라우팅. cron 하루 2회(09:00, 14:00)
- `inpock.py` — 인포크 링크페이지 파싱, 가격·마감일·브랜드·카테고리 추출, 네이버쇼핑 비교가 조회, **세트 옵션 자동 수집**, 상태 자동 분류
- `backfill_options.py` / `backfill_market_price.py` / `backfill_brand.py` / `backfill_category.py` — 기존 데이터 보강
- `check_links.py` — cron 매일 20:00

### 만들다 만 것

| | 상태 |
|---|---|
| 푸시 알림 | `lib/push.ts`, `/api/push/subscribe`, `scripts/send-deadline-alerts.js`가 있고 cron이 매시 15분에 돈다. **구독자 2명**이라 사실상 미가동 ⚠️ |
| `scraper.py` (인스타 직접 수집) | 2026-06-30 이후 미사용. `npm run scrape`로만 호출됨 |
| 컬렉션 | 기능은 있으나 운영 데이터에 `collections.json` 360바이트 — 거의 안 씀 ⚠️ |
| `group_key` (같은 상품 공구 묶기) | 필드와 API(`/api/posts/group-history`)는 있으나 실제 데이터 0건 |

### 다음에 만들 것

- 판정 커버리지 올리기 — 비교가 없는 공구 채우기 (가장 큰 병목)
- ⚠️ 그 외는 사장님이 정할 것. `01-CONSTITUTION.md`의 "지금 집중하는 것" 참고

---

## 도메인 모델

### Post (`lib/types.ts`)

핵심 필드만. 전체는 `lib/types.ts` 참고.

```
id, shortcode, title, account, cat, price, origPrice, deadline, start_date, img, url
brand, purchase_url, market_url, market_price, market_price_note
options[], is_multi_option, purchase_links[]
ended_at, compare_none_at, compare_none_reason, compare_none_note
status, published, review_reason[], is_featured, featured_order
is_always_on, is_evergreen_deal, sale_until_sold_out, is_exclusive_deal
custom_verdict, custom_verdict_detail, custom_verdict_cls
influencer_name, influencer_handle, influencer_id, source, source_type
extraction_debug, scraped_at, collection_status, collection_error
```

### 상태값 전체

**`Post.status`** — 관리 상태
| 값 | 의미 | 현재 건수 |
|---|---|---|
| `needs_review` | 검수 필요 | 1,047 |
| `excluded` | 제외됨 (비공구 등) | 899 |
| `published` | 공개 중 | 261 |
| `upcoming` | 오픈 예정 | 52 |
| `ready` | 공개 가능 | 42 |
| `candidate` | 공구 후보 | 0 |
| (없음) | 옛 데이터 | 16 ⚠️ |

> `status`와 `published`는 **별개 필드**다. 공개 여부의 실질 판정은 `published`가 한다.
> 현재 `published: true`가 277건인데 `status: 'published'`는 261건 — 16건 차이가 있다 ⚠️

**`VerdictState`** (`lib/dealGrade.ts`) — 화면에 보이는 판정
| 값 | 라벨 | 조건 |
|---|---|---|
| `honey` | 꿀딜 | 할인율 15% 이상 |
| `good` | 괜찮딜 | 5% 이상 15% 미만 |
| `hmm` | 고민딜 | −5% 초과 5% 미만 |
| `meh` | 아쉽딜 | −5% 이하 (더 비쌈) |
| `pending` | 가격 비교 전 | 믿을 만한 비교가가 없음 |
| `exclusive` | 단독 공구 | 관리자가 `is_exclusive_deal` 확인 |
| `multi` | 여러 상품 | 골라담기·모음전 등 판정 불가 유형 |

**`PeriodState`** (`lib/period.ts`) — 기간 상태. `upcoming` / `evergreen` / `sold_out_only` / `range` / `deadline_only` / `deadline_unknown`
> `ended_at`(관리자가 종료를 확인한 시각)이 있으면 `PeriodState`와 무관하게 마감으로 본다 — 사람 확인이 날짜 계산보다 정확하다(`D-026`).
> `deadline_unknown`은 **마감일을 모른다**는 뜻이다. 예전에는 `evergreen`(상시딜)과 한 덩어리였는데, 그래서 이미 끝난 공구가 무기한 노출됐다(`D-024`).
> 상시딜은 관리자 플래그가 붙은 것만이다. `deadline_unknown`은 시작일(없으면 수집일)로부터 `DEADLINE_UNKNOWN_DAYS`(21일)가 지나면 마감으로 본다.

**`CompareState`** (`lib/compareState.ts`) — 비교가 작업 상태. **관리자 전용이라 고객 화면에는 안 나간다**
| 값 | 라벨 | 조건 |
|---|---|---|
| `compared` | 비교가 있음 | 판정에 쓸 비교가가 실제로 붙어 있다 |
| `incomparable` | 비교불가 | 사람이 찾아본 뒤 `compare_none_at`을 남겼다. **자동으로 되는 경로는 없다** |
| `unchecked` | 미확인 | 둘 다 아니다 — 관리자가 처리해야 할 일감 |

> 셋 중 저장되는 건 비교불가뿐이다. 나머지 둘은 값에서 파생하므로 일괄 마이그레이션이 없다.

**`CompareNoneReason`** (`lib/types.ts`) — `exclusive` / `no_same_set` / `not_found` / `other`

**`ClickType`** (`lib/analytics.ts`) — `groupbuy` / `coupang` / `naver` / `other` / `detail`

**`TrafficSource`** (`lib/analytics.ts`) — `instagram` / `kakao` / `naver_search` / `google_search` / `other_search` / `inapp` / `external` / `direct`

**`Category`** — `kids` / `life` / `food` / `health` / `beauty`
> 화면 카테고리 바에는 `all`·`evergreen`이 더 있지만 이 둘은 `Category`가 아니고 전용 페이지도 없다.

---

## 데이터 구조

```
data/
  posts.json                2,317건 · 6.3MB   ← 전부 메모리에 올렸다 저장한다
  analytics.json            31일치 (30일 초과분 자동 정리 · postClicks·postSources 포함)
  admin_ips.json            관리자 IP (14일 TTL)
  influencer_sources.json   58개
  collections.json          거의 비어 있음
  inpock_status.json        마지막 수집 결과
public/uploads/   업로드 이미지 78MB
public/scraped/   수집 이미지 431MB
```

### 손대면 위험한 곳

| 위치 | 위험 |
|---|---|
| `lib/store.ts`의 `savePosts()` | **전체 배열을 통째로 다시 쓴다.** 동시에 두 요청이 저장하면 나중 것이 먼저 것을 덮는다. 락이 없다 ⚠️ |
| `lib/dealGrade.ts` `getDealVerdict()` | 화면의 모든 숫자가 여기서 나온다. 여기를 고치면 카드·상세·공유카드·정렬이 전부 바뀐다 |
| `AUTO_MATCH_FLOOR = 0.5` | 낮추면 잘못된 자동 매칭이 판정을 뒤집는다 (`D-006`). `lib/compareCandidates.ts`가 이 값을 읽어 "왜 후보가 판정에서 빠졌는지"를 설명한다 |
| `lib/compareCandidates.ts`의 매칭 문턱 | 풀면 엉뚱한 상품이 후보로 뜨고, 관리자가 고르는 순간 그대로 틀린 비교가가 된다 (`D-023`) |
| `lib/postGuards.ts` | 구매 링크 없는 공구의 공개를 막는 유일한 장치 |
| `DEADLINE_UNKNOWN_DAYS = 21` | **`lib/period.ts`와 `check_links.py` 양쪽에 있다.** 한쪽만 고치면 고객 화면과 링크 점검 대상이 갈라진다 (`D-024`) |
| `app/api/posts/[id]/route.ts`의 필드 allowlist | 여기 없는 필드는 관리자가 저장해도 **조용히 무시된다.** 새 필드를 추가하면 PATCH·PUT 양쪽에 넣어야 한다 |
| `middleware.ts`의 `config.matcher` | 새 관리자 API를 만들면 `isProtected()`와 `matcher` **양쪽**에 등록해야 한다. 한쪽만 하면 무방비 |
| `data/posts.json` 직접 편집 | 서버에서 스크립트로 고칠 때는 반드시 백업부터. 저장은 스크립트 끝에서 한 번만 일어난다 |
| 마감일 형식 | `YYYY-MM-DD` 문자열 비교로 판단한다. 시각이 섞이면 표시와 비교가 동시에 깨진다. `lib/period.ts`의 `dateOnly()`, `inpock.py`의 `_date_only()`가 방어한다 |

---

## 시스템 구성

```
[인스타 인플루언서 링크페이지]
        │  cron 09:00 / 14:00
        ▼
   collector.py ─→ inpock.py ─→ 네이버쇼핑 API (비교가) ✗ 폐지됨
        │                   └─→ 쇼핑몰 상세페이지 (가격·마감일·옵션)
        ▼
   data/posts.json  ←──────  관리자 화면 (/admin)
        │
        ▼
   Next.js (PM2 :3002) ←── nginx ←── https://gonggu.asknuggetdata.com
```

### 외부 의존성

| 대상 | 용도 | 실패 시 |
|---|---|---|
| ~~네이버 쇼핑 API~~ | 비교가 조회 | **폐지됨.** 2026-07-31 이후 동작 안 함 — 아래 참고 |
| 인포크(link.inpock.co.kr) | 공구 링크 수집 | 신규 수집이 멈춘다. **과도한 요청 시 400으로 일시 차단됨** ⚠️ |
| 쇼핑몰 상세페이지 | 가격·옵션 추출 | 해당 건만 실패 |
| 카카오 JS SDK | 공유 | 네이티브 공유로 폴백 |
| Let's Encrypt | HTTPS | certbot 자동 갱신 |

---

## 주요 흐름

### 1. 수집 → 공개

```
cron → collector.py → inpock.py
  링크페이지 파싱 → 구매링크 추출 → 상세페이지 fetch
  → 가격·마감일·브랜드 추출 → 세트 옵션 추출 → 네이버 비교가 조회
  → classify_status()로 상태 결정 → posts.json 앞에 추가
        ↓
관리자가 검수 → 공개하기
  → enforcePurchaseLinkRequirement() 통과해야 published
```

### 2. 판정

```
getDealVerdict(post)
 ├ 옵션에 비교가가 하나라도 있으면 → verdictFromOptions()
 │    세트별 할인율 → 중앙값으로 등급, 범위는 rateRange
 └ 아니면 단일 경로
      verified = purchase_links 가격 + origPrice   (사람이 확인)
      auto     = market_price                       (자동 매칭)
      trustedAuto = auto 중 공구가의 50% 이상만
      기준가 = [verified, trustedAuto] 중 최솟값
      → gradeFromRate()로 등급
```

### 3. 유입 경로 기록

```
첫 진입 → track.ts가 utm_source·document.referrer를 sessionStorage에 고정
       → /api/analytics POST (referrer, utmSource 동봉)
       → 봇 판정 → 관리자 판정 → classifySource()
       → daily[날짜].sources[경로]++  (view 이벤트당 1회)
```

---

## 코드를 읽어도 모르는 규칙

- **`price`는 최저가가 아니라 "대표가"다.** 수집기가 페이지에서 가져온 값이며, 보통 최저가지만 항상은 아니다.
- **`origPrice`에는 자동 수집값을 절대 넣지 않는다.** 관리자가 직접 입력한 값만. 자동값을 넣으면 저장 버튼만 눌러도 그 시점 값이 영구 고정된다.
- **`purchase_links`에는 공정위 제휴 고지가 항상 따라붙는다.** 제휴가 아닌 링크를 넣으면 거짓 고지가 된다 (`D-003`).
- **URL에 `?notrack=1`을 한 번 붙이면** 그 브라우저는 이후 통계에서 계속 제외된다. 해제는 `?notrack=0`.
- **관리자 페이지를 한 번이라도 연 브라우저**는 흔적 쿠키(1년)로 통계에서 제외된다.
- **인플루언서 이름은 `influencer_sources.json`과 `posts.json` 두 곳에 있다.** 페이지 제목은
  게시물 쪽 값을 읽으므로, 관리자가 소스에서 이름을 고치면 `/api/inpock-sources` PATCH가
  같은 계정의 게시물까지 함께 갱신한다(`posts.json`을 쓴다).
- - **끝난 걸 아는데 마감일을 모르면 `ended_at`을 쓴다.** `deadline`에 오늘 날짜를 넣으면
  우리가 모르는 마감일이 고객 화면에 적힌다. 종료 안내는 마감일이 없어도 정상으로 뜬다.
- **상품별 유입 경로(`postSources`)는 2026-08-23부터만 있다.** 그 전 기록은 방문 단위라
  상품과 안 묶여 있어 소급이 안 된다. 수익화 현황의 "검색유입" 열이 한동안 비는 건 정상이다.
- **돈이 되는 클릭은 `coupang`·`naver`·`other`뿐이다.** `groupbuy`는 판매자 링크라 수수료가 없다.
- - **쿠팡에서 찾은 비교가는 `market_price`가 아니라 `purchase_links`에 url 없이 넣는다.**
  `market_price`는 고객 화면에 무조건 "네이버 최저가"로 표시되기 때문이다. `purchase_links`는
  url이 없으면 판정에는 '쿠팡'으로 들어가되 구매 버튼으로 안 뜨고 제휴 고지도 안 붙는다.
- **`origPrice`는 실제로 거의 안 쓰인다** — 고객에게 보이는 미확인 34건 중 0건(2026-08-23).
  판매자가 쓴 값이라 근거가 약해서, 채우기 화면에서는 접어 두고 필요할 때만 편다.
- **옵션 이름의 `[87%]` 같은 표기는 판매자가 쓴 것**이고 우리 판정과 무관하다.
- 배포는 `deploy.sh`가 별도 디렉터리에 빌드 후 교체한다. 실패하면 `.next-old`로 자동 롤백한다.
- 서버에서 파이썬을 돌릴 때는 `venv/bin/python`을 쓴다.
- 긴 스크립트는 SSH가 끊기면 같이 죽는다. `nohup ... &`로 분리 실행할 것.

---

## 알려진 문제 / 기술 부채

우선순위 순. 근거를 함께 적는다.

### 1. 자동 비교가 수집이 죽어 있다 — 판정 파이프라인 중단 🔴

네이버가 **쇼핑 검색 API를 폐지**했다. 같은 키로 블로그·뉴스·백과는 200을 주는데 쇼핑·책만 `404 SE05 (존재하지 않는 검색 api)`를 준다. 앱 권한 문제가 아니라 API가 사라진 것이라 설정으로 되살릴 수 없다.

**영향:** 2026-08-06~08-20 수집 656건 중 자동 비교가가 붙은 것 **0건**. 새로 들어오는 공구가 계속 판정 없이 쌓인다. 3주 동안 아무도 몰랐다.

**대응:** 자동 수집이 되살아날 일이 없으므로(API 폐지) "멎었다"는 경고는 접었다. 대신 관리자 첫 화면이 **판정 없이 고객에게 보이는 공구 수**를 알린다(`unjudgedBacklog()`) — 채우면 줄고 다 채우면 사라진다 (`D-025`). 대체 수단은 쿠팡 파트너스 Open API 검토 중.

**근거:** `openapi.naver.com/v1/search/shop.json` → 404 SE05 (2026-08-20 실측) · `market_price` 보유 711건의 마지막 자동 수집일 2026-07-31

### 2. 저장에 락이 없다 — 데이터 유실 가능 ⚠️

`lib/store.ts`의 `savePosts()`가 2,317건 배열을 통째로 덮어쓴다. 관리자가 저장하는 동시에 파이썬 수집기가 저장하면 한쪽이 통째로 사라진다. 지금은 사용자가 한 명이라 드러나지 않았을 뿐이다.

**근거:** `lib/store.ts` · `backfill_options.py`가 끝에서 `save_posts(posts)` 한 번 호출 · cron이 하루 2회 수집 실행

### 3. 판정 대기가 27% ⚠️

고객에게 보이는 공구의 4분의 1 이상이 판정을 못 받는다. 판정기를 표방하는 제품의 핵심 지표다.
새로 들어오는 것일수록 나쁘다 — 8월 수집분은 절반 가까이가 판정을 못 받는다. 문제 1(비교가 수집 중단)이
고객 화면에서 드러나는 자리다.

**근거:** 2026-08-23 측정(`scripts/check-docs.js`) — 보이는 공구 88건 중 pending 24건.
(`D-024`로 마감일 미확인 22건이 목록에서 내려가면서 분모와 분자가 함께 줄었다.)
그중 8월 수집분 22건(8월 수집 47건의 47%), 7월 이전 16건(65건의 25%).
pending 38건 중 사람이 넣은 `origPrice`가 있는 건 0건, `market_price`는 있으나 `AUTO_MATCH_FLOOR`에
걸려 버려진 건 5건. `market_price` 보유 711건 / 전체 2,317건

**실제 유입으로 다시 보면 더 나쁘다** — 지금 방문은 사실상 전부 네이버 검색이고 대부분 공구 상세로 바로
착지한다. 검색 유입이 많은 상세 페이지 40개를 세어 보니 **146명 중 64명(44%)이 판정 없는 페이지에
떨어졌다.** 1위 착지 페이지("[트니맘x미쁨곰탕] 무항생제 가마솥 아기 한우 곰탕", 26명)가 진행 중인데도
"가격 비교 전"이다. 판정을 보러 온 사람의 절반 가까이가 판정을 못 본다.

**근거:** 2026-08-22 nginx 로그(14일) — `search.naver.com` 리퍼러로 `/post/*`에 착지한 고유 IP 기준

### 4. 검수 필요가 1,047건 — 사실상 방치

전체의 45%가 검수 대기다. 사람이 처리할 수 있는 양을 넘었다.

**근거:** `status` 분포. 자동 분류(`classify_status()`)의 기준이 보수적이라 대부분이 여기로 온다

### 5. 구매 링크 필수 규칙이 두 곳에 따로 있다

TypeScript(`lib/postGuards.ts`)와 파이썬(`inpock.py`의 `classify_status()`)이 같은 규칙을 각자 구현한다. 한쪽만 고치면 갈라진다.

**근거:** `lib/postGuards.ts` 주석에 "파이썬 수집기는 자체 classify_status()에서 이미 같은 규칙을 적용 중"이라고 명시돼 있음

### 6. `status`와 `published`가 어긋난 데이터 16건

`published: true`인데 `status`가 `published`가 아니거나 아예 없는 건이 있다.

**근거:** 운영 데이터 집계 — `status: None` 16건, `published: true` 277건 vs `status: 'published'` 261건

### 7. 색 원칙을 강제하는 장치가 없다

`01-CONSTITUTION.md`의 원칙 5는 CSS 컨벤션일 뿐이다. 새 컴포넌트에서 인라인 스타일로 임의의 색을 쓰면 막을 방법이 없다. 실제로 관리자 화면은 대부분 인라인 스타일이다.

**근거:** `app/admin/page.tsx`가 인라인 `style={{ background: '#ede9fe', ... }}` 다수 사용

### 8. 인포크가 과도한 요청에 400으로 차단한다

조사 중 100회 가까이 요청했더니 차단됐고 하루 뒤 풀렸다. 수집 주기를 늘리거나 재시도를 촘촘히 하면 다시 걸릴 수 있다.

**근거:** 2026-08-19 실측 — 차단 시 400, 해제 후 302

### 9. 이미지 431MB가 정리 없이 쌓인다

`public/scraped/`가 431MB. 제외된 공구(899건)의 이미지도 남아 있다. 삭제 로직이 없다 ⚠️

### 10. 마감된 공구 페이지가 계속 늘어난다

`isPagePublic`이 마감을 따지지 않아 사이트맵이 329 URL까지 왔다. 의도된 동작(`D-002`)이지만 상한이 없다.

### 11. `data/posts.json` 백업이 수동으로 쌓여 있다

서버에 `posts.json.bak-*` 6개(약 38MB). 정리 규칙이 없다.

---

## 운영

### 명령어

```bash
# 배포 (로컬에서)
git push origin main
ssh -i ~/.ssh/gonggu_ec2 ubuntu@13.125.121.62 'cd ~/gonggu && bash deploy.sh'

# 로컬 개발
node node_modules/.bin/next dev -p 3210     # 3000·3100은 다른 프로젝트가 쓸 수 있음

# 검증
npx tsc --noEmit
npm run build
node scripts/check-docs.js     # 이 문서의 숫자가 아직 맞는지 (어긋난 것만 출력)

# 서버 수집 (분리 실행 — SSH 끊겨도 살아남음)
cd ~/gonggu && nohup venv/bin/python collector.py > logs/collector.log 2>&1 &
cd ~/gonggu && nohup venv/bin/python backfill_options.py > logs/backfill-options.log 2>&1 &
```

### 환경변수 (`.env.local` — git에 없음)

서버 `.env.local`의 전체 항목 (2026-08-20 확인, 값은 제외).

| 이름 | 용도 | 없으면 |
|---|---|---|
| `ADMIN_PASSWORD` | 관리자 인증 | **관리자 API가 500** |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | 네이버 검색 API | **쇼핑은 폐지돼 무용지물.** 블로그·뉴스·백과는 여전히 응답함 |
| `NAVER_SITE_VERIFICATION` | 네이버 소유확인 (쉼표로 여러 개 가능) | 메타태그 생략 |
| `GOOGLE_SITE_VERIFICATION` | 구글 소유확인 | 메타태그 생략 |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | 카카오 공유 | 네이티브 공유로 폴백 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | 웹 푸시 | 알림 발송 불가 (구독자 2명이라 영향 미미) |
| `INSTAGRAM_USERNAME` / `INSTAGRAM_PASSWORD` | `scraper.py`용 | 현재 미사용 |

> cron으로 파이썬을 돌릴 때 `.env.local`이 자동 로드되지 않아, 스크립트가 직접 읽어 주입한다
> (`backfill_market_price.py` 상단). 새 스크립트를 만들 때 같은 처리가 필요하다.

### cron (서버)

```
0  9 * * *  collector.py
0 14 * * *  collector.py
15 * * * *  scripts/send-deadline-alerts.js
0 20 * * *  check_links.py
```

### 배포 전 체크리스트

1. `npx tsc --noEmit` 통과
2. `npm run build` 통과 · `node scripts/check-docs.js` 통과 (어긋나면 이 문서를 고치고 함께 커밋)
3. 로컬(`:3210`)에서 바뀐 화면 확인 — **클라이언트 컴포넌트가 `lib/landing`·`lib/store`를 import하면 `fs` 때문에 전 페이지가 500난다**
4. 데이터를 건드리는 스크립트는 `--dry-run` 먼저, `data/posts.json` 백업 후 실행
5. 배포 후 홈·관리자·바뀐 페이지 상태 코드 확인
