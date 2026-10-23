<<<<<<< HEAD
# Drive 연결/자동저장 UI 수정

GitHub Pages에서 `index.html`, `styles.css`, `app.js`를 교체하세요. Apps Script 변경은 필요 없습니다.

- 중복된 Drive 연결 표시 제거, 하나의 통일된 상태 칩 제공
- Drive 저장 완료는 실제 Drive 업로드 또는 Drive 불러오기 성공 시에만 표시
- 연결만 된 상태에서는 `Drive 연결됨 · 동기화 필요` 표시. 클릭 시 최신 Drive 데이터 불러오기
- 오류 시 `Drive 저장 실패 · 재시도`를 눌러 다시 저장 시도
- 기존 캐러셀 붙여넣기와 AI 분류 기능 유지

배포 후 Drive 불러오기를 한 번 실행하고 레퍼런스를 수정해 실제 저장 상태를 확인하세요.
=======
# 레퍼런스 탐색기 — 전략 탐색 + 비주얼 탐색 개편본

## 이번 개편 핵심
- 필터 체계를 **전략 탐색**과 **비주얼 탐색**으로 분리했습니다.
- 핵심 분류는 실제 의사결정에 맞춘 **8개 필터**로 재구성했습니다.
- 기존 Drive / GitHub Pages 구조는 유지합니다.
- 기존 데이터의 레거시 분류(`purpose`, `benefit`, `appeal` 등)는 삭제하지 않고 **호환 보존**합니다.
- 브라우저에서 데이터를 불러올 때 레거시 분류를 기반으로 새 전략 분류를 **보조 마이그레이션**합니다.
- Google Apps Script의 GPT 분류 기준도 동일한 새 분류 체계로 맞췄습니다.

## 새 핵심 필터 8개
1. 활용 목적 (`objective`)
2. 마케팅 전략 (`strategy`)
3. 고객 여정 (`journey`)
4. 프로모션·혜택 (`offer`)
5. 콘텐츠 역할 (`contentRole`)
6. 표현 톤 (`tone`)
7. 적용 채널·매체 (`channel`)
8. 업종 (`industry`)

## 비주얼 탐색 보조 필터
- 색상군 (`color`)
- 비주얼 스타일 (`visual`)

## 기존 데이터 호환 방식
- 기존 `facets` 안의 레거시 키는 그대로 유지됩니다.
- 탐색기 UI에서는 새 필터만 전면에 보여줍니다.
- 상세 편집 저장 시 레거시 키를 날리지 않도록 기존 값을 merge 합니다.
- 동일 제목 자동 태그 상속도 새 분류 기준을 우선 사용합니다.

## 적용 파일
- `index.html`
- `styles.css`
- `app.js`
- `apps_script/Code.gs`

## GitHub Pages 적용
기존 저장소의 `index.html`, `styles.css`, `app.js`를 교체하세요.

## Apps Script 적용
기존 Apps Script 프로젝트의 `Code.gs`를 이번 파일로 교체한 뒤 다시 저장하세요.
### 실행 권장 순서
1. `checkReferenceConnection`
2. `previewFirstReference`
3. `classifyNextBatch`

## Apps Script GPT 분류 설계 메모
GPT는 이제 다음 판단만 수행합니다.
- 활용 목적
- 마케팅 전략
- 고객 여정
- 프로모션·혜택
- 콘텐츠 역할
- 표현 톤
- 적용 채널·매체
- 업종
- 색상군
- 비주얼 스타일

반대로 아래 레거시 축은 새 분류 기준의 중심이 아니므로 GPT 기본 출력 대상에서 제외했습니다.
- 레이아웃
- 촬영 구도
- 주요 피사체
- 시즌/모션 등

## 주의
- 전략 분류는 AI의 **추정**입니다. 실제 브랜드의 내부 기획 의도와 100% 동일하다고 보장하지 않습니다.
- 기존에 레거시 태그만 있던 항목도 브라우저 로드시 일부 자동 변환되지만, 정확도가 중요하면 Apps Script 재분류를 권장합니다.
>>>>>>> parent of 0dc1a01 (수정)
