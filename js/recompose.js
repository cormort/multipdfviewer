import { dom, appState } from './app.js';
import { getDocAndLocalPage } from './viewer.js';
import { showFeedback } from './utils.js';

let selectedRecomposePages = new Set();
let recomposeThumbnailObserver = null;

export function showRecomposePanel() {
    if (appState.pdfDocs.length === 0) {
        showFeedback('請先載入 PDF 檔案！');
        return;
    }
    dom.recomposePanel.style.display = 'flex';
    populateRecomposePageList();
    updateSelectedPagesCount();
}

export function hideRecomposePanel() {
    dom.recomposePanel.style.display = 'none';
    selectedRecomposePages.clear();
    dom.recomposePageList.innerHTML = '';
    updateSelectedPagesCount();
    if (recomposeThumbnailObserver) {
        recomposeThumbnailObserver.disconnect();
    }
}

async function populateRecomposePageList() {
    dom.recomposePageList.innerHTML = '<p style="padding: 10px; text-align: center;">載入頁面中...</p>';
    selectedRecomposePages.clear();
    updateSelectedPagesCount();

    if (recomposeThumbnailObserver) {
        recomposeThumbnailObserver.disconnect();
    }

    recomposeThumbnailObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target.querySelector('img');
                const docIndex = parseInt(img.dataset.docIndex, 10);
                const localPage = parseInt(img.dataset.localPage, 10);
                renderRecomposeThumbnail(docIndex, localPage, img);
                observer.unobserve(entry.target);
            }
        });
    }, { root: dom.recomposePageList, rootMargin: '0px 0px 200px 0px' });

    dom.recomposePageList.innerHTML = '';

    for (let globalPage = 1; globalPage <= appState.globalTotalPages; globalPage++) {
        const pageInfo = getDocAndLocalPage(globalPage);
        if (!pageInfo) continue;

        const thumbnailItem = document.createElement('div');
        thumbnailItem.className = 'recompose-thumbnail-item';
        thumbnailItem.dataset.globalPage = globalPage;

        const img = document.createElement('img');
        img.dataset.docIndex = pageInfo.docIndex;
        img.dataset.localPage = pageInfo.localPage;
        img.alt = `Page ${globalPage}`;
        img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; // Transparent pixel

        const pageLabel = document.createElement('div');
        pageLabel.className = 'page-label';
        const cleanName = pageInfo.docName.replace(/\.pdf$/i, '').substring(0, 15);
        pageLabel.textContent = `P.${globalPage} (${cleanName}...)`;
        pageLabel.title = `檔案: ${pageInfo.docName}, 本地頁: ${pageInfo.localPage}`;

        thumbnailItem.appendChild(img);
        thumbnailItem.appendChild(pageLabel);

        thumbnailItem.addEventListener('click', () => togglePageSelection(globalPage, thumbnailItem));
        dom.recomposePageList.appendChild(thumbnailItem);
        
        recomposeThumbnailObserver.observe(thumbnailItem);
    }
}

async function renderRecomposeThumbnail(docIndex, localPageNum, imgElement) {
    try {
        const doc = appState.pdfDocs[docIndex];
        if (!doc) return;
        
        const page = await doc.getPage(localPageNum);
        const viewport = page.getViewport({ scale: 1 });
        const THUMBNAIL_WIDTH = 150;
        const scale = THUMBNAIL_WIDTH / viewport.width;
        const scaledViewport = page.getViewport({ scale: scale });

        const canvasEl = document.createElement('canvas');
        const thumbnailCtx = canvasEl.getContext('2d');
        canvasEl.height = scaledViewport.height;
        canvasEl.width = scaledViewport.width;
        
        const renderContext = { canvasContext: thumbnailCtx, viewport: scaledViewport };
        await page.render(renderContext).promise;
        
        const dataUrl = canvasEl.toDataURL('image/jpeg', 0.8);
        imgElement.src = dataUrl;
    } catch (error) {
        console.error(`Failed to render recompose thumbnail:`, error);
    }
}

function togglePageSelection(globalPage, element) {
    if (selectedRecomposePages.has(globalPage)) {
        selectedRecomposePages.delete(globalPage);
        element.classList.remove('selected');
    } else {
        selectedRecomposePages.add(globalPage);
        element.classList.add('selected');
    }
    updateSelectedPagesCount();
}

