# 레퍼런스 탐색기 — Apps Script GPT 결과를 웹페이지에 반영

## 무엇이 바뀌었나
- 웹페이지 검색창 아래 **AI 분류 현황**: 전체, 분류 완료, 미분류(Drive에 이미지가 존재하여 분석 가능) 개수
- **Apps Script에서 일괄 분류**: Google Apps Script 프로젝트 목록을 새 창으로 엽니다. 거기서 `classifyNextBatch`를 선택·실행하세요.
- **AI 분류 결과 반영**: 기존 `loadFromDrive()`를 재사용하여 `refboard-data.json`의 최신 `facets`를 가져옵니다. 필터와 검색 카드도 다시 렌더링합니다.
- 이 버튼은 **GPT를 실행하는 버튼이 아닙니다**. 별도 서버 없이 공개 GitHub Pages에서 안전하게 API 호출을 시작할 수 없으므로 의도적으로 분리했습니다.
- 기존 Drive 폴더, JSON 파일명, 로컬 저장 키, 색상/혜택/스타일을 비롯한 분류 구조는 변경하지 않았습니다.

## 설치
1. ZIP의 `index.html`, `styles.css`, `app.js`를 GitHub Pages 저장소의 기존 파일과 교체합니다.
2. 최신 Apps Script를 이미 설치한 경우 `Code.gs`는 그대로 사용해도 됩니다. ZIP의 `apps_script/Code.gs`에는 이전에 제공한 7MB 초과 이미지 썸네일 대체 버전을 같이 동봉했습니다.
3. GitHub Pages 배포 후 브라우저에서 강력 새로고침하고, 상단의 Google 연결을 확인합니다.
4. 이미지·영상 업로드 후 **Drive 저장**이 완료되었는지 확인합니다.
5. **Apps Script에서 일괄 분류** → 본인의 Apps Script 프로젝트 열기 → `classifyNextBatch` 실행 (1회 최대 5개, 필요 시 반복).
6. Apps Script 실행이 끝나면 사이트로 돌아와 **AI 분류 결과 반영** 클릭.
7. 왼쪽 필터 탐색기에서 색상/혜택/비주얼 스타일 등 분류를 선택해 검색 결과를 확인합니다.

## 보안 및 운영 주의
- `OPENAI_API_KEY`는 Apps Script의 스크립트 속성에만 보관합니다. GitHub 파일이나 브라우저에서 API 키를 받지 않습니다.
- Apps Script 실행 중 사이트에서 **Drive 저장을 누르면 데이터 충돌/덮어쓰기**가 발생할 수 있습니다. 스크립트 완료 후 **AI 분류 결과 반영**을 먼저 누르세요.
- 로컬에서만 추가하고 Drive에 올리지 않은 항목이 있다면, 결과 반영 시 로컬 데이터가 Drive 기준으로 교체될 수 있습니다. 먼저 Drive에 저장하고 분석하세요.
- 이미지/캐러셀만 GPT 분석을 지원합니다. 영상은 기존 Apps Script 스크립트에서 분석하지 않습니다.
- Apps Script 함수 실행은 Google Drive 접근권한이 있는 동일 Gmail 계정에서 진행해야 합니다.

## 검증
- `node --check app.js` 통과
- HTML의 동기화 버튼과 자바스크립트 연결 확인
- 실제 배포 사이트의 Google 로그인과 Apps Script 실행은 테스트하지 못했으므로 본인 환경에서 최종 확인 필요
