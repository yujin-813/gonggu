# 용어사전

> 화면에 쓰는 말 ↔ 코드·데이터 이름의 대응표. 마지막 갱신: 2026-08-25

---

## 핵심 용어

| 화면에 쓰는 말 | 코드·DB 이름 | 뜻 |
|---|---|---|
| 공구 | `Post` | 인플루언서가 여는 공동구매 게시물 하나 |
| 공구가 | `post.price` | 이 공구의 **대표가**. 최저가가 아닐 수 있다 |
| 정가 | `post.origPrice` | 관리자가 직접 확인해 넣은 비교 기준가 |
| 네이버 최저가 | `post.market_price` | 네이버쇼핑 API가 자동으로 찾은 값 |
| 판정 | `getDealVerdict()` / `DealVerdict` | 이 공구가 싼지에 대한 결론 |
| 구성 / 세트 | `post.options[]` / `DealOption` | 한 공구 안의 세트 옵션 |
| 대체 구매 링크 | `post.purchase_links[]` | 공구 종료 후 살 수 있는 제휴 링크 |
| 꿀픽 | `post.is_featured` / `featured_order` | 관리자가 직접 고른 추천 공구 |
| 상시딜 | `is_evergreen_deal` / `is_always_on` | 기간 없이 계속 파는 것 |
| 소진시 마감 | `sale_until_sold_out` | 고정 마감일 없이 재고 소진 시 종료 |
| 단독 공구 | `is_exclusive_deal` | 다른 곳에서 안 파는 상품 (관리자가 확인) |
| 여러 상품 | `is_multi_option` | 골라담기·모음전처럼 상품마다 가격이 다른 공구 |
| 미확인 | `getCompareState()` → `unchecked` | 비교가를 아직 아무도 안 본 공구. 관리자 일감 |
| 비교가 있음 | `getCompareState()` → `compared` | 판정에 쓸 비교가가 붙어 있는 공구 |
| 비교불가 | `getCompareState()` → `incomparable` · `compare_none_at` | 사람이 찾아본 끝에 비교할 동일상품이 없다고 확인한 공구 |
| 동일상품 후보 | `CompareCandidate` / `findCompareCandidates()` | 관리자에게 내미는 비교가 후보. 고르면 비교가가 된다 |
| 곧 열려요 / 오픈예정 | `PeriodState` → `upcoming` | 아직 안 열린 공구. 캘린더에 담아 둘 수 있다 |
| 캘린더 알림 | `/api/calendar/[id]` · `TrafficSource` → `calendar` | 우리가 푸시를 보내는 게 아니라 고객 폰 캘린더가 알린다 |
| 대체 상품 | `purchase_links[].kind = 'alternative'` | 비슷한 용도의 **다른** 상품. 판정 근거로 안 쓴다. 종료 화면에서 "똑같은 상품은 못 찾았어요"로 따로 보여준다 |
| 종료 확인 | `post.ended_at` | 관리자가 "이 공구 끝났다"고 직접 확인한 시각. 마감일을 몰라도 마감 처리된다 |
| 제휴 문의 | `Inquiry` (`data/inquiries.json`) | `/propose`로 들어온 인플루언서·브랜드 제안. `/api/posts/request`(공구 등록 요청)와는 다른 창구다 |
| KST 오늘 | `kstToday()` (`lib/kst.ts`) | 서버는 UTC로 돈다. 날짜 경계를 다루려면 `new Date()`가 아니라 반드시 이 함수를 거칠 것 |
| 마감일 미확인 | `PeriodState` → `deadline_unknown` | 수집기가 마감일을 못 읽은 공구. 상시딜과 다르다 — 21일 지나면 마감으로 본다 |

---

## 쓰지 않는 말

| 쓰지 않음 | 대신 | 이유 |
|---|---|---|
| 최저가 | 공구가 / 대표가 | `price`가 최저가라는 보장이 없다 |
| 할인율 (카드에서 단독으로) | "정가보다 N원(M%) 저렴" | 무엇 대비인지 밝히지 않으면 오해를 준다 |
| 판정 대기 | **가격 비교 전** | 우리 사정이 아니라 고객이 알 수 있는 사실로 (`D-018`) |
| 미확인 / 비교불가 (고객 화면에서) | **가격 비교 전** | 비교 상태는 관리자 전용이다. 고객에게는 둘 다 똑같이 보인다 (`D-023`) |
| 마감일 미확인 (고객 화면에서) | (배지를 안 붙인다) | 상시딜이라고 단정하지 않는다. "OO부터 진행 중"까지만 말한다 (`D-024`) |
| 보통딜 | 괜찮딜 / 고민딜 | 4단계로 나눌 때 폐기 (`D-004`) |
| 상품 | 공구 | 우리가 파는 게 아니다 |
| 회원 / 유저 | 방문자 | 로그인 개념이 없다 (관리자 제외) |

---

## 헷갈리는 쌍 — 실수의 근원지

### `status` vs `published`

**같은 게 아니다.** 공개 여부의 실질 판정은 `published`가 한다. `status`는 관리 상태 라벨이다.
현재 운영 데이터에 둘이 어긋난 건이 16건 있다.

### `origPrice` vs `market_price`

