# Patches: docs/*, README.md, install.md, sources.md, roadmap.md

본 PR 에서 수정해야 하는 markdown 파일들. 각 파일의 정확한 위치는 머지 시점 기준으로 약간 밀릴 수 있으니 맥락 줄 (context line) 을 보고 삽입.

---

## 1. `README.md` — "어떤 걸 할 수 있나" 표에 1 행 추가

알파벳 순서상 `seoul-density` 위/아래 어딘가에 들어간다. 기존 표 행 형식 그대로:

```md
| 서울 따릉이 실시간 대여소 | 가까운 따릉이 대여소·잔여 자전거·반납 가능 거치대 조회 | 불필요 | [seoul-bike-share](docs/features/seoul-bike-share.md) |
```

---

## 2. `docs/install.md` — 설치 목록·바로가기에 추가

`seoul-density` 항목 바로 아래에 같은 포맷으로:

```md
- `seoul-bike-share` — 서울 공공자전거(따릉이) 실시간 대여소·잔여 자전거 조회
```

`--skill` 일괄 설치 예시가 있으면 거기에도 `seoul-bike-share` 추가.

---

## 3. `docs/sources.md` — 출처 등록

`서울 열린데이터 광장` 섹션에 추가 (subway-arrival, density 와 같은 섹션):

```md
- 서울 공공자전거(따릉이) 실시간 대여정보: <https://data.seoul.go.kr/dataList/OA-13252/A/1/datasetView.do>
```

---

## 4. `docs/roadmap.md` — v1 shipped 줄 추가

`## v1 shipped first` 섹션 마지막에 한 줄:

```md
- 서울 따릉이 실시간 대여소 조회 스킬 출시
```

그리고 `## v1.5 candidates` → `### 그다음으로 좋은 후보` → `#### 버스/지하철 도착정보 조회` 항목 옆이나 아래에 follow-up note 한 줄(선택):

```md
> 따릉이 실시간 조회는 v1 shipped (#NNN).
```

---

## 5. `packages/k-skill-proxy/README.md` — 라우트 목록 추가

`Routes` 또는 `/v1/...` 라우트 표가 있으면 두 줄 추가. 형식은 기존 라우트 행과 동일하게:

```md
| `/v1/seoul-bike/nearest` | 사용자 좌표 기준 가까운 따릉이 대여소 top N (haversine 거리) | `SEOUL_OPEN_API_KEY` |
| `/v1/seoul-bike/stations` | 따릉이 전체 대여소 페이지 단위 dump (start, end) | `SEOUL_OPEN_API_KEY` |
```
