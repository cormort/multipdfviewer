// ui.js - 處理所有 DOM 操作
const dom = {
    toolbar: document.getElementById('toolbar'),
    selectFilesBtn: document.getElementById('select-files-btn'),
    fileInput: document.getElementById('file-input'),
    clearFilesBtn: document.getElementById('clear-files-btn'),
    restoreSessionBtn: document.getElementById('restore-session-btn'),
    docSelector: document.getElementById('doc-selector'),
    searchInput: document.getElementById('search-input'),
    searchResults: document.getElementById('search-results'),
    loadingIndicator: document.getElementById('loading-indicator'),
    loadingText: document.getElementById('loading-text'),
    resizer: document.getElementById('resizer'),
    mainContent: document.getElementById('main-content'),
    navBar: document.getElementById('nav-bar'),
    firstPageBtn: document.getElementById('first-page-btn'),
    prevPageBtn: document.getElementById('prev-page-btn'),
    nextPageBtn: document.getElementById('next-page-btn'),
    lastPageBtn: document.getElementById('last-page-btn'),
    pageNumInput: document.getElementById('page-num-input'),
    pageInfo: document.getElementById('page-info'),
    pdfViewer: document.getElementById('pdf-viewer'),
};

export function updateDocSelector(files, selectedFileName) {
    dom.docSelector.innerHTML = '';
    if (files.length === 0) {
        dom.docSelector.disabled = true;
        return;
    }
    
    files.forEach(file => {
        const option = document.createElement('option');
        option.value = file.name;
        option.textContent = file.name;
        if (file.name === selectedFileName) {
            option.selected = true;
        }
        dom.docSelector.appendChild(option);
    });
    dom.docSelector.disabled = false;
}

export function displayPdf(file) {
    // 清除舊的 Blob URL
    const oldEmbed = dom.pdfViewer.querySelector('#pdf-embed');
    if (oldEmbed && oldEmbed.dataset.blobUrl) {
        URL.revokeObjectURL(oldEmbed.dataset.blobUrl);
    }

    dom.pdfViewer.innerHTML = '';
    if (!file || !file.blob) {
        dom.pdfViewer.innerHTML = '<p class="placeholder-text">無法顯示檔案</p>';
        return;
    }

    const blobUrl = URL.createObjectURL(file.blob);
    const embed = document.createElement('embed');
    embed.id = 'pdf-embed';
    embed.src = `${blobUrl}#view=FitH&page=${file.currentPage}`;
    embed.type = 'application/pdf';
    embed.dataset.blobUrl = blobUrl; // 儲存 URL 以便之後釋放
    
    dom.pdfViewer.appendChild(embed);
}

export function updateNav(currentPage, totalPages) {
    if (totalPages === 0) {
        dom.navBar.classList.add('hidden');
        return;
    }
    
    dom.navBar.classList.remove('hidden');
    dom.pageNumInput.value = currentPage;
    dom.pageNumInput.max = totalPages;
    dom.pageInfo.textContent = `第 ${currentPage} 頁 / 共 ${totalPages} 頁`;

    dom.firstPageBtn.disabled = currentPage === 1;
    dom.prevPageBtn.disabled = currentPage === 1;
    dom.nextPageBtn.disabled = currentPage === totalPages;
    dom.lastPageBtn.disabled = currentPage === totalPages;
}

export function updateSearchResults(results, clickHandler) {
    dom.searchResults.innerHTML = '';
    if (results.length === 0) return;

    results.forEach((result, index) => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.textContent = `P.${result.pageNum} (${result.fileName})`;
        item.dataset.fileName = result.fileName;
        item.dataset.pageNum = result.pageNum;
        item.addEventListener('click', () => clickHandler(result));
        dom.searchResults.appendChild(item);
    });
}

export function clearAll() {
    updateDocSelector([]);
    dom.pdfViewer.innerHTML = '<p class="placeholder-text">請從左側選擇 PDF 檔案以開始</p>';
    updateNav(0, 0);
    dom.searchInput.value = '';
    dom.searchInput.disabled = true;
    updateSearchResults([]);
}

export function setLoading(isLoading, text = '處理中...') {
    dom.loadingIndicator.classList.toggle('hidden', !isLoading);
    dom.loadingText.textContent = text;
    document.body.style.cursor = isLoading ? 'wait' : 'default';
}

export function setRestoreButtonVisibility(visible) {
    dom.restoreSessionBtn.classList.toggle('hidden', !visible);
}

export function showFileLoadError(fileName) {
    alert(`檔案 "${fileName}" 載入失敗，可能已損毀、受密碼保護或格式不支援。`);
}

export default dom;
