# Reference Encyclopedia - 검수 수정본

기존 업로드 파일 기반으로 다음 오류를 수정했습니다.

- 초기 로드 시 `renderFacetFilters()`를 호출해 왼쪽 13개 필터 트리가 표시되도록 수정
- 레퍼런스 추가 모달 내 잘못 닫힌 `</div>` 제거

기존 localStorage 저장 키 및 Google Drive 연동 코드, 수동 태그 구성은 유지했습니다.

배포: GitHub Pages의 동일 경로에 `index.html`, `app.js`, `styles.css` 업로드. 기존 버전과 데이터 백업 권장.

검증: JavaScript 구문 및 HTML DOM 구조 정적 검사. 실제 브라우저/Google Drive 연동은 미검증.

## 이번 수정
- 웹사이트 탭과 좌측 상단 브랜드명을 `레퍼런스 탐색기`로 변경
- 상단 검색창 예시 문구를 조금 더 선명한 중간 회색(`#9299A5`)으로 변경
- 기존 레퍼런스 데이터 및 분류·필터 로직은 변경하지 않음
