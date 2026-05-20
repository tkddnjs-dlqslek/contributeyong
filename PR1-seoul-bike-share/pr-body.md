# feat(seoul-bike-share): 서울 따릉이 실시간 대여소 조회 스킬 + 프록시 라우트 3종

## 요약

- 서울 열린데이터 광장 dataset `OA-13252` (공공자전거 실시간 대여정보, `bikeList`) 를 `k-skill-proxy` 경유로 조회하는 스킬 `seoul-bike-share` 추가
- `k-skill-proxy` 에 라우트 3 개 신규
  - `GET /v1/seoul-bike/nearest` → proxy 가 전체 페이지를 합쳐 사용자 좌표 기준 haversine 거리로 정렬해 상위 N 개만 반환 (90% 사용 케이스)
  - `GET /v1/seoul-bike/search` → 대여소명/지명 키워드로 검색 (좌표 없이 "망원역 따릉이")
  - `GET /v1/seoul-bike/stations` → `bikeList/{start}/{end}/` pass-through (전체 dump 가 필요할 때만)
- `seoul-subway-arrival` / `seoul-density` 와 동일한 패턴 — `SEOUL_OPEN_API_KEY` 는 서버 측에서만 주입, 사용자는 hosted proxy (`k-skill-proxy.nomadamas.org`) 단일 모드로 호출하면 키 없이 동작
- 정상 JSON 응답만 캐시, 서울 API 오류 envelope (`RESULT.CODE != "INFO-000"`) 은 캐시 우회해 인증·한도 오류가 자가 회복되도록 함
- CONTRIBUTING 가이드대로 `docs/features/seoul-bike-share.md`, `README.md` 표/리스트, `docs/sources.md`, `docs/install.md`, `docs/roadmap.md`, `packages/k-skill-proxy/README.md`, `.changeset/seoul-bike-share.md` (`k-skill-proxy` minor) 동시 갱신

## 동기 — 왜 필요한가

- 서울 지하철 도착(`seoul-subway-arrival`)이 v1 에 들어와 있는데 도시 이동의 "마지막 1 마일" 인 따릉이가 비어 있음. 대중교통 짝의 일관성 보강.
- `roadmap.md` 의 `### 그다음으로 좋은 후보` → `#### 버스/지하철 도착정보 조회` 항목과 동일한 "실시간 조회 패턴" 카테고리. 따릉이는 동일 데이터 소스(서울 열린데이터 광장) 에서 이미 검증된 endpoint 가 있고 자동승인 dataset 이라 진입장벽이 낮음.
- AI agent 가 "지금 여기서 자전거 빌릴 수 있어?" / "여기 근처 빈 거치대 있어?" 같은 일상 질의를 받았을 때 답을 줄 수 있는 기반 데이터.

## 운영자 작업 필요

hosted proxy 머지 시 다음이 필요합니다:

- `SEOUL_OPEN_API_KEY` 는 기존 `seoul-subway-arrival` / `seoul-density` 라우트가 이미 사용 중이라 환경변수 자체는 이미 설정돼 있을 것으로 보입니다.
- 다만 data.seoul.go.kr 는 **데이터셋별 활용신청** 구조라 같은 키로 dataset `OA-13252` (공공자전거 실시간 대여정보) 가 별도로 승인돼야 합니다. 자동승인·무료 데이터셋이라 신청만 누르면 즉시 적용됩니다. 미승인 상태면 upstream 이 `INFO-200` 또는 `INFO-300` 코드를 돌려주고, proxy 는 502 `upstream_error` 로 매핑합니다.

## 사양 출처

- 공공자전거 실시간 대여정보 dataset 페이지: <https://data.seoul.go.kr/dataList/OA-13252/A/1/datasetView.do>
- 서비스 endpoint 패턴: `http://openapi.seoul.go.kr:8088/{KEY}/json/bikeList/{START}/{END}/`
- 페이지당 최대 1,000 개, 전체 정류소 약 2,700+ 개
- 응답 필드: `stationId`, `stationName`, `stationLatitude`, `stationLongitude`, `parkingBikeTotCnt`, `rackTotCnt`, `shared`
- 결과 코드 규약: `RESULT.CODE = "INFO-000"` (정상), `INFO-200` (해당 데이터 없음), `INFO-300` (요청 인증키 미등록), `INFO-100` (인증키 오류)
- 라이선스: 이용허락범위 제한 없음
- 일 호출 한도: 1,000 회 (개인 계정 기준, 활용사례 등록 시 증가 가능)

