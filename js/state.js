export let dom = {};

export function initializeDom() {
    dom = {
        toolbar: document.getElementById('toolbar'),
        mainContent: document.getElementById('main-content'),
        resizer: document.getElementById('resizer'),
        pdfEmbed: document.getElementById('pdf-embed'),
        fileInput: document.getElementById('fileInput'),
        clearSessionBtn: document.getElementById('clear-session-btn'),
        restoreSessionBtn: document.getElementById('restore-session-btn'),
        restoreSessionContainer: document.getElementById('restore-session-container'),
        docSelectionDropdown: document.getElementById('docSelectionDropdown'),
        goToFirstPageBtn: document.getElementById('go-to-first-page'),
        prevPageBtn: document.getElementById('prev-page'),
        nextPageBtn: document.getElementById('next-page'),
        goToLastPageBtn: document.getElementById('go-to-last-page'),
        pageNumDisplay: document.getElementById('page-num-display'),
        pageToGoInput: document.getElementById('page-to-go'),
        goToPageBtn: document.getElementById('go-to-page-btn'),
        searchInputElem: document.getElementById('searchInput'),
        searchActionButton: document.getElementById('search-action-button'),
        panelResultsDropdown: document.getElementById('panelResultsDropdown'),
        searchResultsPanel: document.getElementById('search-results-panel'),
        resultsList: document.getElementById('results-list'),
    };
}

export let appState = {
    pdfDocs: [], pdfBlobs: [], currentDocIndex: -1, currentPage: 1, searchResults: [],
};

export function resetAppState() {
    appState.pdfBlobs.forEach(blobInfo => URL.revokeObjectURL(blobInfo.url));
    appState = { pdfDocs: [], pdfBlobs: [], currentDocIndex: -1, currentPage: 1, searchResults: [], };
    if (dom.searchInputElem) dom.searchInputElem.value = '';
}
