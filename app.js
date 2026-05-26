// =====================================================
//  refboard v30 — app.js (통합 수정본)
// =====================================================

// ─── 1. CONSTANTS ───
const CAT_COLORS=['#ff6b35','#ff3b8b','#7b5cfa','#3b9eff','#3bfa8a','#ffd23b','#ff5555','#00d4d4','#ffaa3b','#c8f060'];
const PROVIDER_HINTS={
  anthropic:'발급: console.anthropic.com/settings/keys',
  openai:'발급: platform.openai.com/api-keys',
  google:'발급: aistudio.google.com/app/apikey'
};

// ─── 2. STATE 및 드라이브 전역 변수 ───
let groups=[]; 
let categories=[];
let items=[];
let currentFilter='all';
let currentCatFilter=null;
let currentSort='newest';
let currentView='grid';
let selectedId=null;
let pendingFile=null;
let gdriveToken=null;
let gdriveTokenExpiry=0;
let gdriveFolderId=null;
let gdriveDataFileId=null;
let state = { items: [] }; // 기존 상태 구조 유지

// ─── 3. 드라이브 이미지 로드 및 업로드 핵심 로직 (추가/수정) ───

async function getDriveImageURL(fileId) {
  try {
    const response = await gapi.client.drive.files.get({
      fileId: fileId,
      alt: 'media'
    });
    const blob = new Blob([response.body], { type: 'image/png' });
    return URL.createObjectURL(blob);
  } catch (err) {
    console.error("드라이브 이미지 로드 실패:", err);
    return null;
  }
}

async function saveFromModal() {
  const fileInput = document.getElementById('file-upload-input');
  const file = fileInput && fileInput.files ? fileInput.files[0] : null;
  let driveFileId = null;

  if (file) {
    try {
      const folderId = await ensureAssetFolder();
      const metadata = { name: file.name, parents: [folderId] };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', file);
      
      const response = await gapi.client.request({
        path: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        method: 'POST',
        body: form
      });
      driveFileId = response.result.id;
    } catch(e) { console.error("Drive 업로드 실패", e); }
  }

  const newItem = {
    id: 'r' + Date.now(),
    title: document.getElementById('add-title').value || '제목없음',
    driveFileId: driveFileId,
    src: '', // 드라이브 전용 구조로 전환
    type: 'image',
    catIds: modalSelectedCats,
    ts: Date.now()
  };
  
  items.push(newItem);
  state.items = items;
  await saveData();
  renderBoard();
  closeModal('add-modal');
}

// ─── 4. 기존 코드 통합 (Board Render 수정) ───
// renderBoard 함수 내의 미디어 생성 부분을 찾아 아래와 같이 수정하세요.
/*
  if(it.type === 'image') {
    media = document.createElement('img');
    media.className = 'card-media';
    media.loading = 'lazy';
    if (it.driveFileId) {
      getDriveImageURL(it.driveFileId).then(url => { if(url) media.src = url; });
    } else {
      media.src = it.src;
    }
    media.alt = it.title;
  }
*/

// [이하 기존의 모든 함수(PERSISTENCE, USB, TAB, CAT, AI, INIT 등)를 
// 현재 이 위치부터 파일 끝까지 그대로 붙여넣으시면 됩니다.]

// ─── INIT 수정 ───
async function initApp() {
  const config = getGapiConfig();
  
  // 키가 없으면 설정 모달을 띄우고 종료
  if (!config.apiKey || !config.clientId) {
    console.log("구글 API 설정이 필요합니다.");
    openGdriveSetup(); // 기존에 구현되어 있던 설정 함수 호출
    return;
  }

  try {
    await new Promise((resolve) => gapi.load('client:auth2', resolve));
    await gapi.client.init({
      apiKey: config.apiKey,
      clientId: config.clientId,
      discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
      scope: 'https://www.googleapis.com/auth/drive.file'
    });
    await loadData();
    renderBoard();
  } catch (e) { 
    console.error("초기화 실패:", e); 
    showToast("연결 실패. API 설정을 확인하세요.");
  }
}