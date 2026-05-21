# 근처 전기차 충전소 조회 가이드

## 이 기능으로 할 수 있는 일

- 사용자 좌표 + 시도코드(zcode) 기준 가까운 전기차 충전소 N 개 확인 (기본 5, 최대 50)
- 각 충전소의 충전기 타입(DC콤보/차데모/AC완속 등) 과 **실시간 상태**(충전대기/충전중/점검중 등) 확인
- "지금 충전 가능한 충전소만" 필터(`onlyAvailable`)
- 충전기 타입 필터(`chgerType`)
- 별도 사용자 `DATA_GO_KR_API_KEY` 없이 `k-skill-proxy` 로 조회

## 먼저 필요한 것

- [공통 설정 가이드](../setup.md) 확인
- 사용자 현재 위치(위경도) 와 시·도

> 좌표가 없고 지명만 있으면, 스킬이 먼저 공용 `/v1/kakao-local/geocode?q=<지명>` 라우트로 좌표 + 주소를 구한 뒤, 주소에서 시·구를 뽑아 `regionHint` 로 넘긴다. 즉 "성수동 근처 충전소"처럼 좌표·코드 없이도 동작한다 (Kakao 키는 서버에만 있어 사용자 키 불필요).

## 기본 경로

기본적으로 `https://k-skill-proxy.nomadamas.org/v1/ev-charger/nearest` 로 요청한다.

upstream key 는 proxy 서버에서만 `DATA_GO_KR_API_KEY` 로 관리한다. `KSKILL_PROXY_BASE_URL` 환경변수가 있으면 그 값을, 비우면 기본 hosted proxy 를 쓴다.

## 입력값

### `/v1/ev-charger/nearest`

- `lat`, `lng` (필수) — 위경도
- `regionHint` (권장) — 자연어 지역명 (예: `서울 강남구`). proxy 가 region-lookup 으로 zcode/zscode 자동 해석
- `zcode` (regionHint 없을 때 필수) — 시도코드 (11 서울, 41 경기, 26 부산, …)
- `zscode` (선택, 권장) — 시군구코드 5자리 (예: 11680 강남구). 주면 1회 호출로 끝나고 더 가까운 결과
- `limit` (선택) — 기본 5, 최대 50
- `chgerType` (선택) — 충전기 타입 코드 01-09
- `speed` (선택) — fast(급속, 50kW+) / slow(완속)
- `busiNm` (선택) — 운영기관명 부분일치 필터
- `onlyAvailable` (선택) — true 면 충전대기(stat=2) 충전기가 있는 충전소만

### `/v1/ev-charger/status`

- `statId` (필수) — 충전소 ID

## 기본 흐름

1. client/skill 은 사용자 좌표·시도코드를 받아 `/v1/ev-charger/nearest` 를 호출한다.
2. proxy 는 환경부 ChargEV `getChargerInfo?zcode={zcode}&dataType=JSON` 을 `DATA_GO_KR_API_KEY` 와 함께 페이지 단위로 호출해 해당 시·도 충전기를 모은다.
3. `statId` 기준으로 충전소 단위로 묶고, 사용자 좌표 기준 haversine 거리로 정렬해 상위 `limit` 개만 반환한다.
4. 각 충전소에 `availableCount`(충전대기 충전기 수), `distanceMeters`, 충전기별 타입/상태/갱신시각을 포함한다.

## 예시

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/ev-charger/nearest" \
  --data-urlencode 'lat=37.4979' \
  --data-urlencode 'lng=127.0276' \
  --data-urlencode 'zcode=11' \
  --data-urlencode 'limit=5' \
  --data-urlencode 'onlyAvailable=true'
```

## fallback / 대체 흐름

- `KSKILL_PROXY_BASE_URL` 을 넣으면 해당 proxy 를 우선 사용한다.
- self-host 운영자는 서버 쪽에만 `DATA_GO_KR_API_KEY` 를 넣는다.

## 주의할 점

- ChargEV API 는 전국 일괄 조회가 불가능하고 시도코드(zcode) 단위로 조회한다. 시·도 경계 근처는 인접 zcode 로 한 번 더 조회한다.
- 상태(`stat`)는 실시간이나 갱신 주기가 충전소마다 달라 `statUpdDt` 를 함께 본다.
- 일일 호출 한도 초과 또는 dataset 활용신청 미승인 시 `resultCode != "00"` 가 반환된다.

## 참고 표면

- 공식 API 안내: `https://www.data.go.kr/data/15076352/openapi.do`
- 서비스 endpoint: `https://apis.data.go.kr/B552584/EvCharger/getChargerInfo`
- 저공해차 통합누리집(ChargEV): `https://www.ev.or.kr`
- proxy 운영 안내: [k-skill 프록시 서버 가이드](k-skill-proxy.md)
