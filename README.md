# MJREF 상세페이지 AI 결과 반영 연결 복구 · 2026-11-13

## 무엇이 문제였나요?

이전 구성에서는 `Code.gs`와 `DetailPageClassifier.gs`가 **같은 Google Drive `refboard-data.json`을 각각 수정**했습니다. 두 코드가 같은 JSON의 각자 오래된 사본을 저장하면 분류 결과가 사라질 위험이 있었습니다. 또한 상세페이지 화면의 **AI 결과 반영**은 이미 Drive에 저장된 결과를 읽을 뿐, Gemini를 직접 실행하지 않습니다. Gemini 503이 계속되면 AI 소구 분류는 완료되지 않으며 상태만 `retry`로 남을 수 있습니다.

> 실제 사용자 계정의 `Code.gs`, Drive 파일 및 실행 로그를 직접 확보하지 못했으므로, 기존 장애 원인이 반드시 데이터 충돌이었다고 단정하지 않습니다. 다만 구조상 충돌 위험과 실패 원인 표시 부족은 코드에서 확인했습니다.

## 새 저장 구조

```text
Google Drive / refboard-assets/
  ├─ refboard-data.json        ← 기존 Code.gs + 사이트 (원본 / 메모 / 카피 / 분류)
  ├─ refboard-pdp-ai.json      ← DetailPageClassifier.gs만 기록 (AI 상태 / 분석 결과)
  └─ assets/                   ← 이미지·영상 원본 (변경 없음)
```

- 새 `DetailPageClassifier.gs`는 **일반 레퍼런스 JSON을 읽기만** 하고, AI 결과는 전용 `refboard-pdp-ai.json`에 저장합니다. 새 파일은 첫 분석 결과가 발생할 때 자동으로 생성됩니다. 기존 `Code.gs`를 **수정하거나 삭제하지 않습니다.**
- 상세페이지 탭의 **AI 결과 반영** 버튼은 전용 AI 파일을 우선 조회하고, 기존 통합 JSON에 남아 있던 이전 AI 기록도 호환해서 가져옵니다.
- 결과 파일이 다른 원본 JSON과 연결되어 있다면 파일 ID 불일치를 화면에 표시합니다. 0건일 때는 AI 기록 없음 / 일치하는 상세페이지 없음 / 이미 최신 상태 / 재시도 예정 등의 이유를 알려줍니다.
- 기존 사용자가 직접 입력한 카피·메모·소구 포인트는 AI 결과로 덮어쓰지 않습니다. AI가 완료된 경우에만 빈 값 채우기·새 태그 추가가 가능합니다.
- **이미지 및 이미지 전용 캐러셀만 자동분류.** 영상, 영상 포함 캐러셀, 링크는 직접 분류합니다.
- Gemini HTTP 429/5xx에 대한 최대 3회 짧은 재시도, 지속적인 503에 대한 `retry` 및 다음 실행 예약을 유지합니다.
- `pdpCheckSetup`에 `sourceDataFileId`, `resultsFileId`, `resultsSaved`, `statuses`, `pending` 등을 추가했습니다. **API 키 값은 로그에 출력하지 않습니다.**

## 적용 순서 (둘 다 적용해야 연결됩니다)

