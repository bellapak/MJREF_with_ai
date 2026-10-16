# GitHub 공개 배포용 레퍼런스 백과 (보안형)

## 1) GitHub Pages (정적 웹)
`index.html`, `styles.css`, `app.js`만 기존 GitHub Pages 프로젝트의 웹 루트에 배치하세요.
**OpenAI API 키, REFBOARD_ACCESS_CODE, .dev.vars 파일은 GitHub에 넣지 마세요.**

## 2) Cloudflare Worker (AI API 전용 서버)
`worker` 디렉터리에서 Wrangler CLI로 배포합니다.

```bash
cd worker
npx wrangler login
# wrangler.toml의 ALLOWED_ORIGIN을 실제 GitHub Pages Origin으로 수정
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put REFBOARD_ACCESS_CODE
npx wrangler deploy
```

`REFBOARD_ACCESS_CODE`는 OpenAI API 키와 **다른, 충분히 긴 임의의 비밀번호**입니다. Worker의 비밀 값은 Cloudflare에 저장하며 GitHub에 올리지 않습니다. `ALLOWED_ORIGIN`은 주소 전체가 아닌 Origin만 적으세요. 예: `https://username.github.io` (레포지토리 경로 제외).

## 3) 웹앱에서 AI 사용
상단의 **AI 분류 설정** 버튼 → 배포된 Worker의 HTTPS URL 및 접근 코드 입력 → 레퍼런스 상세 → AI 분류 클릭.
사용자의 접근 코드는 페이지가 열린 탭의 메모리에만 유지합니다. OpenAI API 키는 절대 브라우저로 전달되지 않습니다.

## 4) 접근 제어 및 요금 주의
- GitHub Pages에 공개한 것은 **누구나 레퍼런스 UI에 접근 가능하다**는 의미입니다. Google Drive OAuth 및 폴더/파일 권한은 별도로 검토하세요.
- CORS의 출처 허용은 인증이 아닙니다. Worker는 **별도 비밀 접근 코드**로 모든 AI 요청을 검증합니다. 이 코드를 공개하면 제3자가 GPT 호출 비용을 발생시킬 수 있습니다.
- 운영에서는 Cloudflare WAF/Rate Limiting과 OpenAI 프로젝트 예산 및 사용량 알림을 설정하는 것이 좋습니다. 접근 코드 공유 및 악용 대응이 중요하면 Cloudflare Access 또는 정식 사용자 로그인 기반 인증으로 고도화하세요.
- GitHub에 API 키를 과거에 커밋했거나 공개 페이지의 localStorage에 실제 OpenAI API 키를 넣은 적이 있으면 **OpenAI에서 키를 폐기하고 새로 발급**하세요. Git 기록을 지우는 것만으로 노출 위험이 해결되지는 않습니다.
- OAuth 로그인에 사용하는 Google Client ID는 공개 가능한 식별자이지만 Google Cloud의 허용 출처 / 리디렉션 / 동의 화면과 Drive 권한 범위는 따로 점검하세요.
- 정적 페이지는 사용자별 접근 제한을 제공하지 않습니다. 공개하고 싶지 않은 레퍼런스 자체를 보호하려면 로그인·데이터 분리가 필요합니다.

## 5) 기존 데이터
동일한 localStorage/Drive 데이터 형식을 유지합니다. 배포 전 Drive의 `refboard-data.json` 및 기존 세 파일을 백업하세요.

## 테스트 범위
JavaScript 구문 검사를 수행하였으나 실제 Cloudflare·OpenAI·Google Drive 운영 연동 테스트는 하지 않았습니다.