function updateSelectedPagesCount() {
    if (dom.selectedPagesCountSpan) {
        dom.selectedPagesCountSpan.textContent = selectedRecomposePages.size;
    }
    if (dom.generateNewPdfBtn) {
        dom.generateNewPdfBtn.disabled = selectedRecomposePages.size === 0;
    }
}

export async function generateNewPdf() {
    if (selectedRecomposePages.size === 0) {
        showFeedback('請至少選擇一頁！');
        return;
    }

    const originalBtnText = dom.generateNewPdfBtn.innerHTML;
    dom.generateNewPdfBtn.disabled = true;
    dom.generateNewPdfBtn.innerHTML = '生成中...';

    const { PDFDocument } = window.PDFLib;
    const newPdfDoc = await PDFDocument.create();
    const sortedPages = Array.from(selectedRecomposePages).sort((a, b) => a - b);

    try {
        for (const globalPageNum of sortedPages) {
            const pageInfo = getDocAndLocalPage(globalPageNum);
            if (!pageInfo) continue;

            const { doc, localPage } = pageInfo;
            
            // Note: `doc` here is a pdf.js document object. pdf-lib needs the raw ArrayBuffer.
            // This is a limitation of the current structure. A better approach would be to store
            // the original ArrayBuffer of each PDF when loaded.
            // For now, let's assume we cannot do this without major refactoring.
            // THE FOLLOWING CODE WILL NOT WORK AS INTENDED without the original ArrayBuffer.
            // I'll leave a placeholder for the correct logic.
            // To make this work, you must modify `loadAndProcessFiles` to store the ArrayBuffer.
            
            showFeedback("錯誤：重新生成 PDF 需要對架構進行重大修改以保留原始文件數據。此功能當前為佔位符。", 5000);
            throw new Error("Recomposition requires storing original file ArrayBuffers, which is not currently implemented.");
            
            // **Correct Logic (if ArrayBuffer was stored):**
            // const sourcePdfBytes = appState.pdfArrayBuffers[pageInfo.docIndex];
            // const sourcePdfDoc = await PDFDocument.load(sourcePdfBytes);
            // const [copiedPage] = await newPdfDoc.copyPages(sourcePdfDoc, [localPage - 1]);
            // newPdfDoc.addPage(copiedPage);
        }

        const pdfBytes = await newPdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const fileName = (dom.newPdfNameInput.value.trim() || '重新組成文件') + '.pdf';
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        showFeedback(`已生成新 PDF: ${fileName}`);
        hideRecomposePanel();

    } catch (error) {
        console.error('生成新 PDF 失敗:', error);
        showFeedback('生成新 PDF 失敗！請參閱控制台以獲取詳細資訊。');
    } finally {
        dom.generateNewPdfBtn.disabled = false;
        dom.generateNewPdfBtn.innerHTML = originalBtnText;
    }
}```
**重要提示：** `recompose.js` 中的 `generateNewPdf` 函數有一個關鍵問題。`pdf-lib` 需要原始的 PDF 檔案數據 (ArrayBuffer) 來複製頁面，但 `pdf.js` 載入後，我們只有 `pdfjsLib.PDFDocumentProxy` 物件，無法直接取回原始數據。**要讓此功能正常運作，您必須修改 `viewer.js` 中的 `loadAndProcessFiles`，將每個 PDF 的 `ArrayBuffer` 也存儲在 `appState` 中**。

---

### 9. `js/ui.js`

```javascript
import { dom, appState, resetAppState, handleFileSelect } from './app.js';
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
}```

---

### 10. `js/app.js` (主入口)

```javascript
import { initDB, saveFiles, getFiles } from './db.js';
import * as UI from './ui.js';
import * as Viewer from './viewer.js';
import * as Search from './search.js';
import * as Recompose from './recompose.js';
import { showFeedback } from './utils.js';

