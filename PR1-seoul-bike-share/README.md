# PR1 — `seoul-bike-share` 스킬

`NomaDamas/k-skill` 에 PR 로 올릴 첫 번째 스킬 패키지. 아래 디렉토리/파일들을 본인 포크에 동일 경로로 복사 후 push 하면 됨.

## 파일 매핑 (이 폴더 → 본인 포크의 같은 경로)

| 이 폴더 안 경로 | k-skill 본인 포크에서의 경로 | 신규/수정 |
|---|---|---|
| `seoul-bike-share/SKILL.md` | `seoul-bike-share/SKILL.md` | 신규 |
| `packages/k-skill-proxy/src/seoul-bike.js` | `packages/k-skill-proxy/src/seoul-bike.js` | 신규 |
| `docs/features/seoul-bike-share.md` | `docs/features/seoul-bike-share.md` | 신규 |
| `.changeset/seoul-bike-share.md` | `.changeset/seoul-bike-share.md` | 신규 |
| `_patches/server.js.patch.md` | `packages/k-skill-proxy/src/server.js` 에 안내대로 삽입 | 수정 |
| `_patches/docs-and-readme.patch.md` | README.md, docs/install.md, docs/sources.md, docs/roadmap.md, packages/k-skill-proxy/README.md 에 안내대로 1~2 줄씩 추가 | 수정 |
| `pr-body.md` | PR 본문에 그대로 붙여넣기 (이슈 번호만 채움) | — |

## 진행 순서

1. **이슈 먼저**: NomaDamas/k-skill 에 issue 등록 — 제목 `feat: 서울 따릉이 실시간 대여소 조회 스킬 + 프록시 라우트 2종`. 본문은 `pr-body.md` "동기" 섹션 위주로 축약해서 붙여넣기. **이슈 번호 N 받아둠.**
2. **포크·브랜치**: NomaDamas/k-skill 본인 포크. 브랜치 `feature/#N` 생성, base 는 `dev`.
3. **파일 복사**: 이 폴더의 신규 파일 4 개를 같은 경로로 복사.
4. **server.js 수정**: `_patches/server.js.patch.md` 의 4 군데를 실제 `packages/k-skill-proxy/src/server.js` 에 반영.
5. **docs/readme 수정**: `_patches/docs-and-readme.patch.md` 의 5 군데 반영.
6. **테스트 추가**: `packages/k-skill-proxy/test/server.test.js` 에 seoul-bike 라우트 케이스 5 개 (기존 kstartup/seoul-density 테스트 패턴 모방). PR1 에서는 별도 파일로 분리하지 않았음 — 작업 시점에 reference 파일을 직접 보고 짝맞춰 작성.
7. **로컬 검증**:
   ```bash
   npm install
   node --test packages/k-skill-proxy/test/server.test.js
   ./scripts/validate-skills.sh
   npm run lint
   ```
8. **push & PR**: `feature/#N` 을 본인 포크로 push 후 `NomaDamas/k-skill:dev` 로 PR. 본문은 `pr-body.md` 그대로 (이슈 번호만 채움).

## 메인테이너에게 안내될 액션

PR 머지 후 메인테이너가 해야 할 단 한 가지:

- `data.seoul.go.kr` 본인 계정에서 dataset **OA-13252 (공공자전거 실시간 대여정보)** 활용신청 클릭 1 회 (자동승인)

환경변수 `SEOUL_OPEN_API_KEY` 는 `seoul-subway-arrival` / `seoul-density` 가 이미 쓰고 있어 신규 발급/세팅 불필요.
