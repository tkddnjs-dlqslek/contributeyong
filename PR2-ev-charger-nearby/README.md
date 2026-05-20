# PR2 — `ev-charger-nearby` 스킬

`NomaDamas/k-skill` 에 올릴 두 번째 스킬 패키지. PR1(`seoul-bike-share`) 이 머지된 뒤 같은 패턴으로 진행 권장.

## 파일 매핑 (이 폴더 → 본인 포크의 같은 경로)

| 이 폴더 안 경로 | k-skill 본인 포크 경로 | 신규/수정 |
|---|---|---|
| `ev-charger-nearby/SKILL.md` | `ev-charger-nearby/SKILL.md` | 신규 |
| `packages/k-skill-proxy/src/ev-charger.js` | `packages/k-skill-proxy/src/ev-charger.js` | 신규 |
| `docs/features/ev-charger-nearby.md` | `docs/features/ev-charger-nearby.md` | 신규 |
| `.changeset/ev-charger-nearby.md` | `.changeset/ev-charger-nearby.md` | 신규 |
| `_patches/server.js.patch.md` | `packages/k-skill-proxy/src/server.js` 에 안내대로 삽입 | 수정 |
| `_patches/docs-and-readme.patch.md` | README.md, docs/*, packages/k-skill-proxy/README.md 1~2 줄 추가 | 수정 |
| `pr-body.md` | PR 본문에 붙여넣기 (이슈 번호만 채움) | — |

## 진행 순서

1. **이슈 먼저**: `feat: 근처 전기차 충전소 조회 스킬 + 프록시 라우트 2종`. 이슈 번호 N 확보.
2. **포크·브랜치**: `feature/#N`, base `dev`.
3. **파일 복사**: 신규 4 개.
4. **server.js 수정**: `_patches/server.js.patch.md` 4 군데.
5. **docs/readme 수정**: `_patches/docs-and-readme.patch.md` 5 군데.
6. **테스트 추가**: `_patches/server.test.js.append.md` 의 통합 테스트 6종을 `packages/k-skill-proxy/test/server.test.js` 끝에 붙여넣는다 (기존 kstartup 패턴과 동일). 핸들러 단위 테스트(`_test/`)도 원하면 함께 포함.
7. **로컬 검증**:
   ```bash
   npm install
   node --test packages/k-skill-proxy/test/server.test.js
   ./scripts/validate-skills.sh
   npm run lint
   ```
8. **push & PR** → `NomaDamas/k-skill:dev`.

## 메인테이너에게 안내될 액션

- `data.go.kr` 본인 계정에서 dataset **15076352 (한국환경공단_전기자동차 충전소 정보)** 활용신청 클릭 1 회 (자동승인)
- 환경변수 `DATA_GO_KR_API_KEY` 는 nts/mfds/lh/parking-lot/kstartup 이 이미 사용 중이라 신규 발급 불필요

## ⚠️ PR diff 에 포함하지 말 것 (로컬 테스트용 vendored 파일)

아래 두 파일은 **이미 upstream(`NomaDamas/k-skill`)에 존재**한다. `ev-charger.js` 가 `require("./region-lookup")` 로 재사용하기 때문에 우리 staging 에서 테스트를 돌리려고 복사해둔 것뿐이다. **본인 포크에는 이미 있으므로 PR 에 새로 추가하지 말 것.**

- `packages/k-skill-proxy/src/region-lookup.js`
- `packages/k-skill-proxy/src/region-codes.json`

## 검증 상태

- 핸들러 단위 테스트 **28/28 통과** (`_test/ev-charger.test.js`)
- 실호출(end-to-end) 검증: data.go.kr 키가 있으면 우리 환경(apis.data.go.kr 443 도달 가능)에서 가능. 현재 미보유라 보류 — PR 본문 검증 체크리스트에 리뷰어 항목으로 명시.
