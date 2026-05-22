# CONTRIBUTION — NomaDamas/k-skill 기여 기록

서울 따릉이 실시간 대여소 조회 스킬(`seoul-bike-share`)을 오픈소스 프로젝트 **[NomaDamas/k-skill](https://github.com/NomaDamas/k-skill)** (한국인을 위한 Agent Skills 모음, ★5,000+)에 제안·설계·구현했다.

> 정직한 크레딧 표기: 기여자 계정이 GitHub 가입 1년 미만이라 직접 올린 PR(#275)은 레포 정책상 자동 마감되었고, 실제 머지 PR(#277)은 메인테이너 계정으로 생성되었다. 따라서 본 기여는 **"제안·설계·구현·반영"** 으로 표기한다("내 PR이 머지됨"이 아님).

## 한 일 (요약)
- 레포 전체 구조·기존 스킬·머지 PR 패턴 리서치 → 누락된 "지하철 도착의 짝(따릉이)" 기능 발굴
- 서울 열린데이터 광장 공공자전거 실시간 API(`bikeList`) 분석
- `k-skill-proxy` 패턴(서버 측 키 주입, 사용자 키 불필요)에 맞춰 핸들러·라우트 3종 구현
- **실제 정부 API 응답으로 envelope·필드명 검증** (가정과 실제가 다른 부분을 실호출로 확인)
- 핸들러 단위/실응답 테스트 45종 + proxy 통합 테스트 6종 작성
- 빌리기/반납 양방향 필터, 지명→좌표 지오코딩 연동까지 확장
- SKILL.md / docs / changeset / PR 본문 등 기여 가이드 준수 문서 일체 작성

## 구현 내역
- 스킬: `seoul-bike-share`
- 프록시 라우트 3종: `/v1/seoul-bike/nearest`(좌표 기준 거리정렬), `/v1/seoul-bike/search`(대여소명 검색), `/v1/seoul-bike/stations`(페이지 dump)
- 필터: `available`/`minBikes`(빌리기), `returnable`/`minRacks`(반납)
- 지명만 입력 시 `/v1/kakao-local/geocode`로 좌표 자동 변환 (transit-route 패턴)
- 응답: 잔여 자전거 + 빈 거치대(`availableRacks`) 동시 노출, 캐시·요청시각 메타

## 증거자료 (링크)
- 이슈(제안+구현 요약): https://github.com/NomaDamas/k-skill/issues/274
- 내가 올린 PR(코드 원본, 정책상 자동 마감): https://github.com/NomaDamas/k-skill/pull/275
- 메인테이너 승인 후 반영 PR: https://github.com/NomaDamas/k-skill/pull/277
- 전체 구현·테스트·설계·리서치 기록: 이 저장소(`contributeyong`)

## 결과 — **dev 머지 완료** (2026-05, PR #277)
- 메인테이너(@vkehfdl1) 코멘트(이슈 #274): "277번 PR에서 dev로 머지되었으며, 수 일 내에 메인으로 배포됩니다. 감사합니다. @tkddnjs-dlqslek" → **기여자로 공식 멘션·인정됨**
- dev 반영 최종 형태:
  - 스킬 폴더: `seoul-bike/` (제안한 `seoul-bike-share`에서 봇이 명명 변경)
  - 프록시 라우트 3종: `/v1/seoul-bike/realtime`, `/v1/seoul-bike/nearby`, `/v1/seoul-bike/stations`
  - 좌표 기반 조회·잔여 자전거·빈 거치대·거리 계산 등 **핵심 기능 반영**
- 우리 제안 대비 차이: 라우트 명명(`nearby`/`realtime`), `tbCycleStationInfo` 데이터셋 추가, 반납 필터(`returnable`/`minRacks`)는 미반영
- 수 일 내 `dev → main` 정식 배포 예정

## 후속
- `ev-charger-nearby`(전기차 충전소) 스킬도 동일 패턴으로 구현 완료 (`PR2-ev-charger-nearby/`), 별도 제출 예정

## 보존 메모
- 닫힌 PR #275, 이슈 #274, 승인 댓글은 스크린샷으로 별도 보관 권장(레포 상태 변경 대비)
- 이 저장소의 커밋 히스토리가 전 과정(리서치→설계→실호출 검증→테스트)을 담은 1차 자료
