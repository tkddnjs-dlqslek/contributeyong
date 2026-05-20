# k-skill-contrib

[NomaDamas/k-skill](https://github.com/NomaDamas/k-skill) (한국인을 위한 Agent Skills 모음집) 에 기여하기 위한 스킬 패키지 모음.

위치 기반 실시간 조회 스킬 두 종을 `k-skill-proxy` 패턴(서버 측 키 주입, 사용자 키 불필요)에 맞춰 구현했다. 각 폴더는 본인 포크에 그대로 복사해 PR 로 올릴 수 있도록 정리돼 있다.

## 포함된 스킬

### [`PR1-seoul-bike-share/`](PR1-seoul-bike-share/) — 서울 따릉이 실시간 대여소
- 데이터: 서울 열린데이터 광장 공공자전거 실시간 대여정보 (`OA-13252`)
- 프록시 라우트 3종: `/v1/seoul-bike/nearest` (좌표 기준 거리정렬 top-N) · `/v1/seoul-bike/search` (대여소명 검색) · `/v1/seoul-bike/stations` (페이지 dump)
- 잔여 자전거 + 반납 가능 거치대(`availableRacks`) 동시 노출
- 환경변수 `SEOUL_OPEN_API_KEY` 재사용 / 테스트 38건 통과 (실응답 검증 포함)

### [`PR2-ev-charger-nearby/`](PR2-ev-charger-nearby/) — 근처 전기차 충전소
- 데이터: 환경부(한국환경공단) ChargEV `getChargerInfo` (`15076352`)
- 프록시 라우트 2종: `/v1/ev-charger/nearest` · `/v1/ev-charger/status`
- `statId` 그룹핑 + 실시간 상태 + 필터(`chgerType`/`speed`(급속·완속)/`busiNm`(운영기관)/`onlyAvailable`)
- 자연어 `regionHint`(예: "서울 강남구") → zcode/zscode 자동 해석 (기존 `region-lookup` 재사용)
- 환경변수 `DATA_GO_KR_API_KEY` 재사용 / 테스트 46건 통과 (실응답 flat-envelope 검증 포함)

## 각 PR 폴더 구성

```
PRn-<skill>/
├── README.md             # 본인 포크에 적용하는 단계별 안내
├── pr-body.md            # PR 본문 (그대로 붙여넣기)
├── <skill>/SKILL.md      # 스킬 정의
├── packages/k-skill-proxy/src/<handler>.js   # 프록시 핸들러
├── docs/features/<skill>.md
├── .changeset/<skill>.md
├── _patches/             # server.js · README/docs 수정 안내
└── _test/                # 핸들러 단위/실응답 테스트
```

## 올리는 법 (요약)

1. `NomaDamas/k-skill` 을 본인 계정으로 fork
2. 각 PR 폴더의 신규 파일을 동일 경로로 복사, `_patches/` 안내대로 기존 파일 수정
3. `feature/#<issue>` 브랜치에서 `dev` 로 PR — 자세한 절차는 각 폴더 `README.md` 참고

> 메인테이너 작업은 dataset 활용신청 클릭 1회씩(OA-13252 / 15076352)이면 끝. 환경변수는 둘 다 기존 스킬이 이미 사용 중이라 신규 발급 불필요.

## 참고
- 기여 계획·리서치 경위: [`PLAN.md`](PLAN.md)
- 대상 리포: <https://github.com/NomaDamas/k-skill>
