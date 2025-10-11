export let dom = {};

export function initializeDom() {
    dom = {
        // 主佈局
        toolbar: document.getElementById('toolbar'),
        mainContent: document.getElementById('main-content'),
        resizer: document.getElementById('resizer'),
        pdfEmbed: document.getElementById('pdf-embed'),
        
        // 檔案操作
        fileInput: document.getElementById('fileInput'),
        clearSessionBtn: document.getElementById('clear-session-btn'),
        restoreSessionBtn: document.getElementById('restore-session-btn'),
        restoreSessionContainer: document.getElementById('restore-session-container'),
        docSelectionDropdown: document.getElementById('docSelectionDropdown'),

        // 頁面導航
        goToFirstPageBtn: document.getElementById('go-to-first-page'),
        prevPageBtn: document.getElementById('prev-page'),
        nextPageBtn: document.getElementById('next-page'),
        goToLastPageBtn: document.getElementById('go-to-last-page'),
        pageNumDisplay: document.getElementById('page-num-display'),
        pageToGoInput: document.getElementById('page-to-go'),
        goToPageBtn: document.getElementById('go-to-page-btn'),
        
        // 搜尋
        searchInputElem: document.getElementById('searchInput'),
        searchActionButton: document.getElementById('search-action-button'),
        panelResultsDropdown: document.getElementById('panelResultsDropdown'),
        searchResultsPanel: document.getElementById('search-results-panel'),
        resultsList: document.getElementById('results-list'),

        // 工具 (您可以視情況取消註解 recomposePdfBtn)
        // recomposePdfBtn: document.getElementById('recompose-pdf-btn'),
    };
}

export let appState = {
    pdfDocs: [], // 儲存 pdf.js 的文件物件 (用於搜尋)
    pdfBlobs: [], // 儲存包含 Object URL 的物件 (用於顯示)
    
    currentDocIndex: -1, // 目前顯示的文件索引
    currentPage: 1, // 目前的頁碼 (相對於目前文件)
    
    searchResults: [],
};

export function resetAppState() {
    // 清除舊的 Object URL 以釋放記憶體
    appState.pdfBlobs.forEach(blobInfo => URL.revokeObjectURL(blobInfo.url));

    appState = {
        pdfDocs: [],
        pdfBlobs: [],
        currentDocIndex: -1,
        currentPage: 1,
        searchResults: [],
    };
    if (dom.searchInputElem) dom.searchInputElem.value = '';
}

