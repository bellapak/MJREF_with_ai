// app.js 핵심 로직 구조화
import { loadData, initBoard } from './modules/board.js';
import { handlePaste } from './modules/input.js';

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    initBoard();
    
    // 이미지 붙여넣기 이벤트 리스너
    document.addEventListener('paste', handlePaste);
});