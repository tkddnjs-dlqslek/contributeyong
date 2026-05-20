---
name: ev-charger-nearby
description: Use when the user asks for nearby EV charging stations or 근처 전기차 충전소. Always ask the user's current location and city/province first, then query the official 환경부(한국환경공단) ChargEV API for chargers with real-time status.
license: MIT
metadata:
  category: transport
  locale: ko-KR
  phase: v1
---

# EV Charger Nearby

## What this skill does

유저가 알려준 현재 위치와 시·도를 기준으로 **근처 전기차 충전소**를 찾아준다.

- 위치는 자동으로 추정하지 않는다. **반드시 먼저 현재 위치를 질문**한다.
- 환경부(한국환경공단) **ChargEV 공식 API** 의 `getChargerInfo` 를 `k-skill-proxy` 경유로 호출한다.
- 충전기 타입(`chgerType`)과 **실시간 상태(`stat`)** 를 함께 노출한다.
- `cheap-gas-nearby`(주유소) 의 전기차 짝.

## When to use

- "근처 전기차 충전소 찾아줘"
- "강남역 근처 급속 충전기 지금 쓸 수 있는 데 있어?"
- "여기서 가까운 DC콤보 충전소 알려줘"
- "지금 충전 가능한 충전소만 보여줘"

## Mandatory first question

위치 정보 없이 바로 검색하지 말고 반드시 먼저 물어본다.

- 권장 질문: `현재 위치(위도·경도, 동네/역명/랜드마크)와 시·도를 알려주세요. 근처 전기차 충전소를 찾아볼게요.`
- 충전 타입 의도가 있으면: `급속(DC) 위주로 볼까요, 완속(AC) 위주로 볼까요? 상관없으면 전체로 찾을게요.`
- "지금 쓸 수 있는 것만" 의도면 `onlyAvailable=true` 로 호출한다.

좌표만 있고 시·도를 모르면, 좌표로 시·도를 먼저 추정(또는 사용자에게 질문)해 `zcode` 를 정한다. ChargEV API 는 전국 일괄 조회가 불가능하고 **시도코드(zcode) 단위** 로 조회하기 때문이다.

## Inputs

### `/v1/ev-charger/nearest` (위치 기반)

- `lat`, `lng` (필수) — 위경도
- `zcode` (필수) — 시도코드 (아래 표)
- `limit` (선택) — 충전소 개수, 기본 5, 최대 50
- `chgerType` (선택) — 충전기 타입 코드로 필터 (01-09)
- `onlyAvailable` (선택) — `true` 면 충전대기(stat=2) 충전기가 1개 이상인 충전소만

### `/v1/ev-charger/status` (특정 충전소)

- `statId` (필수) — 충전소 ID

## Reference codes

### 시도코드 (zcode)

| 코드 | 지역 | 코드 | 지역 |
|---|---|---|---|
| 11 | 서울 | 41 | 경기 |
| 26 | 부산 | 42 / 51 | 강원 |
| 27 | 대구 | 43 | 충북 |
| 28 | 인천 | 44 | 충남 |
| 29 | 광주 | 45 / 52 | 전북 |
| 30 | 대전 | 46 | 전남 |
| 31 | 울산 | 47 | 경북 |
| 36 | 세종 | 48 | 경남 |
| | | 50 | 제주 |

### 충전기 타입 (chgerType)

`01` DC차데모 · `02` AC완속 · `03` DC차데모+AC3상 · `04` DC콤보 · `05` DC차데모+DC콤보 · `06` DC차데모+AC3상+DC콤보 · `07` AC3상 · `08` DC콤보(완속) · `09` AC3상(완속)

### 충전기 상태 (stat)

`1` 통신이상 · `2` 충전대기(=지금 사용 가능) · `3` 충전중 · `4` 운영중지 · `5` 점검중 · `9` 상태미확인

## Prerequisites

