import { dom, appState, resetAppState } from './state.js';
import { handleFileSelect } from './app.js';
import { goToPage, renderPage, toggleLocalMagnifier, updateMagnifierZoomLevel } from './viewer.js';
import { searchKeyword, rerenderAllThumbnails } from './search.js';
import { showFeedback, getPatternFromSearchInput } from './utils.js';
import { toggleHighlighter, toggleTextSelection, toggleParagraphSelection, startDrawing, draw, stopDrawing, handleParagraphSelection } from './annotation.js';
import { showRecomposePanel, hideRecomposePanel, generateNewPdf } from './recompose.js';

export function initEventHandlers() {
    // File and Session
    dom.fileInput.addEventListener('change', handleFileSelect);
    dom.clearSessionBtn.addEventListener('click', () => {
        resetAppState();
        updateUIForNewState();
    });

    // Toolbar Toggle
    dom.toolbarToggleTab.addEventListener('click', () => dom.appContainer.classList.toggle('menu-active'));

    // Search
    dom.searchActionButton.addEventListener('click', searchKeyword);
    dom.searchInputElem.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchKeyword(); } });
    
    const onResultChange = () => goToPage(parseInt(dom.resultsDropdown.value), getPatternFromSearchInput(dom.searchInputElem));
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

    // Page Navigation
    dom.goToFirstPageBtn.addEventListener('click', () => goToPage(1, getPatternFromSearchInput(dom.searchInputElem)));
    dom.prevPageBtn.addEventListener('click', () => { if (appState.currentPage > 1) goToPage(appState.currentPage - 1, getPatternFromSearchInput(dom.searchInputElem)); });
    dom.nextPageBtn.addEventListener('click', () => { if (appState.currentPage < appState.globalTotalPages) goToPage(appState.currentPage + 1, getPatternFromSearchInput(dom.searchInputElem)); });
    dom.goToLastPageBtn.addEventListener('click', () => goToPage(appState.globalTotalPages, getPatternFromSearchInput(dom.searchInputElem)));
    dom.goToPageBtn.addEventListener('click', () => goToPage(parseInt(dom.pageToGoInput.value), getPatternFromSearchInput(dom.searchInputElem)));
    dom.pageToGoInput.addEventListener('keypress', e => { if (e.key === 'Enter') { e.preventDefault(); dom.goToPageBtn.click(); } });
    dom.pageSlider.addEventListener('input', () => {
        const newPage = parseInt(dom.pageSlider.value);
        if (dom.pageToGoInput) dom.pageToGoInput.value = newPage;
        goToPage(newPage, getPatternFromSearchInput(dom.searchInputElem));
    });

    // Zoom
    dom.zoomOutBtn.addEventListener('click', () => { appState.currentZoomMode = 'custom'; appState.currentScale = Math.max(0.1, appState.currentScale - 0.2); renderPage(appState.currentPage, getPatternFromSearchInput(dom.searchInputElem)); });
    dom.zoomInBtn.addEventListener('click', () => { appState.currentZoomMode = 'custom'; appState.currentScale += 0.2; renderPage(appState.currentPage, getPatternFromSearchInput(dom.searchInputElem)); });
    document.querySelectorAll('.fit-width-btn').forEach(btn => btn.addEventListener('click', () => { appState.currentZoomMode = 'width'; renderPage(appState.currentPage, getPatternFromSearchInput(dom.searchInputElem)); }));
    document.querySelectorAll('.fit-height-btn').forEach(btn => btn.addEventListener('click', () => { appState.currentZoomMode = 'height'; renderPage(appState.currentPage, getPatternFromSearchInput(dom.searchInputElem)); }));

    // Tools
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

    // Drawing Listeners
    dom.drawingCanvas.addEventListener('mousedown', startDrawing);
    dom.drawingCanvas.addEventListener('mousemove', draw);
    dom.drawingCanvas.addEventListener('mouseup', stopDrawing);
    dom.drawingCanvas.addEventListener('mouseout', stopDrawing);
    dom.drawingCanvas.addEventListener('touchstart', startDrawing, { passive: false });
    dom.drawingCanvas.addEventListener('touchmove', draw, { passive: false });
    dom.drawingCanvas.addEventListener('touchend', stopDrawing);
    dom.drawingCanvas.addEventListener('touchcancel', stopDrawing);

    // Paragraph Selection Listener
    dom.textLayerDivGlobal.addEventListener('click', handleParagraphSelection);

    // Recompose PDF
    dom.recomposePdfBtn.addEventListener('click', showRecomposePanel);
    dom.closeRecomposePanelBtn.addEventListener('click', hideRecomposePanel);
    dom.generateNewPdfBtn.addEventListener('click', generateNewPdf);

    // Window Resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (appState.pdfDocs.length > 0) renderPage(appState.currentPage, getPatternFromSearchInput(dom.searchInputElem));
        }, 250);
    });
}

