// AI 분석 및 프롬프트 생성 모듈
export function generateAIReport(data) {
    const report = {
        insight: `이 콘텐츠는 ${data.visualTone} 톤앤매너를 지향하며, 핵심 요소는 ${data.keyElements}입니다.`,
        // 실무형 프롬프트 생성
        prompt: `[전략 프롬프트] 위 분석을 바탕으로, 20-30대 여성 타겟의 인스타그램 광고 카피 3가지를 작성해줘. 톤앤매너는 ${data.brandVoice}를 유지해.`
    };
    return report;
}

// 보드 카드 렌더링 시 AI 결과 삽입 로직
function renderCard(item) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
        <img src="${item.src}">
        <div class="ai-report">
            <p>${item.aiResult.insight}</p>
            <button onclick="copyToClipboard('${item.aiResult.prompt}')">프롬프트 복사</button>
        </div>
    `;
    return card;
}