1. **사이트 상단 `Drive에 저장`을 먼저 누르고, GitHub 및 Apps Script 코드를 별도로 백업하세요.** 다른 브라우저나 미저장 로컬 항목이 있으면 확인합니다.
2. GitHub Pages 저장소의 **`app.js`, `index.html`, `styles.css`**를 ZIP의 파일로 교체하고 배포가 완료되었는지 확인합니다. 일반 레퍼런스 데이터 구조와 화면, 상세페이지 수동 분류, 원클릭·일괄 이동 기능을 유지합니다.
3. **같은 Apps Script 프로젝트에서 기존 `DetailPageClassifier.gs` 내용을 전체 교체**합니다. 같은 이름의 함수가 다른 파일에 중복되지 않게 확인하세요.
4. **`Code.gs`는 그대로 유지**하고 `VideoAnalysis.gs`도 비활성 상태를 유지합니다. Gemini 키를 새로 넣을 필요는 없지만 기존 전역 변수/스크립트 속성에 접근할 수 있어야 합니다.
5. Apps Script 함수 목록에서 **`pdpCheckSetup`을 실행**하세요. 로그의 `ok: true`, `imageEligible`, `pending`, `sourceDataFileId`를 확인합니다. `ok: false`이면 `error` 내용을 확인해야 하며, 이 경우 아직 UI 반영을 진행하면 안 됩니다.
6. **`pdpClassifyNextBatch` 실행** → 응답의 `processed`, `done`, `retry`, `error`, `resultsSaved` 확인. 첫 정상 저장 후 Drive의 `refboard-assets` 폴더에 새 **`refboard-pdp-ai.json`** 파일이 생깁니다. 503이 지속될 때는 `retry`가 증가하고 `done`은 증가하지 않을 수 있습니다.
7. 배포된 사이트에서 **Google 연결 → 상세페이지 모음 → AI 결과 반영**을 누릅니다. 결과 아래에 `AI 기록 n건 / 현재 상세페이지와 일치 n건 / 이번 갱신 n건`과 상태별 건수가 표시됩니다. 새 분석 결과가 이미 반영되어 있다면 이번 갱신은 0건이 정상입니다.
8. 자동 분석을 원한다면 기존 `pdpClassifyNextBatch` 예약 트리거를 그대로 사용합니다. 트리거 중복 실행 여부만 점검하세요.

### 중요한 주의점

- **신규 상세페이지를 사이트에서 추가하거나 레퍼런스에서 이동했다면 먼저 `Drive에 저장`을 눌러야** Apps Script가 분류 대상으로 인식합니다. `AI 결과 반영` 버튼은 분석을 실행하는 버튼이 아닙니다.
- `Code.gs`가 `refboard-data.json`을 읽거나 수정하더라도 **전용 PDP AI 파일은 덮어쓰지 않습니다.** 다만 기존 일반 카피·분류 정보의 동시 수정까지 완전히 거래적으로 보호하는 구조는 아닙니다. 동시에 `Drive에 저장`하거나 여러 기기에서 다른 항목을 편집하는 것은 피하세요.
- 기존 버전에서 저장된 `items[].detailPage.pdpAi`는 호환해서 불러오지만, 완료되지 않았던 Gemini 503 분석은 별도 완료 결과가 생길 때까지 소구 태그가 자동 추가되지 않습니다.
- 앱스스크립트 코드를 수정하지 않고 웹 파일만 교체하면 새 AI 결과 파일이 만들어지지 않습니다. 반대로 웹 파일을 교체하지 않으면 기존 UI는 전용 AI 파일을 읽지 못합니다.
- **Drive 인증 정보나 Gemini 키를 디버깅용으로 공유하지 마세요.** 필요하면 `pdpCheckSetup`의 `ok`, `error`, `pending`, `resultsSaved`, `statuses`만 공유하세요.

## 확인·누락 사항

- JavaScript 문법 검사 통과 (`node --check`).
- **모의 통합 테스트 18/18 통과**: 별도 결과 파일 저장, 기존 Code.gs 원본 JSON 무수정, 기존 JSON 덮어쓰기 후 AI 결과 유지, 수동 재분류 요청, 503 예약, 영상 제외, 원본 메모·카피 보존, 사이트 전용 파일 조회, 파일 ID 불일치 진단, 0건 안내 등.
- 실제 **운영 `Code.gs` 원본**, 사용자 Google Drive, Gemini API 계정과 실제 브라우저 배포까지는 접근·검증하지 못했습니다. 실제 분석 성공률 및 운영 코드와의 최종 호환성은 설치 후 확인이 필요합니다.
- **기존 콘텐츠 수량/개별 항목의 실제 분류 완료 여부는 알 수 없어 임의로 채우지 않았습니다.**