export function updateUIForNewState() {
    const hasDocs = appState.pdfDocs.length > 0;
    dom.fileInput.style.display = hasDocs ? 'none' : 'block';
    dom.fileInputLabel.style.display = hasDocs ? 'none' : 'block';
    dom.clearSessionBtn.style.display = hasDocs ? 'block' : 'none';

    if (!hasDocs) {
        if (dom.ctx) dom.ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
        if (dom.textLayerDivGlobal) dom.textLayerDivGlobal.innerHTML = '';
        if (dom.resultsList) dom.resultsList.innerHTML = '<p style="padding: 10px; text-align: center; color: #666;">無搜尋結果</p>';
        updateFilterAndResultsUI(); // This will clear dropdowns
    }

    updatePageControls();
    updateResultsNav();
}


export function updatePageControls() {
    const hasDocs = appState.pdfDocs.length > 0;

    const allControls = [
        dom.goToFirstPageBtn, dom.prevPageBtn, dom.nextPageBtn, dom.goToLastPageBtn,
        dom.pageToGoInput, dom.goToPageBtn, dom.pageSlider, dom.toggleUnderlineBtn,
        dom.toggleHighlighterBtn, dom.clearHighlighterBtn, dom.toggleTextSelectionBtn,
        dom.toggleParagraphSelectionBtn, dom.copyPageTextBtn, dom.toggleLocalMagnifierBtn,
        dom.localMagnifierZoomSelector, dom.exportPageBtn, dom.sharePageBtn, dom.recomposePdfBtn,
        dom.zoomInBtn, dom.zoomOutBtn, ...document.querySelectorAll('.fit-width-btn'),
        ...document.querySelectorAll('.fit-height-btn')
    ];
    allControls.forEach(el => { if (el) el.disabled = !hasDocs; });

    if (!hasDocs) {
        dom.pageNumDisplay.textContent = '- / -';
        if (dom.pageToGoInput) { dom.pageToGoInput.value = ''; dom.pageToGoInput.max = 1; }
        if (dom.pageSlider) { dom.pageSlider.max = 1; dom.pageSlider.value = 1; }
        if (dom.localMagnifierZoomControlsDiv) dom.localMagnifierZoomControlsDiv.style.display = 'none';
        return;
    }

    dom.pageNumDisplay.textContent = `第 ${appState.currentPage} 頁 / 共 ${appState.globalTotalPages} 頁`;
    
    if (dom.pageToGoInput) { dom.pageToGoInput.value = appState.currentPage; dom.pageToGoInput.max = appState.globalTotalPages; }
    if (dom.pageSlider) { dom.pageSlider.max = appState.globalTotalPages; dom.pageSlider.value = appState.currentPage; dom.pageSlider.disabled = (appState.globalTotalPages === 1); }
    
    dom.goToFirstPageBtn.disabled = (appState.currentPage === 1);
    dom.prevPageBtn.disabled = (appState.currentPage === 1);
    dom.nextPageBtn.disabled = (appState.currentPage === appState.globalTotalPages);
    dom.goToLastPageBtn.disabled = (appState.currentPage === appState.globalTotalPages);

    // Update tool button states
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
    document.body.classList.toggle('results-bar-visible', hasResults);
    if (dom.appContainer) dom.appContainer.classList.toggle('results-panel-visible', hasResults);
}


export function updateFilterAndResultsUI(selectedFile = null) {
    if (selectedFile !== null) {
        appState.currentFileFilter = selectedFile;
    }

    const docNames = [...new Set(appState.searchResults.map(r => r.docName))];
    const fileDropdowns = [dom.fileFilterDropdown, dom.panelFileFilterDropdown];

    fileDropdowns.forEach(dropdown => {
        if (!dropdown) return;
        dropdown.innerHTML = '<option value="all">所有檔案</option>';
        docNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            dropdown.appendChild(option);
        });
        dropdown.value = appState.currentFileFilter;
    });

    const filteredResults = appState.currentFileFilter === 'all'
        ? appState.searchResults
        : appState.searchResults.filter(r => r.docName === appState.currentFileFilter);

    const summaryDropdowns = [dom.resultsDropdown, dom.panelResultsDropdown];
    summaryDropdowns.forEach(dropdown => {
        if (!dropdown) return;
        dropdown.innerHTML = '';
        if (filteredResults.length === 0) {
            dropdown.innerHTML = appState.searchResults.length === 0 ? '<option value="">無搜尋結果</option>' : '<option value="">此檔案無結果</option>';
        } else {
            filteredResults.forEach(result => {
                const option = document.createElement('option');
                option.value = result.page;
                option.innerHTML = `第 ${result.page} 頁: ${result.summary}`;
                dropdown.appendChild(option);
            });
        }
    });
    
    if (dom.resultsList) {
        dom.resultsList.innerHTML = '';
        if (filteredResults.length === 0) {
             dom.resultsList.innerHTML = `<p style="padding: 10px; color: #666;">${appState.searchResults.length === 0 ? '無搜尋結果' : '在此檔案中找不到結果。'}</p>`;
        } else {
            rerenderAllThumbnails(); // This will re-observe
        }
    }
}