| | `origPrice` | `market_price` |
|---|---|---|
| 출처 | 관리자가 직접 입력 | 네이버 API 자동 |
| 신뢰도 | `verified` | `auto` — 공구가의 50% 미만이면 버림 |
| 자동 채우기 | **절대 안 함** | 수집기가 채움 |

자동값을 `origPrice`에 넣으면 저장 한 번에 영구 고정된다. 절대 하지 말 것.

### `purchase_links` vs `market_url`

| | `purchase_links[]` | `market_url` |
|---|---|---|
| 목적 | 대체 **구매** (제휴) | 가격 **비교** |
| 공정위 고지 | **항상 붙는다** | 안 붙는다 |

섞으면 제휴가 아닌 링크에 "수수료를 제공받습니다"가 붙어 거짓 고지가 된다 (`D-003`).

### `purchase_url` vs `url` vs `store_url`

| 필드 | 가리키는 곳 |
|---|---|
| `purchase_url` | 실제 구매 페이지. **이게 없으면 공개 불가** |
| `url` | 인플루언서 인스타 프로필 |
| `store_url` | 원래 "구매처 보존용"으로 만든 필드. 현재 `inpock.py`가 `purchase_url`과 **같은 값을 넣는다** (inpock.py:1284). 읽는 쪽은 `purchase_url`만 쓴다 |

### `isCustomerVisible()` vs `isPagePublic()` vs `isStillUpcoming()`

| 함수 | 쓰는 곳 | 마감 처리 |
|---|---|---|
| `isCustomerVisible()` | 목록 | 마감 **제외** |
| `isPagePublic()` | 상세 페이지 존재 여부·사이트맵 | 마감 **포함** |
| `isStillUpcoming()` | 오픈 예정 판단 | 오픈일이 지나면 false |

목록용을 상세에 쓰면 마감 공구가 404난다 (`D-002`).

### 등급 vs 상태

`honey`/`good`/`hmm`/`meh`는 **등급**이고 `pending`/`exclusive`/`multi`는 **상태**다.
`DealVerdict.grade`는 등급일 때만 값이 있고 상태일 때는 `null`이다. `display`는 둘 다 있다.

### 오늘의 공구 vs 마감 임박

| | 기준 |
|---|---|
| 오늘의 공구 | 오늘 **오픈**했거나 오늘 **수집**된 것 |
| 마감 임박 | 48시간 안에 **마감**되는 것 |

예전에 "오늘 마감"을 오늘의 공구에 넣었더니 두 섹션이 100% 겹쳤다.

### `_dj_sid` vs `_dj_vid`

| | 저장소 | 수명 |
|---|---|---|
| `_dj_sid` (세션) | sessionStorage | 탭 단위 |
| `_dj_vid` (방문자) | localStorage | 브라우저 단위 — 신규/재방문 판별용 |

---

## 상태값 목록

**`Post.status`** — `needs_review`(검수 필요) · `excluded`(제외) · `published`(공개 중) · `upcoming`(오픈 예정) · `ready`(공개 가능) · `candidate`(공구 후보)

**`VerdictState`** — `honey`(꿀딜) · `good`(괜찮딜) · `hmm`(고민딜) · `meh`(아쉽딜) · `pending`(가격 비교 전) · `exclusive`(단독 공구) · `multi`(여러 상품)

**`Category`** — `kids`(유아동) · `life`(생활) · `food`(식품) · `health`(건강) · `beauty`(뷰티)

**`ClickType`** — `groupbuy`(공구 보기) · `coupang` · `naver` · `other` · `detail`

**`TrafficSource`** — `instagram`(인스타그램) · `kakao`(카카오톡) · `naver_search`(네이버 검색) · `google_search`(구글 검색) · `other_search`(기타 검색) · `inapp`(앱 내 브라우저·경로 미상) · `external`(외부 사이트) · `direct`(직접 방문·북마크)

---

## 화면 라벨 ↔ 코드 값 대응

| 화면 | 코드 |
|---|---|
| 꿀딜 / 괜찮딜 / 고민딜 / 아쉽딜 | `honey` / `good` / `hmm` / `meh` |
| 가격 비교 전 | `pending` |
| 단독 공구 | `exclusive` |
| 여러 상품 | `multi` |
| 유아동 / 생활 / 식품 / 건강 / 뷰티 | `kids` / `life` / `food` / `health` / `beauty` |
| 전체 / 상시딜 | `all` / `evergreen` — **`Category`가 아니다.** 전용 페이지도 없다 |
| 검수 필요 / 공개 가능 / 공개됨 / 마감됨 / 제외 | `needs_review` / `ready` / `published` / (마감은 상태가 아니라 날짜 계산) / `excluded` |

---

## 외부 데이터 용어

| 외부 | 우리 쪽 |
|---|---|
| 인포크 링크페이지의 `block` | 공구 후보 1건 |
| 인포크 `calendar` 블록의 `schedule_list` | 오픈 예정(`upcoming`) 공구 |
| 카페24 `option_value` / `option_price` | `DealOption.name` / `.price` |
| 위즈 계열 `od_option1` select | `DealOption` 목록 |
| 아임웹 `load_option.cm`의 `option_html` | `DealOption` 목록 |
| 네이버쇼핑 API `lprice` | `market_price` |