- optional: `jq`
- optional: `KSKILL_PROXY_BASE_URL` (self-host·별도 프록시를 쓸 때만 설정. 비우면 기본 hosted `https://k-skill-proxy.nomadamas.org`)

## Required environment variables

- 없음. 사용자가 개인 data.go.kr key 를 직접 발급할 필요는 없다. `/v1/ev-charger/*` route 는 기본 hosted proxy 에서 호출하고, upstream key(`DATA_GO_KR_API_KEY`) 는 proxy 서버 쪽에만 보관한다.

## Workflow

### 1. Resolve the proxy base URL

`KSKILL_PROXY_BASE_URL` 이 있으면 그 값을, 없으면 기본 hosted proxy `https://k-skill-proxy.nomadamas.org` 를 사용한다.

### 2. Ask location + resolve zcode

사용자 위경도와 시·도를 확보하고 시·도를 `zcode` 로 매핑한다.

### 3. Query the nearest endpoint

```bash
BASE="${KSKILL_PROXY_BASE_URL:-https://k-skill-proxy.nomadamas.org}"
curl -fsS --get "${BASE}/v1/ev-charger/nearest" \
  --data-urlencode 'lat=37.4979' \
  --data-urlencode 'lng=127.0276' \
  --data-urlencode 'zcode=11' \
  --data-urlencode 'limit=5' \
  --data-urlencode 'onlyAvailable=true'
```

응답 예시 (요약):

```json
{
  "zcode": "11",
  "total_chargers_scanned": 8421,
  "stations": [
    {
      "statId": "ME000001",
      "statNm": "강남구청 공영주차장",
      "addr": "서울 강남구 ...",
      "lat": 37.4981,
      "lng": 127.0278,
      "distanceMeters": 120,
      "busiNm": "환경부",
      "parkingFree": "Y",
      "availableCount": 2,
      "chargers": [
        { "chgerId": "01", "chgerType": "04", "chgerTypeName": "DC콤보", "stat": "2", "statName": "충전대기", "statUpdDt": "20260520093000", "output": "100" }
      ]
    }
  ]
}
```

### 4. Summarize for the user

- 충전소명 + 거리(미터) + 주소
- 지금 사용 가능한 충전기 수(`availableCount`)
- 각 충전기 타입/상태/충전용량
- 상태 갱신시각(`statUpdDt`) — stale 가능성 안내

### 5. Be conservative about live data

`statUpdDt` 가 오래됐으면 "상태가 갱신된 지 시간이 지났을 수 있다"고 사용자에게 알린다.

## Done when

- 사용자 좌표 기준 가까운 충전소 목록과 충전기 타입·실시간 상태가 정리되어 있다
- `onlyAvailable` 요청 시 사용 가능한 충전기가 있는 충전소만 노출됐다
- upstream key 가 클라이언트에 노출되지 않았다

## Failure modes

- proxy upstream key 미설정 → `503 upstream_not_configured`
- `zcode` 누락 → `400` (전국 일괄 조회 불가, 시도코드 필수)
- 좌표가 한국 영역 밖 → `400 bad_request`
- data.go.kr 활용신청 미승인 → `resultCode != "00"` → proxy `502 upstream_error`
- 일일 호출 한도 초과 → upstream 오류 코드

## Notes

- ChargEV `getChargerInfo` 는 충전기(charger) 단위로 행을 반환하므로, proxy 가 `statId` 기준으로 충전소 단위로 묶고 거리 정렬한다.
- 상태(`stat`)는 실시간이지만 갱신 주기가 충전소마다 다르므로 `statUpdDt` 를 함께 본다.
- `zcode` 단위 조회라 시·도 경계 근처에서는 인접 도의 더 가까운 충전소가 누락될 수 있다. 필요하면 인접 `zcode` 로 한 번 더 조회한다.
- proxy 운영/환경변수 설정은 `docs/features/k-skill-proxy.md` 를 참고한다.
