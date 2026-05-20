# feat(ev-charger-nearby): 근처 전기차 충전소 조회 스킬 + 프록시 라우트 2종

## 요약

- 환경부(한국환경공단) ChargEV dataset `15076352` (전기자동차 충전소 정보, `B552584/EvCharger/getChargerInfo`) 를 `k-skill-proxy` 경유로 조회하는 스킬 `ev-charger-nearby` 추가
- `k-skill-proxy` 에 라우트 2 개 신규
  - `GET /v1/ev-charger/nearest` → 지역(zcode/zscode, 또는 자연어 `regionHint` 자동해석) 범위로 충전기를 모아 `statId` 단위로 묶고, 사용자 좌표 기준 haversine 거리 정렬해 상위 N 개 충전소 반환. `chgerType` / `speed`(급속·완속) / `busiNm`(운영기관) / `onlyAvailable` 필터 지원
  - `GET /v1/ev-charger/status` → 특정 충전소(`statId`) 충전기 상태 pass-through
- `cheap-gas-nearby`(주유소) 와 동일한 위치 기반 패턴 — `DATA_GO_KR_API_KEY` 는 서버 측에서만 주입, 사용자는 hosted proxy 단일 모드로 키 없이 호출
- `getChargerInfo` 는 `dataType=JSON` 을 지원하므로 proxy 에 XML 파서 의존성을 추가하지 않음 (기존 deps 그대로 fastify 단일)
- `resultCode != "00"` envelope 은 캐시 우회해 인증·한도 오류가 자가 회복되도록 함
- CONTRIBUTING 가이드대로 `docs/features/ev-charger-nearby.md`, `README.md`, `docs/sources.md`, `docs/install.md`, `docs/roadmap.md`, `packages/k-skill-proxy/README.md`, `.changeset/ev-charger-nearby.md` (`k-skill-proxy` minor) 동시 갱신

## 동기 — 왜 필요한가

- `cheap-gas-nearby`(주유소) 가 v1 에 있는데 전기차 충전 인프라가 비어 있음. 내연기관 ↔ EV 짝의 일관성 보강.
- 국내 전기차 200 만 대 시대. "지금 갈 수 있는 충전소 어디?" 는 일상 반복 질의인데 답할 데이터가 없음.
- 환경부 ChargEV 는 공공데이터포털에서 자동승인되는 무료 dataset 이고, 다수의 프로덕션 서비스가 이미 `dataType=JSON` 으로 안정적으로 사용 중. 진입장벽이 낮음.

## 운영자 작업 필요

hosted proxy 머지 시 다음이 필요합니다:

- `DATA_GO_KR_API_KEY` 는 기존 `nts-business-registration` / `mfds-*` / `lh-notice` / `parking-lot-search` / `kstartup-search` 라우트가 이미 사용 중이라 환경변수 자체는 이미 설정돼 있을 것으로 보입니다.
- 다만 data.go.kr 은 **데이터셋별 활용신청** 구조라 같은 키로 dataset `15076352` (한국환경공단_전기자동차 충전소 정보) 가 별도로 승인돼야 합니다. 자동승인·무료 데이터셋이라 신청만 누르면 즉시 적용됩니다. 미승인 상태면 upstream 이 `resultCode=30` (`SERVICE_KEY_IS_NOT_REGISTERED_ERROR`) 을 돌려주고, proxy 는 502 `upstream_error` 로 매핑합니다.

## 사양 출처

- 공공데이터포털 페이지: <https://www.data.go.kr/data/15076352/openapi.do>
- 서비스 endpoint: `https://apis.data.go.kr/B552584/EvCharger/getChargerInfo`
- 요청 파라미터: `serviceKey`, `pageNo`, `numOfRows`, `dataType=JSON`, `zcode`(시도코드), `zscode`(시군구코드), `statId`
- 응답 필드: `statId`, `statNm`, `chgerId`, `chgerType`, `addr`, `lat`, `lng`, `useTime`, `busiNm`, `stat`, `statUpdDt`, `output`, `parkingFree`, `note`
- 충전기 타입(`chgerType`) 01-09, 상태(`stat`) 1-9 코드 매핑은 SKILL.md 의 Reference codes 참고
- 라이선스: 이용허락범위 제한 없음
- 일 호출 한도: 개발계정 기준 (활용사례 등록 시 증가)

## 설계 선택

