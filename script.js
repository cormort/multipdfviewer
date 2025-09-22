// script.js

import { initDB, saveFiles, getFiles } from './db.js';

document.addEventListener('DOMContentLoaded', () => {
    if (typeof pdfjsLib === 'undefined') {
        console.error('pdfjsLib 未定義。請確保 pdf.mjs 在 script.js 之前載入。');
        alert('PDF 程式庫載入失敗。請刷新頁面或檢查您的網路連線。');
        return;
    }

    // --- State Variables ---
    let pdfDocs = [];
    let pageMap = [];
    let globalTotalPages = 0;
    let currentPage = 1;
    let pageRendering = false;
    let searchResults = [];
    let currentZoomMode = 'height';
    let currentScale = 1.0;
    // ... (other state variables)

    // --- Element Caching ---
    const canvas = document.getElementById('pdf-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const appContainer = document.getElementById('app-container');
    const pdfContainer = document.getElementById('pdf-container');
    const textLayerDivGlobal = document.getElementById('text-layer');
    const drawingCanvas = document.getElementById('drawing-canvas');
    const drawingCtx = drawingCanvas ? drawingCanvas.getContext('2d') : null;
    
    const searchInputElem = document.getElementById('searchInput');
    const searchActionButton = document.getElementById('search-action-button');
    
    // Results Elements
    const resultsDropdown = document.getElementById('resultsDropdown');
    const panelResultsDropdown = document.getElementById('panelResultsDropdown');
    const fileFilterDropdown = document.getElementById('fileFilterDropdown'); // New
    const panelFileFilterDropdown = document.getElementById('panelFileFilterDropdown'); // New
    const resultsList = document.getElementById('results-list');

    // Zoom Buttons
    const desktopZoomControls = {
        zoomOutBtn: document.getElementById('zoom-out-btn'),
        zoomInBtn: document.getElementById('zoom-in-btn'),
        fitWidthBtn: document.getElementById('fit-width-btn'),
        fitHeightBtn: document.getElementById('fit-height-btn'),
    };
    const mobileZoomControls = {
        zoomOutBtn: document.getElementById('mobile-zoom-out-btn'),
        zoomInBtn: document.getElementById('mobile-zoom-in-btn'),
        fitWidthBtn: document.getElementById('mobile-fit-width-btn'),
        fitHeightBtn: document.getElementById('mobile-fit-height-btn'),
    };
    
    // ... (other element caches)

    // ===================================================================
    //  CORE FUNCTIONS
    // ===================================================================

    async function loadAndProcessFiles(files) {
        // ... (This function remains mostly the same)
        // Reset state
        pdfDocs = [];
        pageMap = [];
        globalTotalPages = 0;
        currentPage = 1;
        searchResults = [];
        currentZoomMode = 'height';

        // Reset UI
        const defaultFileOption = '<option value="all">全部檔案</option>';
        const defaultSummaryOption = '<option value="">頁面摘要</option>';
        if (fileFilterDropdown) fileFilterDropdown.innerHTML = defaultFileOption;
        if (panelFileFilterDropdown) panelFileFilterDropdown.innerHTML = defaultFileOption;
        if (resultsDropdown) resultsDropdown.innerHTML = defaultSummaryOption;
        if (panelResultsDropdown) panelResultsDropdown.innerHTML = defaultSummaryOption;
        if (resultsList) resultsList.innerHTML = '';
        updateResultsNav();
        
        // ... (rest of the file loading logic)
        try {
            // ... (Promise.all logic)
            const results = await Promise.all(/* loadingPromises */);
            const loadedPdfs = results.filter(r => r !== null);
            // ...
            loadedPdfs.forEach((result, docIndex) => {
                pdfDocs.push(result.pdf);
                for (let i = 1; i <= result.pdf.numPages; i++) {
                    pageMap.push({ docIndex: docIndex, localPage: i, docName: result.name });
                }
            });
            globalTotalPages = pageMap.length;
            renderPage(1);
        } catch (error) {
            // ...
        }
    }

    function renderPage(globalPageNum, highlightPattern = null) {
        // ... (This function remains the same)
    }

    async function renderThumbnail(docIndex, localPageNum, canvasEl) {
        // ... (This function remains the same)
    }

    function searchKeyword() {
        // ... (Pattern creation logic is the same)
        
        // ... (Promise.all logic to find matches is the same)

        Promise.all(promises).then((allPageResults) => {
            searchResults = allPageResults.filter(r => r !== null);
            
            // --- NEW LOGIC FOR CASCADING DROPDOWNS ---
            populateFileFilterDropdown(); // Step 1: Populate the file filter
            populateSummaryDropdown('all'); // Step 2: Populate summaries with "all" selected
            
            if (searchResults.length > 0) {
                goToPage(searchResults[0].page, pattern);
            } else {
                renderPage(currentPage, null);
            }
            updateResultsNav();
        });
    }

    function populateFileFilterDropdown() {
        const uniqueFiles = [...new Set(searchResults.map(r => r.docName))];
        
        const allFilesOption = '<option value="all">全部檔案</option>';
        if (fileFilterDropdown) fileFilterDropdown.innerHTML = allFilesOption;
        if (panelFileFilterDropdown) panelFileFilterDropdown.innerHTML = allFilesOption;

        if (uniqueFiles.length > 1) {
            uniqueFiles.forEach(fileName => {
                const option = document.createElement('option');
                option.value = fileName;
                option.textContent = fileName;
                if (fileFilterDropdown) fileFilterDropdown.appendChild(option.cloneNode(true));
                if (panelFileFilterDropdown) panelFileFilterDropdown.appendChild(option);
            });
        }
    }

    function populateSummaryDropdown(fileNameFilter = 'all') {
        const filteredResults = fileNameFilter === 'all' 
            ? searchResults 
            : searchResults.filter(r => r.docName === fileNameFilter);

        if (resultsDropdown) resultsDropdown.innerHTML = '';
        if (panelResultsDropdown) panelResultsDropdown.innerHTML = '';
        if (resultsList) resultsList.innerHTML = '';

        if (filteredResults.length === 0) {
            const notFoundMsg = '<option>無結果</option>';
            if(resultsDropdown) resultsDropdown.innerHTML = notFoundMsg;
            if(panelResultsDropdown) panelResultsDropdown.innerHTML = notFoundMsg;
            if(resultsList) resultsList.innerHTML = '<p style="padding: 10px;">在此檔案中找不到結果。</p>';
            return;
        }

        filteredResults.forEach(result => {
            const optionHTML = `第 ${result.page} 頁: ${result.summary}`;
            
            const option1 = document.createElement('option');
            option1.value = result.page;
            option1.innerHTML = optionHTML;
            if(resultsDropdown) resultsDropdown.appendChild(option1);

            const option2 = document.createElement('option');
            option2.value = result.page;
            option2.innerHTML = optionHTML;
            if(panelResultsDropdown) panelResultsDropdown.appendChild(option2);

            const resultItem = document.createElement('div');
            resultItem.className = 'result-item';
            resultItem.innerHTML = `<canvas class="thumbnail-canvas"></canvas><div class="page-info">第 ${result.page} 頁 (檔案: ${result.docName})</div><div class="context-snippet">${result.summary}</div>`;
            resultItem.addEventListener('click', () => goToPage(result.page, getPatternFromSearchInput()));
            if(resultsList) resultsList.appendChild(resultItem);
            
            const thumbnailCanvas = resultItem.querySelector('.thumbnail-canvas');
            requestAnimationFrame(() => {
                renderThumbnail(result.docIndex, result.localPage, thumbnailCanvas);
            });
        });
    }

    // ... (All other functions like updatePageControls, goToPage, etc.)

    // ===================================================================
    //  EVENT LISTENERS
    // ===================================================================
    
    // -- File & Search --
    document.getElementById('fileInput').addEventListener('change', async (e) => {
        await loadAndProcessFiles(Array.from(e.target.files));
    });
    if (searchActionButton) searchActionButton.addEventListener('click', searchKeyword);
    if (searchInputElem) searchInputElem.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchActionButton.click(); } });

    // -- Cascading Dropdown Listeners --
    if (panelFileFilterDropdown) {
        panelFileFilterDropdown.addEventListener('change', (e) => {
            const selectedFile = e.target.value;
            if (fileFilterDropdown) fileFilterDropdown.value = selectedFile; // Sync
            populateSummaryDropdown(selectedFile);
        });
    }
    if (fileFilterDropdown) {
        fileFilterDropdown.addEventListener('change', (e) => {
            const selectedFile = e.target.value;
            if (panelFileFilterDropdown) panelFileFilterDropdown.value = selectedFile; // Sync
            populateSummaryDropdown(selectedFile);
        });
    }
    
    function goToPageDropdown(pageNumStr) {
        if (pageNumStr) {
            const pageNum = parseInt(pageNumStr);
            goToPage(pageNum, getPatternFromSearchInput());
        }
    }
    if (resultsDropdown) resultsDropdown.addEventListener('change', (e) => goToPageDropdown(e.target.value));
    if (panelResultsDropdown) panelResultsDropdown.addEventListener('change', (e) => goToPageDropdown(e.target.value));

    // -- Zoom Controls --
    function handleZoom(mode, scaleChange = 0) {
        if (pdfDocs.length === 0) return;
        currentZoomMode = mode;
        if (mode === 'custom') {
            currentScale = Math.max(0.1, currentScale + scaleChange);
        }
        renderPage(currentPage, getPatternFromSearchInput());
    }

    [desktopZoomControls, mobileZoomControls].forEach(controls => {
        if (controls.fitWidthBtn) controls.fitWidthBtn.addEventListener('click', () => handleZoom('width'));
        if (controls.fitHeightBtn) controls.fitHeightBtn.addEventListener('click', () => handleZoom('height'));
        if (controls.zoomInBtn) controls.zoomInBtn.addEventListener('click', () => handleZoom('custom', 0.2));
        if (controls.zoomOutBtn) controls.zoomOutBtn.addEventListener('click', () => handleZoom('custom', -0.2));
    });

    // ... (All other event listeners for navigation, tools, etc.)

    // --- App Initialization ---
    initializeApp();
});
