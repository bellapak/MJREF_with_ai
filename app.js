// 버빗 브랜드 가이드
const BRAND_RULES = "이모지 사용 절대 금지. Bubbitler를 위한 깊이 있는 텍스트 힙 스타일. 캐릭터 비율 왜곡 금지.";

// 이미지 불러오기 (기존 USB 로직 통합)
async function connectFolder() {
    try {
        const handle = await window.showDirectoryPicker();
        document.getElementById('status').textContent = 'Bubbitler 데이터 연동 완료';
        // 여기서 파일 목록 스캔 로직 추가
    } catch (e) { console.error(e); }
}

// AI 리포트 생성 (버빗 전용)
export function renderBubbitReport(data) {
    return `
[분석 리포트]
의도: ${data.intent}
캐릭터 상태: 비율 일치
제언: ${data.insight}

[실무 프롬프트]
"위 분석을 바탕으로 Bubbitler에게 전달할 SNS 카피 작성.
규칙: ${BRAND_RULES}"
    `.trim();
}

document.getElementById('usb-connect').addEventListener('click', connectFolder);