- **regionHint 자동 해석**: 사용자가 "강남에서…" 처럼 지역을 말하면 `regionHint=서울 강남구` 로 보낼 수 있다. proxy 가 **기존 `region-lookup` 모듈을 재사용**해 LAWD_CD(법정동 5자리)로 변환하고, 그 값이 EV API 의 `zscode`(앞 2자리는 `zcode`)와 동일 체계임을 이용해 자동으로 채운다. 코드표 암기 불필요. (region-lookup / region-codes.json 은 이미 repo 에 있으므로 신규 추가 없음)
- **zcode/zscode**: regionHint 없이 직접 줄 수도 있다. 전국 30 만 건 일괄 조회는 비현실적이라 시·도(zcode) 또는 시·군·구(zscode) 로 범위를 한정한다. zscode 를 주면 1 회 호출로 끝난다(실측: 강남구 5,920건 < 9,999 페이지 한도).
- **statId 그룹핑**: `getChargerInfo` 는 충전기 단위 행을 반환하므로 proxy 가 충전소 단위로 묶고 `availableCount`(충전대기 충전기 수) 를 계산.
- **speed 필터**: `output >= 50kW` 를 급속(fast), 미만을 완속(slow) 으로 분류.
- **busiNm 필터**: 운영기관명 부분일치(대소문자 무시).
- **JSON 강제**: `dataType=JSON` 고정 → XML 파서 무의존. data.go.kr 단일 아이템(비배열) 응답도 정규화.
- **좌표 검증**: lat ∈ [33, 39], lng ∈ [124, 132]. `limit` 최대 50.
- **onlyAvailable**: 충전대기(stat=2) 충전기가 1개 이상인 충전소만 필터.
- **totalCount 기반 페이지네이션**: 응답 페이지가 요청 numOfRows 보다 작아도 `totalCount` 도달까지 순회(최대 12 페이지). 초과 시 `truncated: true`.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `ev-charger-nearby/SKILL.md` | 신규 — 스킬 정의 + 코드 레퍼런스 표 |
| `packages/k-skill-proxy/src/ev-charger.js` | 신규 — normalize·페이지네이션·statId 그룹핑·haversine·error detection |
| `packages/k-skill-proxy/src/server.js` | 수정 — import, `handleEvChargerRoute`, 라우트 2개, exports |
| `packages/k-skill-proxy/test/server.test.js` | 수정 — ev-charger 라우트 통합 테스트 케이스 추가 |
| `docs/features/ev-charger-nearby.md` | 신규 |
| `docs/sources.md` / `docs/install.md` / `docs/roadmap.md` | 수정 |
| `README.md` / `packages/k-skill-proxy/README.md` | 수정 |
| `.changeset/ev-charger-nearby.md` | 신규 — `k-skill-proxy` minor |

## 검증

### 라이브 응답으로 확인한 사실 (실제 키로 getChargerInfo 호출, 2026-05-20)

- `getChargerInfo?dataType=JSON` 의 envelope 은 **flat** 구조다: `resultCode` / `items.item[]` / `totalCount` 가 최상위에 있고, 일부 다른 data.go.kr API 처럼 `response.header` / `response.body` 로 감싸지 **않는다**. 핸들러는 두 형태 모두 방어적으로 파싱한다.
- `numOfRows=9999` 가 그대로 적용된다 (한 페이지에 최대 9999건 반환 확인).
- `zscode`(시군구) 필터가 동작한다: `zcode=11&zscode=11680`(강남구) → `totalCount=5920` (서울 전체 74,298건 대비). 따라서 `zscode` 를 주면 1회 호출로 끝난다.
- 한 충전소가 여러 충전기를 가지며(`statId` 동일, `chgerId` 상이) `statId` 그룹핑이 필요함을 실데이터로 확인.

### 테스트

- [x] `node --test` — 핸들러 테스트 **46개 통과** (단위 43 + 실응답 shape 3: flat envelope 파싱, multi-charger 그룹핑, 충전중/onlyAvailable 필터)
- [ ] `node --test packages/k-skill-proxy/test/server.test.js` — server 통합 케이스 포함 통과
- [ ] `./scripts/validate-skills.sh`
- [ ] `npm run lint`
- [ ] (리뷰어) `curl "$BASE/v1/ev-charger/nearest?lat=37.4979&lng=127.0276&zcode=11&zscode=11680&limit=5&onlyAvailable=true"` — 프록시가 `DATA_GO_KR_API_KEY` 보유하고 dataset 15076352 활용신청 승인된 환경에서 충전소 + 충전기 상태 정상 응답 확인

## 기여 가이드 체크

- base branch: `dev`
- branch: `feature/#NNN`
- README 기능 표/문서 링크, `docs/features/`, `docs/sources.md` 업데이트 완료
- 홈 전역 스킬 위치 동기화 권고: `~/.claude/skills/ev-charger-nearby`, `~/.agents/skills/ev-charger-nearby`

## 선행 PR

`seoul-bike-share` PR 과 동일한 proxy 라우트 패턴. 둘 다 위치 기반 실시간 조회 스킬이며, 같은 핸들러 등록 컨벤션을 따른다.
