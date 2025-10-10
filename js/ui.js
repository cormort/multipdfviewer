import { dom, appState } from './state.js';
import { goToPage, renderPage } from './viewer.js';
import { searchKeyword } from './search.js';
import { getPatternFromSearchInput } from './utils.js';
import { toggleTextSelection, toggleParagraphSelection, handleParagraphSelection } from './annotation.js';
import { showRecomposePanel, hideRecomposePanel, triggerGeneratePdf } from './recompose.js';

export function initEventHandlers() {
    dom.searchActionButton.addEventListener('click', searchKeyword);
    dom.searchInputElem.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchKeyword(); } });
    
    const onResultChange = () => {
        const pageNum = parseInt(dom.resultsDropdown.value);
        if (!isNaN(pageNum)) goToPage(pageNum);
    };
    dom.resultsDropdown.addEventListener('change', onResultChange);
    dom.panelResultsDropdown.addEventListener('change', () => {
        dom.resultsDropdown.value = dom.panelResultsDropdown.value;
        onResultChange();
    });

    const onFilterChange = (e) => updateFilterAndResultsUI(e.target.value);
    dom.fileFilterDropdown.addEventListener('change', onFilterChange);
    dom.panelFileFilterDropdown.addEventListener('change', (e) => {
        dom.fileFilterDropdown.value = e.target.value;
        onFilterChange(e);
    });

    dom.goToFirstPageBtn.addEventListener('click', () => goToPage(1));
    dom.prevPageBtn.addEventListener('click', () => { if (appState.currentPage > 1) goToPage(appState.currentPage - 1); });
    dom.nextPageBtn.addEventListener('click', () => { if (appState.currentPage < appState.globalTotalPages) goToPage(appState.currentPage + 1); });
    dom.goToLastPageBtn.addEventListener('click', () => goToPage(appState.globalTotalPages));
    
    const goToInputPage = () => {
        const pageNum = parseInt(dom.pageToGoInput.value);
        if (!isNaN(pageNum)) goToPage(pageNum);
    };
    dom.goToPageBtn.addEventListener('click', goToInputPage);
    dom.pageToGoInput.addEventListener('keypress', e => { if (e.key === 'Enter') { e.preventDefault(); goToInputPage(); } });
    
    dom.pageSlider.addEventListener('input', () => {
        if (dom.pageToGoInput) dom.pageToGoInput.value = dom.pageSlider.value;
    });
    dom.pageSlider.addEventListener('change', () => goToPage(parseInt(dom.pageSlider.value)));

    const applyZoom = (mode, scaleChange = 0) => {
        appState.currentZoomMode = mode;
        if (scaleChange !== 0) appState.currentScale = Math.max(0.1, appState.currentScale + scaleChange);
        renderPage(appState.currentPage);
    };
    dom.zoomOutBtn.addEventListener('click', () => applyZoom('custom', -0.2));
    dom.zoomInBtn.addEventListener('click', () => applyZoom('custom', 0.2));
    document.querySelectorAll('.fit-width-btn').forEach(btn => btn.addEventListener('click', () => applyZoom('width')));
    document.querySelectorAll('.fit-height-btn').forEach(btn => btn.addEventListener('click', () => applyZoom('height')));

    dom.toggleUnderlineBtn.addEventListener('click', () => {
        appState.showSearchResultsHighlights = !appState.showSearchResultsHighlights;
        renderPage(appState.currentPage);
    });
    dom.toggleTextSelectionBtn.addEventListener('click', toggleTextSelection);
    dom.toggleParagraphSelectionBtn.addEventListener('click', toggleParagraphSelection);
    dom.textLayerDivGlobal.addEventListener('click', handleParagraphSelection);

    dom.recomposePdfBtn.addEventListener('click', showRecomposePanel);
    dom.closeRecomposePanelBtn.addEventListener('click', hideRecomposePanel);
    dom.generateNewPdfBtn.addEventListener('click', () => {
        const newName = prompt("請輸入新 PDF 的檔案名稱：", "重新組成文件");
        if (newName) triggerGeneratePdf(newName.trim() || "重新組成文件");
    });

    window.addEventListener('resize', () => {
        if (appState.pdfDocs.length > 0) renderPage(appState.currentPage);
    });
}

