// main.js - 應用程式主邏輯
import dom, * as UI from './ui.js';
import * as DB from './db.js';

let state = {
    files: [], // { name, blob, pageCount, textContentByPage, currentPage }
    currentFile: null,
};

let pdfWorker = null;

// 初始化
function init() {
    setupEventListeners();
    UI.updateNav(0, 0); // 初始隱藏導航列
    checkAndShowRestoreButton();
}

function setupEventListeners() {
    dom.selectFilesBtn.addEventListener('click', () => dom.fileInput.click());
    dom.fileInput.addEventListener('change', handleFileSelect);
    dom.clearFilesBtn.addEventListener('click', handleClearAll);
    dom.restoreSessionBtn.addEventListener('click', handleRestoreSession);
    
    dom.docSelector.addEventListener('change', handleDocChange);
    dom.searchInput.addEventListener('input', handleSearch);

    // 導航事件
    dom.firstPageBtn.addEventListener('click', () => navigateToPage(1));
    dom.prevPageBtn.addEventListener('click', () => navigateToPage(state.currentFile.currentPage - 1));
    dom.nextPageBtn.addEventListener('click', () => navigateToPage(state.currentFile.currentPage + 1));
    dom.lastPageBtn.addEventListener('click', () => navigateToPage(state.currentFile.pageCount));
    dom.pageNumInput.addEventListener('change', () => navigateToPage(parseInt(dom.pageNumInput.value, 10)));

    // 分隔線拖曳
    dom.resizer.addEventListener('mousedown', initResize);
}

// 檔案處理
async function handleFileSelect(event) {
    const selectedFiles = Array.from(event.target.files);
    if (selectedFiles.length === 0) return;

    UI.setLoading(true, `正在處理 ${selectedFiles.length} 個檔案...`);

    // 重置 worker
    if (pdfWorker) pdfWorker.terminate();
    // ***** 核心修正點 *****
    // 告訴瀏覽器我們的 worker 是一個 ES Module
    pdfWorker = new Worker('worker.js', { type: 'module' }); 
    
    let processedCount = 0;
    const totalFiles = selectedFiles.length;

    pdfWorker.onmessage = (e) => {
        processedCount++;
        UI.setLoading(true, `處理中 (${processedCount}/${totalFiles})...`);

        if (e.data.status === 'success') {
            const newFile = {
                ...e.data.result,
                blob: selectedFiles.find(f => f.name === e.data.result.name),
                currentPage: 1
            };
            state.files.push(newFile);
        } else {
            // 確保即使 worker 傳回的資料有問題，也不會顯示 "undefined"
            const fileName = e.data.fileName || '未知檔案';
            UI.showFileLoadError(fileName);
            console.error(`Failed to process ${fileName}:`, e.data.error);
        }

        if (processedCount === totalFiles) {
            onAllFilesProcessed();
        }
    };
    
    // 依序發送檔案給 worker
    selectedFiles.forEach(file => {
        pdfWorker.postMessage({ file });
    });
}

function onAllFilesProcessed() {
    state.files.sort((a, b) => a.name.localeCompare(b.name));
    DB.saveSession(state.files);

    if (state.files.length > 0) {
        state.currentFile = state.files[0];
        dom.searchInput.disabled = false;
    } else {
        state.currentFile = null;
    }

    UI.setLoading(false);
    updateUI();
}

function handleClearAll() {
    // 釋放所有 Blob URL
    const oldEmbed = dom.pdfViewer.querySelector('#pdf-embed');
    if (oldEmbed && oldEmbed.dataset.blobUrl) {
        URL.revokeObjectURL(oldEmbed.dataset.blobUrl);
    }

    state = { files: [], currentFile: null };
    UI.clearAll();
    DB.clearSession();
    checkAndShowRestoreButton();
}

async function checkAndShowRestoreButton() {
    const hasSessionData = await DB.hasSession();
    UI.setRestoreButtonVisibility(hasSessionData);
}

async function handleRestoreSession() {
    UI.setLoading(true, '正在恢復工作階段...');
    try {
        const sessionData = await DB.loadSession();
        if (sessionData && sessionData.length > 0) {
            state.files = sessionData.map(f => ({ ...f, currentPage: 1 }));
            state.currentFile = state.files[0];
            dom.searchInput.disabled = false;
            updateUI();
        }
    } catch (error) {
        console.error("Failed to restore session:", error);
        alert("恢復工作階段失敗。");
    } finally {
        UI.setLoading(false);
        UI.setRestoreButtonVisibility(false);
    }
}


// UI 更新與導航
function updateUI() {
    UI.updateDocSelector(state.files, state.currentFile?.name);
    if (state.currentFile) {
        UI.displayPdf(state.currentFile);
        UI.updateNav(state.currentFile.currentPage, state.currentFile.pageCount);
    } else {
        UI.clearAll();
    }
}

function handleDocChange(event) {
    const selectedFileName = event.target.value;
    state.currentFile = state.files.find(f => f.name === selectedFileName);
    if (state.currentFile) {
        state.currentFile.currentPage = 1; // 切換文件時回到第一頁
        updateUI();
    }
}

function navigateToPage(pageNum) {
    if (!state.currentFile) return;

    const totalPages = state.currentFile.pageCount;
    let newPage = Math.max(1, Math.min(pageNum, totalPages));

    if (isNaN(newPage)) newPage = 1;

    state.currentFile.currentPage = newPage;
    updateUI();
}

// 搜尋功能
function handleSearch(event) {
    const keyword = event.target.value.trim().toLowerCase();
    if (keyword.length < 1) {
        UI.updateSearchResults([]);
        return;
    }
    
    const results = [];
    state.files.forEach(file => {
        if (!file.textContentByPage) return;
        for (const pageNum in file.textContentByPage) {
            if (file.textContentByPage[pageNum].toLowerCase().includes(keyword)) {
                results.push({
                    fileName: file.name,
                    pageNum: parseInt(pageNum, 10)
                });
            }
        }
    });

    UI.updateSearchResults(results, handleSearchResultClick);
}

function handleSearchResultClick(result) {
    state.currentFile = state.files.find(f => f.name === result.fileName);
    if (state.currentFile) {
        state.currentFile.currentPage = result.pageNum;
        updateUI();
    }
}

// 分隔線拖曳邏輯
function initResize(e) {
    e.preventDefault();
    document.body.classList.add('resizing');
    window.addEventListener('mousemove', startResizing);
    window.addEventListener('mouseup', stopResizing);
}

function startResizing(e) {
    const newWidth = e.clientX;
    const minWidth = 200;
    const maxWidth = 600;
    
    if (newWidth >= minWidth && newWidth <= maxWidth) {
        dom.toolbar.style.width = `${newWidth}px`;
    }
}

function stopResizing() {
    document.body.classList.remove('resizing');
    window.removeEventListener('mousemove', startResizing);
    window.removeEventListener('mouseup', stopResizing);
}

// 啟動應用
init();
