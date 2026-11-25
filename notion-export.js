// Private Apps Script deployment. Only the deployment address is stored here.
const notionEndpointKey = 'mjref_notion_webapp_url';

function configureNotionExport() {
  const old = document.getElementById('notion-connection-dialog');
  if (old) old.remove();
  const dialog = document.createElement('dialog');
  dialog.id = 'notion-connection-dialog';
  dialog.innerHTML = '<form method="dialog"><label>노션 연결 주소 <input type="url" required placeholder="Google Apps Script 웹 앱 주소 (/exec)"></label> <button type="submit">주소 저장</button> <button type="button">취소</button></form>';
  const form = dialog.querySelector('form');
  const input = form.querySelector('input');
  input.value = localStorage.getItem(notionEndpointKey) || '';
  input.addEventListener('input', () => input.setCustomValidity(''));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const address = input.value.trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(address)) {
      input.setCustomValidity('Google Apps Script의 /exec 주소를 입력하세요.');
      input.reportValidity();
      return;
    }
    localStorage.setItem(notionEndpointKey, address);
    dialog.close();
    showToast('주소 저장 완료 · 노션으로 보내기를 눌러주세요.', 'success');
  });
  form.querySelector('[type="button"]').onclick = () => dialog.close();
  dialog.onclose = () => dialog.remove();
  document.body.appendChild(dialog);
  dialog.showModal();
}

function openNotionExport() {
  const card = items.find(item => item.id === selectedId);
  if (!card) return;
  const endpoint = localStorage.getItem(notionEndpointKey);
  if (!endpoint) { configureNotionExport(); return; }
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)) return;
  const payload = {
    id: card.id,
    title: ($('detail-edit-title')?.value ?? card.title ?? '').trim() || '제목 없음',
    link: ($('detail-edit-link')?.value ?? card.sourceUrl ?? '').trim(),
    memo: $('detail-edit-notes')?.value ?? card.notes ?? ''
  };
  if (!payload.link && card.driveFileId) {
    payload.link = 'https://drive.google.com/open?id=' + encodeURIComponent(card.driveFileId);
  }
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = endpoint;
  form.target = '_blank';
  form.rel = 'noopener';
  const data = document.createElement('input');
  data.type = 'hidden';
  data.name = 'card';
  data.value = JSON.stringify(payload);
  form.appendChild(data);
  document.body.appendChild(form);
  form.submit();
  form.remove();
}
