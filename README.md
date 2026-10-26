# MJREF 영상 분석 오류 수정 — 2026-10-26

## 원인
이전 `VideoAnalysis.gs`가 Apps Script `Blob` 객체에 없는 `blob.getSize()`를 호출했습니다.
`DriveApp.File.getSize()`가 제공하는 크기를 확인한 후 `file.getBlob().getBytes()`로 Gemini에 전달하도록 수정했습니다.

## 교체 대상 2개
- `VideoAnalysis.gs` — **필수. 실제 오류가 있던 곳입니다.** Google Apps Script 프로젝트에서 *해당 파일 내용만* 전체 교체하세요. `Code.gs`는 손대지 마세요.
- `app.js` — **권장.** 실패한 영상의 상세 화면에 재시도 안내를 표시하는 UI 소규모 패치입니다. 기존 GitHub 저장소 루트 `app.js`를 백업 후 교체하세요. 첨부받은 최신 `app(5).js`를 기준으로 작업했습니다.

`index.html`, `styles.css` 변경은 필요 없습니다. 현재 AI/분류/성과 지표/다중 캐러셀/Drive 수동 저장은 유지됩니다.

## 기존 실패 영상 재분석 (6개 프레임이 이미 Drive에 올라간 경우)
1. Apps Script에서 기존 `VideoAnalysis.gs`를 이번 파일로 교체 후 저장합니다.
2. `mjrefAnalyzePendingVideos` 함수를 직접 실행합니다. 이전의 정확히 `blob.getSize is not a function` 오류를 가진 영상은 `status=error`에서도 우선 재시도됩니다. 같은 6개 프레임을 그대로 사용합니다.
3. 실행 로그의 `분석 완료` 확인 후 사이트 영상 카드의 **결과 가져오기 ↻** 를 누릅니다.
4. 추천 태그를 선택적으로 반영한 뒤 사이트의 **Drive에 저장** 버튼으로 수동 저장합니다.

중간에 **Drive 불러오기**를 누르지 마세요. 로컬 변경사항을 덮어쓸 수 있습니다. 실패한 영상의 '선택 모드 분석 준비' 버튼도 누를 필요 없습니다.

## 예외
- Apps Script 결과가 이미 성공인데 브라우저 화면에 과거 오류만 남았다면, 우선 '결과 가져오기'를 누르세요.
- 재실행에서 API의 401/403/429/400 등의 오류가 나오면 API 키, 프로젝트/결제, 할당량, MIME 지원 여부 등을 별도로 확인해야 합니다. 이 코드 변경만으로 API 정책 오류가 해결되는 것은 아닙니다.
- 이전 오류가 `blob.getSize`가 아닌 다른 오류라면 이번 자동 재시도 대상이 아닙니다. 그 경우 원인을 먼저 확인해야 합니다.

## 확인한 범위
- 소스 내 `blob.getSize()` 호출 제거, Drive File 크기 검사, 6장 프레임 인코딩 및 기존 에러 상태의 재처리 로직 모의 테스트.
- `app.js`, `VideoAnalysis.gs` JavaScript 파싱 검증.
- 실제 Google Drive/Gemini API 인증을 이용한 실행은 이 환경에서 확인하지 못했습니다.
