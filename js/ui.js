// 從本地模組導入
import { dom, appState } from './state.js';
import { goToPage, renderPage, toggleLocalMagnifier, updateMagnifierZoomLevel, updateLocalMagnifier } from './viewer.js';
import { searchKeyword, rerenderAllThumbnails } from './search.js';
import { showFeedback, getPatternFromSearchInput } from './utils.js';
import { toggleHighlighter, toggleTextSelection, toggleParagraphSelection, startDrawing, draw, stopDrawing, handleParagraphSelection } from './annotation.js';
import { showRecomposePanel, hideRecomposePanel, triggerGeneratePdf } from './recompose.js';

/**
 * 初始化所有 UI 相關的事件監聽器。
 */
export function initEventHandlers() {
    // --- Search ---
    dom.searchActionButton.addEventListener('click', searchKeyword);
    dom.searchInputElem.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchKeyword(); } });
    
    const onResultChange = () => {
        const pageNum = parseInt(dom.resultsDropdown.value);
        if (!isNaN(pageNum)) goToPage(pageNum, getPatternFromSearchInput(dom.searchInputElem));
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

    // --- Page Navigation ---
    dom.goToFirstPageBtn.addEventListener('click', () => goToPage(1, getPatternFromSearchInput(dom.searchInputElem)));
    dom.prevPageBtn.addEventListener('click', () => { if (appState.currentPage > 1) goToPage(appState.currentPage - 1, getPatternFromSearchInput(dom.searchInputElem)); });
    dom.nextPageBtn.addEventListener('click', () => { if (appState.currentPage < appState.globalTotalPages) goToPage(appState.currentPage + 1, getPatternFromSearchInput(dom.searchInputElem)); });
    dom.goToLastPageBtn.addEventListener('click', () => goToPage(appState.globalTotalPages, getPatternFromSearchInput(dom.searchInputElem)));
    
    const goToInputPage = () => {
        const pageNum = parseInt(dom.pageToGoInput.value);
        if (!isNaN(pageNum)) goToPage(pageNum, getPatternFromSearchInput(dom.searchInputElem));
    };
    dom.goToPageBtn.addEventListener('click', goToInputPage);
    dom.pageToGoInput.addEventListener('keypress', e => { if (e.key === 'Enter') { e.preventDefault(); goToInputPage(); } });
    
    dom.pageSlider.addEventListener('input', () => {
        const newPage = parseInt(dom.pageSlider.value);
        if (dom.pageToGoInput) dom.pageToGoInput.value = newPage;
        goToPage(newPage, getPatternFromSearchInput(dom.searchInputElem));
    });

    // --- Zoom ---
    const applyZoom = (mode, scaleChange = 0) => {
        appState.currentZoomMode = mode;
        if (scaleChange !== 0) appState.currentScale = Math.max(0.1, appState.currentScale + scaleChange);
        renderPage(appState.currentPage, getPatternFromSearchInput(dom.searchInputElem));
    };
    dom.zoomOutBtn.addEventListener('click', () => applyZoom('custom', -0.2));
    dom.zoomInBtn.addEventListener('click', () => applyZoom('custom', 0.2));
    document.querySelectorAll('.fit-width-btn').forEach(btn => btn.addEventListener('click', () => applyZoom('width')));
    document.querySelectorAll('.fit-height-btn').forEach(btn => btn.addEventListener('click', () => applyZoom('height')));

    // --- Tools ---
    dom.toggleUnderlineBtn.addEventListener('click', () => {
        appState.showSearchResultsHighlights = !appState.showSearchResultsHighlights;
        renderPage(appState.currentPage, getPatternFromSearchInput(dom.searchInputElem));
    });
    dom.toggleHighlighterBtn.addEventListener('click', toggleHighlighter);
    dom.clearHighlighterBtn.addEventListener('click', () => dom.drawingCtx.clearRect(0, 0, dom.drawingCanvas.width, dom.drawingCanvas.height));
    dom.toggleTextSelectionBtn.addEventListener('click', toggleTextSelection);
    dom.toggleParagraphSelectionBtn.addEventListener('click', toggleParagraphSelection);
    dom.toggleLocalMagnifierBtn.addEventListener('click', toggleLocalMagnifier);
    dom.localMagnifierZoomSelector.addEventListener('change', (e) => updateMagnifierZoomLevel(e.target.value));

    // --- Drawing & Annotation Listeners ---
    dom.drawingCanvas.addEventListener('mousedown', startDrawing);
    dom.drawingCanvas.addEventListener('mousemove', draw);
    dom.drawingCanvas.addEventListener('mouseup', stopDrawing);
    dom.drawingCanvas.addEventListener('mouseout', stopDrawing);
    dom.textLayerDivGlobal.addEventListener('click', handleParagraphSelection);

    // --- Recompose PDF ---
    dom.recomposePdfBtn.addEventListener('click', showRecomposePanel);
    dom.closeRecomposePanelBtn.addEventListener('click', hideRecomposePanel);
    dom.generateNewPdfBtn.addEventListener('click', () => {
        const defaultName = "重新組成文件";
        const newName = prompt("請輸入新 PDF 的檔案名稱：", defaultName);
        if (newName) triggerGeneratePdf(newName.trim() || defaultName);
    });

    // --- Window Resize ---
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (appState.pdfDocs.length > 0) renderPage(appState.currentPage, getPatternFromSearchInput(dom.searchInputElem));
        }, 250);
    });
}

