---
"k-skill-proxy": minor
---

feat(ev-charger-nearby): add nationwide EV charging station lookup skill using the 환경부(한국환경공단) ChargEV API. Proxy routes `/v1/ev-charger/nearest` (zcode-scoped fetch, group by statId, haversine sort, chgerType/onlyAvailable filters) and `/v1/ev-charger/status` (per-station lookup by statId). Reuses existing `DATA_GO_KR_API_KEY` env var. Requires maintainer to activate dataset 15076352 (한국환경공단_전기자동차 충전소 정보) under that key on data.go.kr.
