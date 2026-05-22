import { loadData, renderBoard } from './modules/render.js';
import { handlePaste, connectUsb } from './modules/actions.js';

// 브랜드 가이드 적용: Bubbitler 전용 함수
export function getBubbitlerPrompt(data) {
    return `
[분석 결과]
${data.insight}
(규칙: 이모지 사용 금지, Bubbitler 어조 유지)
    `.trim();
}

// 구글 드라이브 이미지 경로 자동 생성
export function getAssetUrl(item) {
    // 깃허브 배포 시 에셋 경로 또는 구글 드라이브 ID 활용
    if (item.driveFileId) {
        return `https://lh3.googleusercontent.com/d/${item.driveFileId}`;
    }
    return item.assetPath || ''; 
}

// 초기화 로직
async function init() {
    await loadData();
    renderBoard();
    
    document.getElementById('usb-connect').addEventListener('click', connectUsb);
    document.addEventListener('paste', handlePaste);
}

init();