# k-skill 컨트리뷰트 계획

대상 리포: `NomaDamas/k-skill` (PR base 브랜치: `dev`)
이번 PR 두 건: **(1) `seoul-bike-share`** → **(2) `ev-charger-nearby`** 순차 진행.

---

## Phase 0 — 환경/컨벤션 사전 확인

권한 제약: 현재 세션 GitHub MCP는 `tkddnjs-dlqslek/contributeyong` 한 곳에만 접근 가능 → NomaDamas/k-skill 직접 issue/PR 불가. 두 가지 옵션 중 결정 필요:
- **A (권장)**: 이 리포(`contributeyong`)에 스킬 폴더를 완성도 있게 스테이징해두고, 사용자가 NomaDamas/k-skill 본인 포크로 옮겨 수동 PR
- **B**: 사용자가 본인 포크 리포명을 세션에 추가해주면 그쪽으로 직접 push

작업 전 한 번만 수행:
1. `seoul-subway-arrival` 스킬을 reference로 raw fetch → 디렉토리 구조, `SKILL.md` frontmatter, scripts 런타임(JS/TS or Python), docs 형식, changeset 형식 확정
2. `CONTRIBUTING.md`, `docs/install.md`, `docs/setup.md`, `docs/security-and-secrets.md`, `docs/sources.md` 한 번 통독 → README 표 위치/포맷 확인
3. 두 스킬에 적용할 공통 scaffold 템플릿을 contributeyong에 정리

---

## Phase 1 — `seoul-bike-share` (먼저 PR)

### 1.1 스킬 정의
- 이름: `seoul-bike-share`
- 카테고리: `location` / `transit`
- 한 줄 설명: 서울시 공공자전거(따릉이) 실시간 대여소 위치·잔여 자전거·잔여 거치대 조회
- 라이선스: MIT

### 1.2 데이터 소스
- 서울 열린데이터광장 — 공공자전거 실시간 대여정보
  `http://openapi.seoul.go.kr:8088/{KEY}/json/bikeList/{START}/{END}/`
- 페이지 1~1000, 1001~2000, 2001~3000 호출해서 약 2,700+ 정류소 전체 수집 후 메모리/디스크 캐시
- 응답 필드: `stationId`, `stationName`, `stationLatitude`, `stationLongitude`, `parkingBikeTotCnt`(잔여 자전거), `rackTotCnt`(총 거치대), `shared`(거치율)
- 키: data.seoul.go.kr 무료 발급 (인증서 X, 1일 트래픽 제한)

### 1.3 MVP 기능 (3개)
1. **`find_nearest_stations(lat, lng, n=5)`** — 가까운 N개 대여소 + 자전거/거치대 잔여
2. **`search_stations_by_name(query)`** — 대여소명/지명 키워드 검색
3. **`station_status(station_id_or_name)`** — 특정 대여소 상세 (잔여, 거치율, 좌표)

각 함수는 "지금 대여 가능한 자전거 수"와 "지금 반납 가능한 빈 거치대 수" 둘 다 반환 (반납 필요한 사용자 케이스).

### 1.4 Out of Scope
- 대여/결제 자동화 (계정 리스크, 정책 보류 카테고리)
- 이용 이력
- 타도시 공유자전거(타슈/누비자/이파킹) — follow-up PR로 분리

### 1.5 산출물
```
seoul-bike-share/
  SKILL.md                  # frontmatter + 9개 표준 섹션
  scripts/                  # reference 스킬 런타임에 맞춤
    find_nearest.{ts,py}
    search_by_name.{ts,py}
    station_status.{ts,py}
  package.json or pyproject.toml (reference 따라)
  README.md (선택)
docs/features/seoul-bike-share.md
.changeset/seoul-bike-share-init.md
README.md (루트, "어떤 걸 할 수 있나" 표에 1행 추가)
```

### 1.6 테스트
- 강남역·홍대입구·시청·여의도 좌표로 `find_nearest_stations` smoke
- 빈 결과/잘못된 좌표/API 키 누락 케이스 failure modes 검증
- 응답 캐시 TTL 결정 (실시간성 vs API 부담; 1~3분 권장)

### 1.7 PR 워크플로
1. NomaDamas/k-skill에 issue 등록: `feat: 서울 따릉이 실시간 대여소 조회 스킬`
   - 본문: 외부 시그널(지하철 도착 짝 누락), API 소스, MVP 스코프, 후속 EV 충전 예고
