// in js/state.js

export let dom = {};

export function initializeDom() {
    dom = {
        appContainer: document.getElementById('app-container'),
        toolbar: document.getElementById('toolbar'),
        mainContent: document.getElementById('main-content'),
        resizer: document.getElementById('resizer'),
        pdfContainer: document.getElementById('pdf-container'),
        canvas: document.getElementById('pdf-canvas'),
        ctx: document.getElementById('pdf-canvas')?.getContext('2d'),
        textLayerDivGlobal: document.getElementById('text-layer'),
        
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
        toggleTextSelectionBtn: document.getElementById('toggle-text-selection-btn'),
        toggleParagraphSelectionBtn: document.getElementById('toggle-paragraph-selection-btn'),
        copyPageTextBtn: document.getElementById('copy-page-text-btn'),
        exportPageBtn: document.getElementById('export-page-btn'),
        sharePageBtn: document.getElementById('share-page-btn'),
        
        recomposePdfBtn: document.getElementById('recompose-pdf-btn'),
        recomposePanel: document.getElementById('recompose-panel'),
        closeRecomposePanelBtn: document.getElementById('close-recompose-panel'),
        recomposePageList: document.getElementById('recompose-page-list'),
        recomposeTocList: document.getElementById('recompose-toc-list'),
        generateNewPdfBtn: document.getElementById('generate-new-pdf-btn'),
        selectedPagesCountSpan: document.getElementById('selected-pages-count'),
        addTocCheckbox: document.getElementById('add-toc-checkbox'),
        addNewPagenumberCheckbox: document.getElementById('add-new-pagenumber-checkbox'),

        // 新增 pdf-view-wrapper
        pdfViewWrapper: document.getElementById('pdf-view-wrapper'),
    };
}

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
    textSelectionModeActive: false,
    paragraphSelectionModeActive: false,
};

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
        textSelectionModeActive: false,
        paragraphSelectionModeActive: false,
    };
    if (dom.searchInputElem) dom.searchInputElem.value = '';
}
