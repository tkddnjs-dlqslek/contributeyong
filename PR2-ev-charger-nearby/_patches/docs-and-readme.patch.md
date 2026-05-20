# Patches: README.md, docs/install.md, docs/sources.md, docs/roadmap.md, packages/k-skill-proxy/README.md

## 1. `README.md` — 기능 표 1 행 (`cheap-gas-nearby` 근처)

```md
| 근처 전기차 충전소 | 좌표·시도코드 기준 가까운 충전소·충전기 타입·실시간 충전 가능 여부 조회 | 불필요 | [ev-charger-nearby](docs/features/ev-charger-nearby.md) |
```

## 2. `docs/install.md`

```md
- `ev-charger-nearby` — 환경부 ChargEV 기반 근처 전기차 충전소·실시간 상태 조회
```

`--skill` 일괄 설치 예시에도 `ev-charger-nearby` 추가.

## 3. `docs/sources.md` — data.go.kr 섹션

```md
- 한국환경공단 전기자동차 충전소 정보 (ChargEV): <https://www.data.go.kr/data/15076352/openapi.do>
```

## 4. `docs/roadmap.md` — v1 shipped 줄 추가

```md
- 근처 전기차 충전소 조회 스킬 출시
```

## 5. `packages/k-skill-proxy/README.md` — 라우트 목록

```md
| `/v1/ev-charger/nearest` | 좌표+zcode 기준 가까운 전기차 충전소 top N (statId 그룹핑, 거리·타입·상태 필터) | `DATA_GO_KR_API_KEY` |
| `/v1/ev-charger/status` | 특정 충전소(statId) 충전기 상태 조회 | `DATA_GO_KR_API_KEY` |
```