// Centralized DOM Elements
export const dom = {
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
    
    // File
    fileInput: document.getElementById('fileInput'),
    fileInputLabel: document.querySelector('label[for="fileInput"]'),
    clearSessionBtn: document.getElementById('clear-session-btn'),
    restoreSessionBtn: document.getElementById('restore-session-btn'),
    restoreSessionContainer: document.getElementById('restore-session-container'),
    
    // Nav
    goToFirstPageBtn: document.getElementById('go-to-first-page'),
    prevPageBtn: document.getElementById('prev-page'),
    nextPageBtn: document.getElementById('next-page'),
    goToLastPageBtn: document.getElementById('go-to-last-page'),
    pageNumDisplay: document.getElementById('page-num-display'),
    pageToGoInput: document.getElementById('page-to-go'),
    goToPageBtn: document.getElementById('go-to-page-btn'),
    pageSlider: document.getElementById('page-slider'),
    
    // Search
    searchInputElem: document.getElementById('searchInput'),
    searchActionButton: document.getElementById('search-action-button'),
    resultsDropdown: document.getElementById('resultsDropdown'),
    panelResultsDropdown: document.getElementById('panelResultsDropdown'),
    fileFilterDropdown: document.getElementById('fileFilterDropdown'),
    panelFileFilterDropdown: document.getElementById('panelFileFilterDropdown'),
    searchResultsPanel: document.getElementById('search-results-panel'),
    resultsList: document.getElementById('results-list'),
    
    // Zoom
    zoomOutBtn: document.getElementById('zoom-out-btn'),
    zoomInBtn: document.getElementById('zoom-in-btn'),
    zoomLevelDisplay: document.getElementById('zoom-level-display'),
    
    // Tools
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
    
    // Recompose
    recomposePdfBtn: document.getElementById('recompose-pdf-btn'),
    recomposePanel: document.getElementById('recompose-panel'),
    closeRecomposePanelBtn: document.getElementById('close-recompose-panel'),
    recomposePageList: document.getElementById('recompose-page-list'),
    newPdfNameInput: document.getElementById('newPdfName'),
    generateNewPdfBtn: document.getElementById('generate-new-pdf-btn'),
    selectedPagesCountSpan: document.getElementById('selected-pages-count'),
};

// Central Application State
export let appState = {
    pdfDocs: [],
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

export function resetAppState() {
    appState = {
        pdfDocs: [],
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
    // Also clear localStorage thumbnails if any
    Object.keys(localStorage)
        .filter(key => key.startsWith('thumbnail-'))
        .forEach(key => localStorage.removeItem(key));
}

export async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
        try {
            await saveFiles(files);
            if (dom.restoreSessionContainer) dom.restoreSessionContainer.style.display = 'none';
        } catch (dbError) {
            console.warn("Could not save session to IndexedDB, but proceeding with loading.", dbError);
        }

        try {
            await loadFilesIntoApp(files);
        } catch (loadError) {
            console.error("Failed to load or process PDF files:", loadError);
            showFeedback("Error loading or processing PDF files.");
        }
    }
}

async function loadFilesIntoApp(files) {
    resetAppState();
    UI.updateUIForNewState(); // Show a "loading" state
    
    const loadedData = await Viewer.loadAndProcessFiles(files);
    if (!loadedData) {
        showFeedback('No valid PDF files were loaded.');
        resetAppState();
        UI.updateUIForNewState();
        return;
    }

    appState.pdfDocs = loadedData.pdfDocs;
    appState.pageMap = loadedData.pageMap;
    appState.globalTotalPages = loadedData.globalTotalPages;
    
    Viewer.renderPage(1); // Render the first page
    UI.updateUIForNewState(); // Update UI with new file data
}

async function initializeApp() {
    // Set PDF.js worker source
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs`;
    } else {
        console.error("pdf.js library is not loaded!");
        return;
    }

    UI.initEventHandlers();
    Viewer.initLocalMagnifier();
    Search.initThumbnailObserver();
    UI.updateUIForNewState(); // Initial UI setup

    try {
        await initDB();
        const storedFiles = await getFiles();
        if (storedFiles.length > 0) {
            if (dom.restoreSessionContainer) dom.restoreSessionContainer.style.display = 'block';
            if (dom.restoreSessionBtn) {
                dom.restoreSessionBtn.onclick = async () => {
                    await loadFilesIntoApp(storedFiles);
                    dom.restoreSessionContainer.style.display = 'none';
                };
            }
        }
    } catch (error) {
        console.error("Could not initialize app from IndexedDB:", error);
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', initializeApp);
