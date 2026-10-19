# Drive 연결/자동저장 UI 수정

GitHub Pages에서 `index.html`, `styles.css`, `app.js`를 교체하세요. Apps Script 변경은 필요 없습니다.

- 중복된 Drive 연결 표시 제거, 하나의 통일된 상태 칩 제공
- Drive 저장 완료는 실제 Drive 업로드 또는 Drive 불러오기 성공 시에만 표시
- 연결만 된 상태에서는 `Drive 연결됨 · 동기화 필요` 표시. 클릭 시 최신 Drive 데이터 불러오기
- 오류 시 `Drive 저장 실패 · 재시도`를 눌러 다시 저장 시도
- 기존 캐러셀 붙여넣기와 AI 분류 기능 유지

배포 후 Drive 불러오기를 한 번 실행하고 레퍼런스를 수정해 실제 저장 상태를 확인하세요.