## 설계 선택

- **세 라우트 분리**: nearest 는 proxy 측에서 전체 페이지 호출·거리 계산·top N 슬라이스까지 마쳐 클라이언트 응답을 작게 유지. stations 는 디버깅/dump 용 pass-through, search 는 대여소명 키워드 필터로 별도 분리.
- **좌표 검증**: lat ∈ [33, 39], lng ∈ [124, 132] 한국 영역 안에서만 통과. 잘못된 좌표는 400 `bad_request`.
- **`limit` 상한**: nearest 라우트 limit 최대 50 으로 캡 (현실적인 LLM 응답 크기 보호).
- **availableRacks 계산 노출**: `rackTotCnt - parkingBikeTotCnt` 를 proxy 가 계산해서 응답에 포함 → 빌리는 사용자(자전거 수) 와 반납하는 사용자(빈 거치대) 둘 다 한 호출로 답 가능.
- **캐시 정책**: 좌표·limit 조합 기준 cache, TTL 은 기존 `config.cacheTtlMs` 재사용. 실시간성 보호를 위해 분 단위 운영이 적정 (서버 기본값 그대로).

## 변경 파일

| 파일 | 변경 |
|---|---|
| `seoul-bike-share/SKILL.md` | 신규 — 스킬 정의 (9 개 표준 섹션 + Mandatory first question) |
| `packages/k-skill-proxy/src/seoul-bike.js` | 신규 — normalize·proxy fetch·haversine·error detection |
| `packages/k-skill-proxy/src/server.js` | 수정 — import 블록, `handleSeoulBikeRoute`, 라우트 3 개 등록, exports 추가 |
| `packages/k-skill-proxy/test/server.test.js` | 수정 — seoul-bike 라우트 5 개 신규 테스트 케이스 (캐시/공개 호출/503/400/요청 인코딩) |
| `docs/features/seoul-bike-share.md` | 신규 — 기능 가이드 |
| `docs/sources.md` | 수정 — OA-13252 출처 등록 |
| `docs/install.md` | 수정 — 설치 목록 추가 |
| `docs/roadmap.md` | 수정 — v1 shipped 줄 추가 |
| `README.md` | 수정 — 기능 표 1 행 추가 |
| `packages/k-skill-proxy/README.md` | 수정 — 라우트 목록 3 줄 추가 |
| `.changeset/seoul-bike-share.md` | 신규 — `k-skill-proxy` minor |

## 검증

### 라이브 응답으로 확인한 사실 (실제 키로 bikeList 호출, 2026-05-20)

- 응답 envelope: `rentBikeStatus.RESULT.CODE = "INFO-000"`, `rentBikeStatus.row[]` 확인. 필드명 `stationId`/`stationName`/`stationLatitude`/`stationLongitude`/`parkingBikeTotCnt`/`rackTotCnt`/`shared` 전부 일치. 좌표·카운트는 문자열로 내려와 핸들러에서 `parseFloat`/`parseInt` 처리.
- 망원역 실응답을 fixture 로 넣어 거리 정렬·`availableRacks` 계산을 검증.

### 테스트

- [x] `node --test` — 핸들러 테스트 **38개 통과** (단위 + 실응답 shape + search 필터)
- [ ] `node --test packages/k-skill-proxy/test/server.test.js` — server 통합 케이스 포함 통과
- [ ] `./scripts/validate-skills.sh`
- [ ] `npm run lint`
- [ ] (리뷰어) `curl "$BASE/v1/seoul-bike/nearest?lat=37.4979&lng=127.0276&limit=5"` 및 `curl "$BASE/v1/seoul-bike/search?query=망원역"` — 프록시가 `SEOUL_OPEN_API_KEY` 보유하고 `OA-13252` 활용신청 승인된 환경에서 정상 응답 확인

## 기여 가이드 체크

- base branch: `dev`
- branch: `feature/#NNN` (이슈 번호로 채워서 push)
- README 기능 표/문서 링크 업데이트 완료
- `docs/features/<skill-name>.md` 추가 완료
- `docs/sources.md` 출처 추가 완료
- 홈 전역 스킬 위치 동기화 권고: `~/.claude/skills/seoul-bike-share`, `~/.agents/skills/seoul-bike-share`

## 후속

이 PR 머지 후 동일 패턴으로 `ev-charger-nearby` (환경부 ChargEV / `DATA_GO_KR_API_KEY` 재사용) 를 후속 PR 로 제출 예정. `cheap-gas-nearby` 의 짝.
