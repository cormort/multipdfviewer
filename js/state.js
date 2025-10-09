// in js/state.js

// 這個檔案是應用程式共享狀態的唯一來源 (Single Source of Truth)

// 1. 宣告一個空的、可被修改的 dom 物件
export let dom = {};

// 2. 創建一個函數，在應用程式啟動時填充這個 dom 物件
export function initializeDom() {
    dom = {
        appContainer: document.getElementById('app-container'),
        toolbar: document.getElementById('toolbar'),
        toolbarToggleTab: document.getElementById('toolbar-toggle-tab'),
        mainContent: document.getElementById('main-content'),
        resizer: document.getElementById('resizer'),
        pdfContainer: document.getElementById('pdf-container'),
        canvas: document.getElementById('pdf-canvas'),
        ctx: document.getElementById('pdf-canvas')?.getContext('2d'),
        textLayerDivGlobal: document.getElementById('text-layer'),
        drawingCanvas: document.getElementById('drawing-canvas'),
        drawingCtx: document.getElementById('drawing-canvas')?.getContext('2d'),
        magnifierGlass: document.getElementById('magnifier-glass'),
        magnifierCanvas: document.getElementById('magnifier-canvas'),
        localMagnifierCtx: document.getElementById('magnifier-canvas')?.getContext('2d'),
        
        fileInput: document.getElementById('fileInput'),
        fileInputLabel: document.querySelector('label[for="fileInput"]'),
        clearSessionBtn: document.getElementById('clear-session-btn'),
        restoreSessionBtn: document.getElementById('restore-session-btn'),
        restoreSessionContainer: document.getElementById('restore-session-container'),
        
        goToFirstPageBtn: document.getElementById('go-to-first-page'),
        prevPageBtn: document.getElementById('prev-page'),
        nextPageBtn: document.getElementById('next-page'),
        goToLastPageBtn: document.getElementById('go-to-last-page'),
        pageNumDisplay: document.getElementById('page-num-display'),
        pageToGoInput: document.getElementById('page-to-go'),
        goToPageBtn: document.getElementById('go-to-page-btn'),
        pageSlider: document.getElementById('page-slider'),
        
        searchInputElem: document.getElementById('searchInput'),
        searchActionButton: document.getElementById('search-action-button'),
        resultsDropdown: document.getElementById('resultsDropdown'),
        panelResultsDropdown: document.getElementById('panelResultsDropdown'),
        fileFilterDropdown: document.getElementById('fileFilterDropdown'),
        panelFileFilterDropdown: document.getElementById('panelFileFilterDropdown'),
        searchResultsPanel: document.getElementById('search-results-panel'),
        resultsList: document.getElementById('results-list'),
        
        zoomOutBtn: document.getElementById('zoom-out-btn'),
        zoomInBtn: document.getElementById('zoom-in-btn'),
        zoomLevelDisplay: document.getElementById('zoom-level-display'),
        
        toggleUnderlineBtn: document.getElementById('toggle-underline-btn'),
        toggleHighlighterBtn: document.getElementById('toggle-highlighter-btn'),
        clearHighlighterBtn: document.getElementById('clear-highlighter-btn'),
        toggleTextSelectionBtn: document.getElementById('toggle-text-selection-btn'),
        toggleParagraphSelectionBtn: document.getElementById('toggle-paragraph-selection-btn'),
        copyPageTextBtn: document.getElementById('copy-page-text-btn'),
        exportPageBtn: document.getElementById('export-page-btn'),
        sharePageBtn: document.getElementById('share-page-btn'),
        toggleLocalMagnifierBtn: document.getElementById('toggle-local-magnifier-btn'),
        localMagnifierZoomControlsDiv: document.getElementById('local-magnifier-zoom-controls'),
        localMagnifierZoomSelector: document.getElementById('local-magnifier-zoom-selector'),
        
        recomposePdfBtn: document.getElementById('recompose-pdf-btn'),
        recomposePanel: document.getElementById('recompose-panel'),
        closeRecomposePanelBtn: document.getElementById('close-recompose-panel'),
        recomposePageList: document.getElementById('recompose-page-list'),
        recomposeTocList: document.getElementById('recompose-toc-list'),
        newPdfNameInput: document.getElementById('newPdfName'),
        generateNewPdfBtn: document.getElementById('generate-new-pdf-btn'),
        selectedPagesCountSpan: document.getElementById('selected-pages-count'),
        addTocCheckbox: document.getElementById('add-toc-checkbox'),
        addNewPagenumberCheckbox: document.getElementById('add-new-pagenumber-checkbox'),
    };
}

// 3. 集中管理應用程式的可變狀態
export let appState = {
    pdfDocs: [],
    pdfArrayBuffers: [],
    pageMap: [],
    globalTotalPages: 0,
    currentPage: 1,
    currentScale: 1.0,
    currentZoomMode: 'height',
    
    searchResults: [],
    currentFileFilter: 'all',
    showSearchResultsHighlights: true,
    
    highlighterEnabled: false,
    textSelectionModeActive: false,
    paragraphSelectionModeActive: false,
    localMagnifierEnabled: false,
};

// 4. 提供一個重置狀態的函數
export function resetAppState() {
    appState = {
        pdfDocs: [],
        pdfArrayBuffers: [],
        pageMap: [],
        globalTotalPages: 0,
        currentPage: 1,
        currentScale: 1.0,
        currentZoomMode: 'height',
        searchResults: [],
        currentFileFilter: 'all',
        showSearchResultsHighlights: true,
        highlighterEnabled: false,
        textSelectionModeActive: false,
        paragraphSelectionModeActive: false,
        localMagnifierEnabled: false,
    };
    if (dom.searchInputElem) dom.searchInputElem.value = '';
    Object.keys(localStorage)
        .filter(key => key.startsWith('thumbnail-'))
        .forEach(key => localStorage.removeItem(key));
}