2. 이슈 번호 N 수령 → 브랜치 `feature/#N`
3. 본인 포크에서 작업 → `NomaDamas/k-skill:dev`로 PR
4. PR 본문에 (a) 외부 시그널, (b) MVP 스코프, (c) 테스트 결과, (d) 키 발급 가이드, (e) follow-up 계획 명시

---

## Phase 2 — `ev-charger-nearby` (Phase 1 머지 또는 리뷰 시작 후)

### 2.1 스킬 정의
- 이름: `ev-charger-nearby`
- 카테고리: `location` (cheap-gas-nearby 짝)
- 한 줄: 환경부 공공데이터 기반 전기차 충전소 위치·타입·실시간 사용가능 여부 조회

### 2.2 데이터 소스
- 한국환경공단_전기차충전소정보 (data.go.kr)
  `https://apis.data.go.kr/B552584/EvCharger/getChargerInfo`
- 핵심 필드: `statNm`(충전소), `chgerType`(충전기 종류 코드), `addr`, `lat`, `lng`, `useTime`, `busiNm`(운영기관), `stat`(상태 코드), `statUpdDt`(상태 갱신시각), `parkingFree`, `note`
- 충전기 타입 코드: 01 DC차데모 / 02 AC완속 / 03 DC차데모+AC3상 / 04 DC콤보 / 05 DC차데모+DC콤보 / 06 DC차데모+AC3상+DC콤보 / 07 AC3상
- 상태 코드: 1 통신이상 / 2 충전대기 / 3 충전중 / 4 운영중지 / 5 점검중 / 9 상태미확인
- 키: data.go.kr 일반 인증키

### 2.3 MVP 기능 (3개)
1. **`find_nearest_chargers(lat, lng, n=5, types=None, only_available=True)`** — 거리순 N개, 타입 필터, "지금 사용 가능"만 옵션
2. **`charger_status(stat_id)`** — 특정 충전소 상태/타입/주차료/운영시간
3. **`search_chargers_by_address(addr_keyword)`** — 주소 키워드 검색

### 2.4 Out of Scope
- 결제/예약 (사업자별 별도 API, 인증 무거움)
- 단가 비교 (사업자별 분리되어 표준 데이터 없음)
- 경로 통합(EV 친화 경로) — `korean-transit-route` 확장으로 미루기

### 2.5 산출물
Phase 1과 동일 구조. 시드 데이터(코드 매핑) 별도 JSON으로 분리해서 가독성 확보.

### 2.6 테스트
- 강남/판교/제주/고속도로 휴게소 좌표 smoke
- `only_available=True` 가 `stat=2` 만 필터하는지 확인
- 상태 갱신시각(statUpdDt) 노출해서 stale 여부를 LLM이 사용자에게 알리도록 SKILL.md에 명시

### 2.7 PR 워크플로
Phase 1과 동일. PR 본문에 Phase 1과의 카테고리 일관성(주유소 ↔ EV) 강조.

---

## 공통 리스크 / 결정 필요 항목

| 항목 | 메모 |
|---|---|
| 런타임 | reference 스킬 확인 후 JS/TS 또는 Python 통일 |
| API 키 정책 | k-skill-proxy hosted fallback 등록 여부는 메인테이너 선택 — 일단 user-key 가이드 디폴트로 작성 |
| 캐시 TTL | 따릉이 60–180s, EV 충전 30–60s |
| 좌표 입력 | zipcode-search/카카오 geocoding 의존 X, lat/lng 직접 받음 (geocode는 LLM에 위임) |
| 컨트리뷰트 경로 | A: contributeyong에 스테이징 / B: 본인 포크 권한 추가 — **사용자 결정 필요** |
| 키 발급 | 사용자가 data.seoul.go.kr · data.go.kr 키 1개씩 발급 가능한지 확인 (테스트용) |

---

## 합의 후 즉시 시작할 작업
1. `seoul-subway-arrival` raw fetch → scaffold 컨벤션 확정
2. contributeyong에 `seoul-bike-share/` 디렉토리 생성 + SKILL.md 초안 작성
3. API 키 발급 가이드 1페이지
4. issue 본문 초안 (사용자가 NomaDamas/k-skill에 붙여넣기용)