/**
 * 初始化可拖曳的分隔線功能。
 */
export function initResizer() {
    const resizer = dom.resizer;
    const toolbar = dom.toolbar;
    if (!resizer || !toolbar) return;

    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.userSelect = 'none';
        document.body.style.pointerEvents = 'none';
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', stopResizing);
    });

    function handleMouseMove(e) {
        if (!isResizing) return;
        let newWidth = e.clientX;
        if (newWidth < 200) newWidth = 200; // 最小寬度
        if (newWidth > 600) newWidth = 600; // 最大寬度
        toolbar.style.setProperty('--toolbar-width', `${newWidth}px`);
        toolbar.style.width = `${newWidth}px`;
    }

    function stopResizing() {
        isResizing = false;
        document.body.style.userSelect = 'auto';
        document.body.style.pointerEvents = 'auto';
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', stopResizing);
    }
}


// --- 其他 UI 更新函式 ---

export function showLoading(isLoading) {
    // 可以在此處新增一個全螢幕的載入中畫面
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
    const allControls = document.querySelectorAll('.btn, .nav-btn, .toolbar-btn, #page-to-go, #page-slider');
    allControls.forEach(el => { el.disabled = !hasDocs; });

    if (!hasDocs) {
        dom.pageNumDisplay.textContent = '- / -';
        if (dom.pageToGoInput) { dom.pageToGoInput.value = ''; dom.pageToGoInput.max = 1; }
        if (dom.pageSlider) { dom.pageSlider.max = 1; dom.pageSlider.value = 1; }
        return;
    }

    dom.pageNumDisplay.textContent = `第 ${appState.currentPage} 頁 / 共 ${appState.globalTotalPages} 頁`;
    if (dom.pageToGoInput) { dom.pageToGoInput.value = appState.currentPage; dom.pageToGoInput.max = appState.globalTotalPages; }
    if (dom.pageSlider) { dom.pageSlider.max = appState.globalTotalPages; dom.pageSlider.value = appState.currentPage; }
    
    dom.goToFirstPageBtn.disabled = (appState.currentPage === 1);
    dom.prevPageBtn.disabled = (appState.currentPage === 1);
    dom.nextPageBtn.disabled = (appState.currentPage === appState.globalTotalPages);
    dom.goToLastPageBtn.disabled = (appState.currentPage === appState.globalTotalPages);

    dom.toggleUnderlineBtn.classList.toggle('active', appState.showSearchResultsHighlights);
    dom.toggleHighlighterBtn.classList.toggle('active', appState.highlighterEnabled);
    dom.toggleTextSelectionBtn.classList.toggle('active', appState.textSelectionModeActive);
    dom.toggleParagraphSelectionBtn.classList.toggle('active', appState.paragraphSelectionModeActive);
    dom.toggleLocalMagnifierBtn.classList.toggle('active', appState.localMagnifierEnabled);
    if (dom.localMagnifierZoomControlsDiv) dom.localMagnifierZoomControlsDiv.style.display = (hasDocs && appState.localMagnifierEnabled) ? 'flex' : 'none';
    
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
    if (dom.appContainer) dom.appContainer.classList.toggle('results-panel-visible', hasResults);
}

export function updateFilterAndResultsUI(selectedFile = 'all') {
    // 保持此函式不變
}
