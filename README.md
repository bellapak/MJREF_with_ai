# 레퍼런스 탐색기 — Apps Script 바로 가기 및 선택형 예약 트리거

## 적용
GitHub Pages 저장소에서 `index.html`, `app.js`, `styles.css`를 교체하세요. 레퍼런스와 Drive 데이터 구조는 변경하지 않습니다.

## 사이트에서 내 Apps Script로 바로 이동
1. 본인 Google Apps Script 프로젝트를 열어 브라우저 주소창의 편집기 URL(예: `https://script.google.com/home/projects/프로젝트ID/edit`)을 복사합니다.
2. 레퍼런스 탐색기 **AI 분류 현황 → 연결 설정** 버튼으로 주소를 등록합니다.
3. 이제 **Apps Script 열기** 버튼으로 해당 프로젝트 편집기로 바로 이동할 수 있습니다.
4. `classifyNextBatch`를 수동 실행합니다. 완료 후 탐색기로 돌아와 **AI 분류 결과 반영** 버튼을 클릭합니다.

프로젝트 주소는 브라우저 localStorage에만 보관하며 API 키는 저장하지 않습니다. 다른 브라우저에서는 다시 설정해야 합니다. 링크를 안다고 스크립트 실행 권한이 생기는 것은 아닙니다.

## 선택: 매일 자동으로 미분류 이미지 처리
이미 설치한 Apps Script `Code.gs`를 이번 ZIP의 `apps_script/Code.gs`로 교체한 뒤 다음 중 필요한 함수를 **직접 한 번 실행**하세요.
- `installDailyClassificationTrigger`: 매일 오전 9시 전후 `classifyNextBatch`를 실행하는 시간 기반 트리거 1개 설치. 1회 최대 5개 분석.
- `removeClassificationTriggers`: 위 분석 함수의 예약 트리거 삭제.

오전 9시는 Apps Script 프로젝트에 설정한 시간대 기준이며, 정확한 분에 실행되지 않을 수 있습니다. Google Apps Script **트리거(시계 아이콘)** 메뉴에서 생성/삭제를 확인할 수 있습니다. 자동 분류는 GPT API 사용료를 발생시킬 수 있으므로 필요할 때만 사용하세요. 최초 권한 승인이 필요할 수 있습니다.

## 주의
- 사이트 버튼은 편집기를 **여는 버튼**입니다. GitHub Pages에서 Apps Script 함수를 직접 호출하지 않습니다.
- Apps Script에서 실행 중에는 사이트의 **Drive 저장**을 누르지 마세요. 종료 후 **AI 분류 결과 반영**을 먼저 실행하세요.
- 기존 Code.gs의 AI 분류 범위는 이미지와 캐러셀이며 영상 자동 분류는 지원하지 않습니다.
- 보안상 OpenAI API 키는 Apps Script 스크립트 속성에만 보관하세요.
- JavaScript 구문 검사는 실행할 수 있으나 실제 Google 계정 승인/Drive 동기화는 해당 계정에서 확인이 필요합니다.