export function initResizer() {
    const resizer = dom.resizer;
    const toolbar = dom.toolbar;
    if (!resizer || !toolbar) return;

    let isResizing = false;
    resizer.addEventListener('mousedown', () => {
        isResizing = true;
        document.body.style.userSelect = 'none';
        document.body.style.pointerEvents = 'none';
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', stopResizing);
    });

    function handleMouseMove(e) {
        if (!isResizing) return;
        let newWidth = e.clientX;
        if (newWidth < 200) newWidth = 200;
        if (newWidth > 600) newWidth = 600;
        toolbar.style.width = `${newWidth}px`;
    }

    function stopResizing() {
        isResizing = false;
        document.body.style.userSelect = 'auto';
        document.body.style.pointerEvents = 'auto';
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', stopResizing);
        if (appState.pdfDocs.length > 0) renderPage(appState.currentPage);
    }
}

export function showLoading(isLoading) {
    document.body.style.cursor = isLoading ? 'wait' : 'default';
}

export function updateUIForNewState() {
    const hasDocs = appState.pdfDocs.length > 0;
    dom.fileInputLabel.style.display = hasDocs ? 'none' : 'block';
    dom.clearSessionBtn.style.display = hasDocs ? 'block' : 'none';
    if (!hasDocs) {
        if (dom.ctx) dom.ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
        if (dom.textLayerDivGlobal) dom.textLayerDivGlobal.innerHTML = '';
        if (dom.resultsList) dom.resultsList.innerHTML = '<p style="padding: 10px; text-align: center; color: #666;">無搜尋結果</p>';
    }
    updatePageControls();
    updateResultsNav();
}

export function updatePageControls() {
    const hasDocs = appState.pdfDocs.length > 0;
    const allControls = document.querySelectorAll('.btn, .nav-btn, .toolbar-btn, #page-to-go, #page-slider, #searchInput, .form-control');
    allControls.forEach(el => { el.disabled = !hasDocs; });
    if(dom.fileInput) dom.fileInput.disabled = false;

    if (!hasDocs) {
        dom.pageNumDisplay.textContent = '- / -';
        if (dom.pageToGoInput) { dom.pageToGoInput.value = ''; dom.pageToGoInput.max = 1; }
        if (dom.pageSlider) { dom.pageSlider.max = 1; dom.pageSlider.value = 1; }
        return;
    }

    dom.pageNumDisplay.textContent = `第 ${appState.currentPage} 頁 / 共 ${appState.globalTotalPages} 頁`;
    if (dom.pageToGoInput) dom.pageToGoInput.value = appState.currentPage;
    if (dom.pageSlider) dom.pageSlider.max = appState.globalTotalPages;
    if (dom.pageSlider.value !== appState.currentPage) dom.pageSlider.value = appState.currentPage;
    
    dom.goToFirstPageBtn.disabled = (appState.currentPage === 1);
    dom.prevPageBtn.disabled = (appState.currentPage === 1);
    dom.nextPageBtn.disabled = (appState.currentPage === appState.globalTotalPages);
    dom.goToLastPageBtn.disabled = (appState.currentPage === appState.globalTotalPages);

    dom.toggleUnderlineBtn.classList.toggle('active', appState.showSearchResultsHighlights);
    dom.toggleTextSelectionBtn.classList.toggle('active', appState.textSelectionModeActive);
    dom.toggleParagraphSelectionBtn.classList.toggle('active', appState.paragraphSelectionModeActive);
    
    updateZoomControls();
}

function updateZoomControls() {
    if (!dom.zoomLevelDisplay) return;
    dom.zoomLevelDisplay.textContent = `${Math.round(appState.currentScale * 100)}%`;
    document.querySelectorAll('.fit-width-btn').forEach(btn => btn.classList.toggle('active', appState.currentZoomMode === 'width'));
    document.querySelectorAll('.fit-height-btn').forEach(btn => btn.classList.toggle('active', appState.currentZoomMode === 'height'));
}

export function updateResultsNav() {
    const hasResults = appState.searchResults.length > 0;
    if(dom.searchResultsPanel) dom.searchResultsPanel.style.display = hasResults ? 'block' : 'none';
}

export function updateFilterAndResultsUI(selectedFile = 'all') { /* ... */ }
