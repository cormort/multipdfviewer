// script.js

// [MODIFIED] Import the IndexedDB helper functions
import { initDB, saveFiles, getFiles } from './db.js';

document.addEventListener('DOMContentLoaded', () => {
    // Check if pdfjsLib is defined. The inline script in HTML now handles GlobalWorkerOptions
    // to ensure it's set before pdf.mjs fully initializes.
    if (typeof pdfjsLib === 'undefined') {
        console.error('pdfjsLib is not defined. Ensure pdf.mjs is loaded before script.js.');
        alert('Failed to load PDF library. Please refresh the page or check your internet connection.');
        return;
    }

    let pdfDocs = [];
    let pageMap = [];
    let globalTotalPages = 0;
    let currentPage = 1;
    let pageRendering = false;
    let searchResults = []; // To store search results for navigation

    // --- NEW: State variables for zoom ---
    let currentZoomMode = 'height'; // 'width', 'height', or 'custom'
    let currentScale = 1.0; // Stores the actual scale value

    const canvas = document.getElementById('pdf-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const toolbar = document.getElementById('toolbar');
    const toolbarToggleTab = document.getElementById('toolbar-toggle-tab');
    const appContainer = document.getElementById('app-container');
    const pdfContainer = document.getElementById('pdf-container');
    const textLayerDivGlobal = document.getElementById('text-layer');
    const goToFirstPageBtn = document.getElementById('go-to-first-page');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const pageNumDisplay = document.getElementById('page-num-display');
    const pageToGoInput = document.getElementById('page-to-go');
    const goToPageBtn = document.getElementById('go-to-page-btn');
    const pageSlider = document.getElementById('page-slider');
    const resultsDropdown = document.getElementById('resultsDropdown');
    const qualitySelector = document.getElementById('quality-selector');
    const exportPageBtn = document.getElementById('export-page-btn');
    const sharePageBtn = document.getElementById('share-page-btn');
    const toggleUnderlineBtn = document.getElementById('toggle-underline-btn');
    const toggleHighlighterBtn = document.getElementById('toggle-highlighter-btn');
    const clearHighlighterBtn = document.getElementById('clear-highlighter-btn');
    const toggleTextSelectionBtn = document.getElementById('toggle-text-selection-btn');
    const drawingCanvas = document.getElementById('drawing-canvas');
    const drawingCtx = drawingCanvas ? drawingCanvas.getContext('2d') : null;
    const searchInputElem = document.getElementById('searchInput');
    const searchActionButton = document.getElementById('search-action-button');

    const magnifierGlass = document.getElementById('magnifier-glass');
    const magnifierCanvas = document.getElementById('magnifier-canvas');
    const localMagnifierCtx = magnifierCanvas ? magnifierCanvas.getContext('2d') : null;
    const toggleLocalMagnifierBtn = document.getElementById('toggle-local-magnifier-btn');
    const localMagnifierZoomControlsDiv = document.getElementById('local-magnifier-zoom-controls');
    const localMagnifierZoomSelector = document.getElementById('local-magnifier-zoom-selector');

    const searchResultsPanel = document.getElementById('search-results-panel');
    const resultsList = document.getElementById('results-list');
    const copyPageTextBtn = document.getElementById('copy-page-text-btn');

    // --- NEW: Element selectors for zoom controls ---
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const fitWidthBtn = document.getElementById('fit-width-btn');
    const fitHeightBtn = document.getElementById('fit-height-btn');
    const zoomLevelDisplay = document.getElementById('zoom-level-display');


    let localMagnifierEnabled = false;
    let LOCAL_MAGNIFIER_SIZE = 120;
    let LOCAL_MAGNIFIER_ZOOM_LEVEL = 2.5;

    let showSearchResultsHighlights = true;
    let highlighterEnabled = false;
    let textSelectionModeActive = false;
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    async function loadAndProcessFiles(files) {
        if (!files || files.length === 0) {
            return;
        }

        if (typeof pdfjsLib === 'undefined') {
            alert('The PDF library failed to load correctly, cannot open files.');
            return;
        }

        pdfDocs = [];
        pageMap = [];
        globalTotalPages = 0;
        currentPage = 1;
        searchResults = [];
        currentZoomMode = 'height'; // Reset to default on new file load

        if (resultsDropdown) resultsDropdown.innerHTML = '<option value="">Search Results</option>';
        if (resultsList) resultsList.innerHTML = '';
        updateResultsNav();

        if (searchInputElem) searchInputElem.value = '';
        showSearchResultsHighlights = true;
        if (textLayerDivGlobal) textLayerDivGlobal.classList.remove('highlights-hidden');
        highlighterEnabled = false;
        textSelectionModeActive = false;
        localMagnifierEnabled = false;
        if (textLayerDivGlobal) {
            textLayerDivGlobal.classList.remove('text-selection-active');
            textLayerDivGlobal.style.pointerEvents = 'none';
        }
        if (drawingCanvas) drawingCanvas.style.pointerEvents = 'none';
        if (canvas) canvas.style.visibility = 'visible';
        if (drawingCtx && drawingCanvas) drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
        if (magnifierGlass) magnifierGlass.style.display = 'none';

        const loadingPromises = Array.from(files).map(file => {
            return new Promise((resolve) => {
                if (!file || file.type !== 'application/pdf') {
                    console.warn(`Skipping non-PDF file: ${file ? file.name : 'undefined file'}`);
                    resolve(null);
                    return;
                }
                const reader = new FileReader();
                reader.onload = function() {
                    const typedarray = new Uint8Array(this.result);
                    pdfjsLib.getDocument({
                        data: typedarray,
                        isEvalSupported: false,
                        enableXfa: false
                    }).promise.then(pdf => {
                        resolve({ pdf: pdf, name: file.name });
                    }).catch(reason => {
                        console.error(`Error loading ${file.name}:`, reason);
                        resolve(null);
                    });
                };
                reader.readAsArrayBuffer(file);
            });
        });

        try {
            const results = await Promise.all(loadingPromises);
            const loadedPdfs = results.filter(r => r !== null);

            if (loadedPdfs.length === 0) {
                alert('No valid PDF files were selected.');
                pdfDocs = [];
                updatePageControls();
                return;
            }

            loadedPdfs.forEach((result, docIndex) => {
                pdfDocs.push(result.pdf);
                for (let i = 1; i <= result.pdf.numPages; i++) {
                    pageMap.push({ docIndex: docIndex, localPage: i, docName: result.name });
                }
            });
            globalTotalPages = pageMap.length;
            renderPage(1);
        } catch (error) {
            alert('An error occurred while reading the PDF file: ' + error);
            console.error('Error during file processing:', error);
            pdfDocs = [];
            updatePageControls();
        }
    }

    document.getElementById('fileInput').addEventListener('change', async function(e) {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            try {
                await saveFiles(files);
                document.getElementById('restore-session-container').style.display = 'none';
                await loadAndProcessFiles(files);
            } catch (error) {
                console.error("Failed to save or process files:", error);
                alert("An error occurred while saving or processing the files.");
            }
        }
    });

    function getDocAndLocalPage(globalPage) {
        if (globalPage < 1 || globalPage > globalTotalPages || pageMap.length === 0) {
            return null;
        }
        const mapping = pageMap[globalPage - 1];
        if (!mapping || pdfDocs[mapping.docIndex] === undefined) {
             return null;
        }
        return {
            doc: pdfDocs[mapping.docIndex],
            localPage: mapping.localPage,
            docName: mapping.docName
        };
    }

    function initLocalMagnifier() {
        if (magnifierCanvas && magnifierGlass) {
            magnifierGlass.style.width = `${LOCAL_MAGNIFIER_SIZE}px`;
            magnifierGlass.style.height = `${LOCAL_MAGNIFIER_SIZE}px`;
            magnifierCanvas.width = LOCAL_MAGNIFIER_SIZE;
            magnifierCanvas.height = LOCAL_MAGNIFIER_SIZE;
        }
        if (localMagnifierZoomSelector) {
            LOCAL_MAGNIFIER_ZOOM_LEVEL = parseFloat(localMagnifierZoomSelector.value);
        }
        if (localMagnifierZoomControlsDiv) localMagnifierZoomControlsDiv.style.display = 'none';
    }

    function updateLocalMagnifier(clientX, clientY) {
        if (!localMagnifierEnabled || pdfDocs.length === 0 || pageRendering || !canvas || !magnifierGlass || !localMagnifierCtx || !pdfContainer) {
            if (magnifierGlass) magnifierGlass.style.display = 'none';
            return;
        }
        const pdfContainerRect = pdfContainer.getBoundingClientRect();
        const pointXInContainer = clientX - pdfContainerRect.left;
        const pointYInContainer = clientY - pdfContainerRect.top;

        const canvasRectInContainer = {
            left: canvas.offsetLeft,
            top: canvas.offsetTop,
            right: canvas.offsetLeft + canvas.offsetWidth,
            bottom: canvas.offsetTop + canvas.offsetHeight
        };

        if (pointXInContainer < canvasRectInContainer.left || pointXInContainer > canvasRectInContainer.right ||
            pointYInContainer < canvasRectInContainer.top || pointYInContainer > canvasRectInContainer.bottom) {
            magnifierGlass.style.display = 'none';
            return;
        }
        magnifierGlass.style.display = 'block';

        const pointXOnCanvasCSS = pointXInContainer - canvas.offsetLeft;
        const pointYOnCanvasCSS = pointYInContainer - canvas.offsetTop;

        const scaleX = canvas.width / canvas.offsetWidth;
        const scaleY = canvas.height / canvas.offsetHeight;
        const srcX = pointXOnCanvasCSS * scaleX;
        const srcY = pointYOnCanvasCSS * scaleY;

        const srcRectCSSWidth = LOCAL_MAGNIFIER_SIZE / LOCAL_MAGNIFIER_ZOOM_LEVEL;
        const srcRectCSSHeight = LOCAL_MAGNIFIER_SIZE / LOCAL_MAGNIFIER_ZOOM_LEVEL;
        const srcRectPixelWidth = srcRectCSSWidth * scaleX;
        const srcRectPixelHeight = srcRectCSSHeight * scaleY;

        const srcRectX = srcX - (srcRectPixelWidth / 2);
        const srcRectY = srcY - (srcRectPixelHeight / 2);

        localMagnifierCtx.clearRect(0, 0, LOCAL_MAGNIFIER_SIZE, LOCAL_MAGNIFIER_SIZE);
        localMagnifierCtx.fillStyle = 'white';
        localMagnifierCtx.fillRect(0, 0, LOCAL_MAGNIFIER_SIZE, LOCAL_MAGNIFIER_SIZE);

        localMagnifierCtx.drawImage(
            canvas,
            srcRectX, srcRectY, srcRectPixelWidth, srcRectPixelHeight,
            0, 0, LOCAL_MAGNIFIER_SIZE, LOCAL_MAGNIFIER_SIZE
        );

        if (drawingCanvas && drawingCanvas.width > 0 && drawingCanvas.height > 0) {
            const srcDrawRectX = pointXOnCanvasCSS - (srcRectCSSWidth / 2);
            const srcDrawRectY = pointYOnCanvasCSS - (srcRectCSSHeight / 2);
            localMagnifierCtx.drawImage(
                drawingCanvas,
                srcDrawRectX, srcDrawRectY, srcRectCSSWidth, srcRectCSSHeight,
                0, 0, LOCAL_MAGNIFIER_SIZE, LOCAL_MAGNIFIER_SIZE
            );
        }

        let magnifierTop = (pointYInContainer - LOCAL_MAGNIFIER_SIZE - 10);
        let magnifierLeft = (pointXInContainer - (LOCAL_MAGNIFIER_SIZE / 2));

        magnifierTop = Math.max(0, Math.min(magnifierTop, pdfContainer.clientHeight - LOCAL_MAGNIFIER_SIZE - 5));
        magnifierLeft = Math.max(0, Math.min(magnifierLeft, pdfContainer.clientWidth - LOCAL_MAGNIFIER_SIZE - 5));

        magnifierGlass.style.top = `${magnifierTop + pdfContainer.scrollTop}px`;
        magnifierGlass.style.left = `${magnifierLeft + pdfContainer.scrollLeft}px`;
    }

    // --- NEW: Function to update the zoom controls UI ---
    function updateZoomControls() {
        if (!zoomLevelDisplay || !fitWidthBtn || !fitHeightBtn) return;
        
        zoomLevelDisplay.textContent = `${Math.round(currentScale * 100)}%`;

        fitWidthBtn.classList.remove('active');
        fitHeightBtn.classList.remove('active');

        if (currentZoomMode === 'width') {
            fitWidthBtn.classList.add('active');
        } else if (currentZoomMode === 'height') {
            fitHeightBtn.classList.add('active');
        }
    }

    function updatePageControls() {
        const fabContainer = document.getElementById('floating-action-buttons');
        const hasDocs = pdfDocs.length > 0;

        // Simplified check
        if (!pageNumDisplay || !fabContainer) {
            if (!hasDocs && pageNumDisplay) pageNumDisplay.textContent = '- / -';
            if (!hasDocs && fabContainer) fabContainer.style.display = 'none';
            return;
        }

        const allControls = [goToFirstPageBtn, prevPageBtn, nextPageBtn, pageToGoInput, goToPageBtn, pageSlider, toggleUnderlineBtn, toggleHighlighterBtn, clearHighlighterBtn, toggleTextSelectionBtn, sharePageBtn, exportPageBtn, toggleLocalMagnifierBtn, localMagnifierZoomSelector, copyPageTextBtn, zoomInBtn, zoomOutBtn, fitWidthBtn, fitHeightBtn];
        
        allControls.forEach(el => { if(el) el.disabled = !hasDocs; });

        if (!hasDocs) {
            pageNumDisplay.textContent = '- / -';
            if (pageToGoInput) { pageToGoInput.value = ''; pageToGoInput.max = 1; }
            if (pageSlider) { pageSlider.max = 1; pageSlider.value = 1; }
            fabContainer.style.display = 'none';
            if (localMagnifierZoomControlsDiv) localMagnifierZoomControlsDiv.style.display = 'none';
            updateResultsNav();
            return;
        }

        const docInfo = getDocAndLocalPage(currentPage);
        const docNameDisplay = docInfo ? ` (File: ${docInfo.docName})` : '';
        pageNumDisplay.textContent = `Page ${currentPage} / ${globalTotalPages}${docNameDisplay}`;
        if (pageToGoInput) { pageToGoInput.value = currentPage; pageToGoInput.max = globalTotalPages; }
        if (goToFirstPageBtn) goToFirstPageBtn.disabled = (currentPage === 1);
        if (prevPageBtn) prevPageBtn.disabled = (currentPage === 1);
        if (nextPageBtn) nextPageBtn.disabled = (currentPage === globalTotalPages);
        if (pageSlider) { pageSlider.max = globalTotalPages; pageSlider.value = currentPage; pageSlider.disabled = (globalTotalPages === 1); }

        fabContainer.style.display = 'flex';

        showSearchResultsHighlights ? toggleUnderlineBtn.classList.add('active') : toggleUnderlineBtn.classList.remove('active');
        highlighterEnabled ? toggleHighlighterBtn.classList.add('active') : toggleHighlighterBtn.classList.remove('active');
        toggleHighlighterBtn.title = highlighterEnabled ? 'Disable Highlighter' : 'Enable Highlighter';
        textSelectionModeActive ? toggleTextSelectionBtn.classList.add('active') : toggleTextSelectionBtn.classList.remove('active');
        toggleTextSelectionBtn.title = textSelectionModeActive ? 'Disable Text Selection' : 'Enable Text Selection';
        if (sharePageBtn) sharePageBtn.disabled = !navigator.share;
        localMagnifierEnabled ? toggleLocalMagnifierBtn.classList.add('active') : toggleLocalMagnifierBtn.classList.remove('active');
        toggleLocalMagnifierBtn.title = localMagnifierEnabled ? 'Disable Magnifier' : 'Enable Magnifier';
        if (localMagnifierZoomControlsDiv) localMagnifierZoomControlsDiv.style.display = (hasDocs && localMagnifierEnabled) ? 'flex' : 'none';

        updateResultsNav();
        updateZoomControls(); // Update zoom UI
    }

    if (toolbarToggleTab && appContainer) {
        toolbarToggleTab.addEventListener('click', () => {
            appContainer.classList.toggle('menu-active');
        });
    }
    if (pdfContainer && appContainer) {
        pdfContainer.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && appContainer.classList.contains('menu-active')) {
                if (!toolbar.contains(e.target)) {
                    appContainer.classList.remove('menu-active');
                }
            }
        });
    }

    // --- MODIFIED: renderPage now uses the new zoom logic ---
    function renderPage(globalPageNum, highlightPattern = null) {
        if (pdfDocs.length === 0 || !pdfContainer || !canvas || !ctx || !textLayerDivGlobal || !drawingCanvas || !drawingCtx) {
            return;
        }
        pageRendering = true;
        updatePageControls();
        if (drawingCtx && drawingCanvas) drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);

        const pageInfo = getDocAndLocalPage(globalPageNum);
        if (!pageInfo) {
            pageRendering = false;
            updatePageControls();
            return;
        }

        const { doc, localPage } = pageInfo;

        doc.getPage(localPage).then(function(page) {
            const viewportOriginal = page.getViewport({ scale: 1 });
            let scaleForCss;

            // Calculate scale based on the current zoom mode
            if (currentZoomMode === 'width') {
                scaleForCss = pdfContainer.clientWidth / viewportOriginal.width;
            } else if (currentZoomMode === 'height') {
                // Subtract padding from available height
                const availableHeight = pdfContainer.clientHeight - 20; 
                scaleForCss = availableHeight / viewportOriginal.height;
            } else { // 'custom'
                scaleForCss = currentScale;
            }
            currentScale = scaleForCss; // Update global scale for display

            if (canvas.dataset.originalBorder && pdfDocs.length > 0) canvas.style.border = canvas.dataset.originalBorder;
            else if (pdfDocs.length > 0) canvas.style.border = '1px solid #000';

            showSearchResultsHighlights ? textLayerDivGlobal.classList.remove('highlights-hidden') : textLayerDivGlobal.classList.add('highlights-hidden');

            const viewportCss = page.getViewport({ scale: scaleForCss });
            const devicePixelRatio = window.devicePixelRatio || 1;
            const qualityMultiplier = parseFloat(qualitySelector.value) || 1.5;

            const renderScale = scaleForCss * devicePixelRatio * qualityMultiplier;
            const viewportRender = page.getViewport({ scale: renderScale });

            canvas.width = viewportRender.width; canvas.height = viewportRender.height;
            canvas.style.width = `${viewportCss.width}px`; canvas.style.height = `${viewportCss.height}px`;

            const renderContext = { canvasContext: ctx, viewport: viewportRender };

            page.render(renderContext).promise.then(() => {
                pageRendering = false;
                updatePageControls(); // This will also call updateZoomControls

                textLayerDivGlobal.style.width = `${viewportCss.width}px`;
                textLayerDivGlobal.style.height = `${viewportCss.height}px`;
                textLayerDivGlobal.style.top = `${canvas.offsetTop}px`;
                textLayerDivGlobal.style.left = `${canvas.offsetLeft}px`;

                drawingCanvas.width = viewportCss.width;
                drawingCanvas.height = viewportCss.height;
                drawingCanvas.style.top = `${canvas.offsetTop}px`;
                drawingCanvas.style.left = `${canvas.offsetLeft}px`;

                drawingCtx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
                drawingCtx.lineWidth = 15;
                drawingCtx.lineJoin = 'round'; drawingCtx.lineCap = 'round';

                return renderTextLayer(page, viewportCss, highlightPattern);
            }).catch(reason => {
                console.error(`Error rendering page ${localPage} from doc ${pageInfo.docName}: ` + reason);
                pageRendering = false;
                updatePageControls();
            });
        }).catch(reason => {
            console.error(`Error getting page ${localPage} from doc ${pageInfo.docName}: ` + reason);
            pageRendering = false;
            updatePageControls();
        });
    }

    function renderTextLayer(page, viewport, highlightPattern) {
        if (!textLayerDivGlobal || !pdfjsLib || !pdfjsLib.Util) return Promise.resolve();
        return page.getTextContent().then(function(textContent) {
            textLayerDivGlobal.innerHTML = '';
            textContent.items.forEach(function(item) {
                const textDiv = document.createElement('div');
                const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
                let defaultFontSize = item.height * viewport.scale;
                if (defaultFontSize <= 0) defaultFontSize = 10;
                const style = `position:absolute; left:${tx[4]}px; top:${tx[5] - (item.height * viewport.scale)}px; height:${item.height * viewport.scale}px; width:${item.width * viewport.scale}px; font-size:${defaultFontSize}px; line-height: 1; white-space: pre; font-family: ${item.fontName ? item.fontName.split(',')[0] : 'sans-serif'};`;
                textDiv.setAttribute('style', style);
                textDiv.textContent = item.str;

                if (highlightPattern && highlightPattern.test(item.str)) {
                    textDiv.classList.add('wavy-underline');
                }
                textLayerDivGlobal.appendChild(textDiv);
            });
        }).catch(reason => console.error('Error rendering text layer: ' + reason));
    }

    function getEventPosition(canvasElem, evt) {
        if (!canvasElem) return { x: 0, y: 0 };
        const rect = canvasElem.getBoundingClientRect();
        let clientX, clientY;
        if (evt.touches && evt.touches.length > 0) {
            clientX = evt.touches[0].clientX;
            clientY = evt.touches[0].clientY;
        } else {
            clientX = evt.clientX;
            clientY = evt.clientY;
        }
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function startDrawing(e) {
        if (pdfDocs.length === 0 || pageRendering || !highlighterEnabled || !drawingCanvas || !drawingCtx) return;
        isDrawing = true;
        const pos = getEventPosition(drawingCanvas, e);
        [lastX, lastY] = [pos.x, pos.y];
        drawingCtx.beginPath();
        drawingCtx.moveTo(lastX, lastY);
        if (e.type === 'touchstart') e.preventDefault();
    }

    function draw(e) {
        if (!isDrawing || pdfDocs.length === 0 || !highlighterEnabled || !drawingCanvas || !drawingCtx) return;
        const pos = getEventPosition(drawingCanvas, e);
        drawingCtx.lineTo(pos.x, pos.y);
        drawingCtx.stroke();
        [lastX, lastY] = [pos.x, pos.y];
        if (e.type === 'touchmove') e.preventDefault();
    }

    function stopDrawing() {
        if (!isDrawing) return;
        isDrawing = false;
    }

    if (drawingCanvas) {
        drawingCanvas.addEventListener('mousedown', startDrawing);
        drawingCanvas.addEventListener('mousemove', draw);
        drawingCanvas.addEventListener('mouseup', stopDrawing);
        drawingCanvas.addEventListener('mouseout', stopDrawing);
        drawingCanvas.addEventListener('touchstart', startDrawing, { passive: false });
        drawingCanvas.addEventListener('touchmove', draw, { passive: false });
        drawingCanvas.addEventListener('touchend', stopDrawing);
        drawingCanvas.addEventListener('touchcancel', stopDrawing);
    }

    async function renderThumbnail(docIndex, localPageNum, canvasEl) {
        try {
            const doc = pdfDocs[docIndex];
            if (!doc || !canvasEl) return;
            const page = await doc.getPage(localPageNum);
            
            const viewport = page.getViewport({ scale: 1 });
            const scale = (canvasEl.parentElement.clientWidth - 20) / viewport.width;
            const scaledViewport = page.getViewport({ scale: scale });
            
            const thumbnailCtx = canvasEl.getContext('2d');
            canvasEl.height = scaledViewport.height;
            canvasEl.width = scaledViewport.width;
            
            const renderContext = {
              canvasContext: thumbnailCtx,
              viewport: scaledViewport
            };
            await page.render(renderContext).promise;
        } catch (error) {
            console.error(`Failed to render thumbnail for doc ${docIndex} page ${localPageNum}:`, error);
        }
    }

    function searchKeyword() {
        const input = searchInputElem.value.trim();
        searchResults = [];
        if(resultsDropdown) resultsDropdown.innerHTML = '<option value="">Searching...</option>';
        if(resultsList) resultsList.innerHTML = 'Searching, please wait...';
        updateResultsNav();

        if (pdfDocs.length === 0 || !input) {
            if (pdfDocs.length > 0) renderPage(currentPage, null);
            if(resultsDropdown) resultsDropdown.innerHTML = '<option value="">Search Results</option>';
            if(resultsList) resultsList.innerHTML = '';
            updateResultsNav();
            return;
        }

        let pattern;
        try {
            if (input.startsWith('/') && input.lastIndexOf('/') > 0) {
                const lastSlashIndex = input.lastIndexOf('/');
                pattern = new RegExp(input.slice(1, lastSlashIndex), input.slice(lastSlashIndex + 1));
            } else {
                const escapedInput = input.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
                const keywords = escapedInput.split(/\s+/).filter(k => k.length > 0);
                if (keywords.length === 0) {
                    if (pdfDocs.length > 0) renderPage(currentPage, null);
                    if(resultsDropdown) resultsDropdown.innerHTML = '<option value="">Search Results</option>';
                    if(resultsList) resultsList.innerHTML = '';
                    updateResultsNav();
                    return;
                }
                pattern = new RegExp(keywords.join('.*?'), 'gi');
            }
        } catch (e) {
            alert('Invalid regular expression: ' + e.message);
            if(resultsDropdown) resultsDropdown.innerHTML = '<option value="">Search Results</option>';
            if(resultsList) resultsList.innerHTML = '';
            updateResultsNav();
            return;
        }

        let promises = [];
        let globalPageOffset = 0;

        pdfDocs.forEach((doc, docIndex) => {
            for (let i = 1; i <= doc.numPages; i++) {
                const currentGlobalPageForSearch = globalPageOffset + i;
                const pageInfo = pageMap[currentGlobalPageForSearch - 1];
                
                promises.push(
                    doc.getPage(i).then(p => {
                        return p.getTextContent().then(textContent => {
                            const pageText = textContent.items.map(item => item.str).join('');
                            pattern.lastIndex = 0;
                            if (pattern.test(pageText)) {
                                pattern.lastIndex = 0;
                                const matchResult = pattern.exec(pageText);
                                let foundMatchSummary = 'Match found';

                                if (matchResult) {
                                    const matchedText = matchResult[0];
                                    const matchIndex = matchResult.index;
                                    const contextLength = 40;
                                    const startIndex = Math.max(0, matchIndex - contextLength);
                                    const endIndex = Math.min(pageText.length, matchIndex + matchedText.length + contextLength);

                                    const preMatch = pageText.substring(startIndex, matchIndex).replace(/\n/g, ' ');
                                    const highlightedMatch = matchedText.replace(/\n/g, ' ');
                                    const postMatch = pageText.substring(matchIndex + matchedText.length, endIndex).replace(/\n/g, ' ');

                                    foundMatchSummary =
                                        (startIndex > 0 ? '... ' : '') +
                                        preMatch +
                                        `<span class="wavy-underline">${highlightedMatch}</span>` +
                                        postMatch +
                                        (endIndex < pageText.length ? ' ...' : '');
                                }
                                return {
                                    page: currentGlobalPageForSearch,
                                    summary: foundMatchSummary,
                                    docName: pageInfo.docName,
                                    docIndex: pageInfo.docIndex,
                                    localPage: pageInfo.localPage
                                };
                            }
                            return null;
                        });
                    }).catch(err => {
                        console.warn(`Error processing page for search: Doc ${pageInfo.docName}, Page ${i}`, err);
                        return null;
                    })
                );
            }
            globalPageOffset += doc.numPages;
        });

        Promise.all(promises).then((allPageResults) => {
            searchResults = allPageResults.filter(r => r !== null).sort((a, b) => a.page - b.page);

            if(resultsDropdown) resultsDropdown.innerHTML = '';
            if(resultsList) resultsList.innerHTML = '';

            if (searchResults.length === 0) {
                if(resultsDropdown) resultsDropdown.innerHTML = '<option>Keyword not found</option>';
                if(resultsList) resultsList.innerHTML = '<p style="padding: 10px;">Keyword not found.</p>';
                renderPage(currentPage, null);
            } else {
                searchResults.forEach(result => {
                    const option = document.createElement('option');
                    option.value = result.page;
                    option.innerHTML = `Page ${result.page}: ${result.summary}`;
                    if(resultsDropdown) resultsDropdown.appendChild(option);

                    const resultItem = document.createElement('div');
                    resultItem.className = 'result-item';
                    resultItem.innerHTML = `
                        <canvas class="thumbnail-canvas"></canvas>
                        <div class="page-info">Page ${result.page} (File: ${result.docName})</div>
                        <div class="context-snippet">${result.summary}</div>
                    `;
                    resultItem.addEventListener('click', () => {
                        goToPage(result.page, pattern);
                    });
                    if(resultsList) resultsList.appendChild(resultItem);
                    
                    const thumbnailCanvas = resultItem.querySelector('.thumbnail-canvas');
                    renderThumbnail(result.docIndex, result.localPage, thumbnailCanvas);
                });

                if (searchResults.length > 0) {
                    goToPage(searchResults[0].page, pattern);
                }
            }
            updateResultsNav();

            if (window.innerWidth <= 768 && appContainer.classList.contains('menu-active')) {
                appContainer.classList.remove('menu-active');
            }

        }).catch(err => {
            console.error('An unexpected error occurred during search:', err);
            if(resultsDropdown) resultsDropdown.innerHTML = '<option value="">Search Error</option>';
            if(resultsList) resultsList.innerHTML = '<p style="padding: 10px;">An error occurred during search.</p>';
            renderPage(currentPage, null);
            updateResultsNav();
        });
    }

    function updateResultsNav() {
        const hasResults = searchResults.length > 0;
        document.body.classList.toggle('results-bar-visible', hasResults);
        if (appContainer) {
            appContainer.classList.toggle('results-panel-visible', hasResults);
        }
    }


    if (searchActionButton) {
        searchActionButton.addEventListener('click', searchKeyword);
    }
    
    if (searchInputElem) {
        searchInputElem.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchActionButton.click();
            }
        });
    }

    function goToPageDropdown(pageNumStr) {
        if (pageNumStr && resultsDropdown) {
            const pageNum = parseInt(pageNumStr);
            goToPage(pageNum, getPatternFromSearchInput());
        }
    }

    if (resultsDropdown) {
        resultsDropdown.addEventListener('change', () => goToPageDropdown(resultsDropdown.value));
    }

    function goToPage(globalPageNum, highlightPatternForPage = null) {
        if (pdfDocs.length === 0 || isNaN(globalPageNum)) return;
        const n = Math.max(1, Math.min(globalPageNum, globalTotalPages));

        const currentGlobalPattern = getPatternFromSearchInput();

        if (pageRendering && currentPage === n && JSON.stringify(highlightPatternForPage) === JSON.stringify(currentGlobalPattern)) return;
        if (pageRendering && !(currentPage === n && JSON.stringify(highlightPatternForPage) !== JSON.stringify(currentGlobalPattern))) {
            return;
        }
        currentPage = n;
        const finalHighlightPattern = highlightPatternForPage !== null ? highlightPatternForPage : currentGlobalPattern;
        renderPage(currentPage, finalHighlightPattern);
        if (pageToGoInput) pageToGoInput.value = currentPage;
        if (pageSlider) pageSlider.value = currentPage;
        if (resultsDropdown) resultsDropdown.value = currentPage;
    }

    function getPatternFromSearchInput() {
        const i = searchInputElem ? searchInputElem.value.trim() : null;
        if (!i) return null;
        try {
            if (i.startsWith('/') && i.lastIndexOf('/') > 0) {
                const ls = i.lastIndexOf('/');
                return new RegExp(i.slice(1, ls), i.slice(ls + 1));
            } else {
                const es = i.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
                const k = es.split(/\s+/).filter(ky => ky.length > 0);
                if (k.length > 0) return new RegExp(k.join('.*?'), 'gi');
            }
        } catch (e) {
            console.warn('Could not create regex from input:', e);
            return null;
        }
        return null;
    }

    if (goToFirstPageBtn) goToFirstPageBtn.addEventListener('click', () => { if (pdfDocs.length > 0) goToPage(1, getPatternFromSearchInput()); });
    if (prevPageBtn) prevPageBtn.addEventListener('click', () => { if (currentPage > 1) goToPage(currentPage - 1, getPatternFromSearchInput()); });
    if (nextPageBtn) nextPageBtn.addEventListener('click', () => { if (pdfDocs.length > 0 && currentPage < globalTotalPages) goToPage(currentPage + 1, getPatternFromSearchInput()); });
    
    if (goToPageBtn && pageToGoInput) {
        goToPageBtn.addEventListener('click', () => {
            const pn = parseInt(pageToGoInput.value);
            if (!isNaN(pn)) {
                goToPage(pn, getPatternFromSearchInput());
            } else {
                if (pdfDocs.length > 0) alert(`Please enter a page number between 1 and ${globalTotalPages}`);
                else alert('Please load a PDF file first');
                if (pdfDocs.length > 0 && pageToGoInput) pageToGoInput.value = currentPage;
            }
        });
    }

    if (pageToGoInput && goToPageBtn) {
        pageToGoInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                goToPageBtn.click();
            }
        });
    }

    if (pageSlider) pageSlider.addEventListener('input', () => {
        const newPage = parseInt(pageSlider.value);
        if (pageToGoInput && pageToGoInput.value !== newPage.toString()) {
            pageToGoInput.value = newPage;
        }
        if (currentPage !== newPage) {
            goToPage(newPage, getPatternFromSearchInput());
        }
    });

    if (qualitySelector) qualitySelector.addEventListener('change', () => { if (pdfDocs.length > 0) renderPage(currentPage, getPatternFromSearchInput()); });

    if (exportPageBtn) exportPageBtn.addEventListener('click', () => {
        if (pdfDocs.length === 0 || !canvas) { alert('Please load a PDF file first'); return; }
        if (pageRendering) { alert('The page is still rendering, please wait'); return; }

        const wasCanvasHidden = canvas.style.visibility === 'hidden';
        if (wasCanvasHidden) canvas.style.visibility = 'visible';

        try {
            const tc = document.createElement('canvas');
            tc.width = canvas.width; tc.height = canvas.height;
            const tctx = tc.getContext('2d');
            if (!tctx) { alert('Could not get context for the export canvas'); return; }
            tctx.drawImage(canvas, 0, 0);
            if (drawingCanvas && drawingCtx) tctx.drawImage(drawingCanvas, 0, 0, drawingCanvas.width, drawingCanvas.height, 0, 0, tc.width, tc.height);

            const idu = tc.toDataURL('image/png');
            const l = document.createElement('a');
            l.href = idu;
            const pageInfo = getDocAndLocalPage(currentPage);
            const docNamePart = pageInfo ? pageInfo.docName.replace(/\.pdf$/i, '') : 'document';
            l.download = `page_${currentPage}_(${docNamePart}-p${pageInfo.localPage})_annotated.png`;
            document.body.appendChild(l);
            l.click();
            document.body.removeChild(l);
        } catch (er) {
            console.error('Export error:', er);
            alert('Failed to export image: ' + er.message);
        } finally {
            if (wasCanvasHidden) canvas.style.visibility = 'hidden';
        }
    });

    if (toggleUnderlineBtn) toggleUnderlineBtn.addEventListener('click', () => {
        if (pdfDocs.length === 0) return;
        showSearchResultsHighlights = !showSearchResultsHighlights;
        renderPage(currentPage, getPatternFromSearchInput());
        updatePageControls();
    });

    if (toggleHighlighterBtn) toggleHighlighterBtn.addEventListener('click', () => {
        if (pdfDocs.length === 0 || !drawingCanvas || !canvas) return;
        highlighterEnabled = !highlighterEnabled;

        if (highlighterEnabled) {
            if (textSelectionModeActive) {
                textSelectionModeActive = false;
                if (textLayerDivGlobal) { textLayerDivGlobal.style.pointerEvents = 'none'; textLayerDivGlobal.classList.remove('text-selection-active'); }
                if (canvas) canvas.style.visibility = 'visible';
            }
            if (localMagnifierEnabled) {
                localMagnifierEnabled = false;
                if (magnifierGlass) magnifierGlass.style.display = 'none';
            }
            drawingCanvas.style.pointerEvents = 'auto';
        } else {
            drawingCanvas.style.pointerEvents = 'none';
        }
        updatePageControls();
    });

    if (toggleTextSelectionBtn) {
        toggleTextSelectionBtn.addEventListener('click', () => {
            if (pdfDocs.length === 0 || !textLayerDivGlobal || !canvas || !drawingCanvas) return;
            textSelectionModeActive = !textSelectionModeActive;

            if (textSelectionModeActive) {
                if (highlighterEnabled) {
                    highlighterEnabled = false;
                    if (drawingCanvas) drawingCanvas.style.pointerEvents = 'none';
                }
                if (localMagnifierEnabled) {
                    localMagnifierEnabled = false;
                    if (magnifierGlass) magnifierGlass.style.display = 'none';
                }
                textLayerDivGlobal.style.pointerEvents = 'auto';
                textLayerDivGlobal.classList.add('text-selection-active');
                canvas.style.visibility = 'hidden';
                drawingCanvas.style.pointerEvents = 'none';
            } else {
                textLayerDivGlobal.style.pointerEvents = 'none';
                textLayerDivGlobal.classList.remove('text-selection-active');
                canvas.style.visibility = 'visible';
            }
            updatePageControls();
        });
    }

    if (clearHighlighterBtn && drawingCtx && drawingCanvas) clearHighlighterBtn.addEventListener('click', () => {
        if (pdfDocs.length === 0) return;
        drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    });
    
    if (copyPageTextBtn) {
        copyPageTextBtn.addEventListener('click', async () => {
            if (pdfDocs.length === 0 || pageRendering) return;
            const pageInfo = getDocAndLocalPage(currentPage);
            if (!pageInfo) {
                showFeedback('Could not get current page info.');
                return;
            }
            
            try {
                const page = await pageInfo.doc.getPage(pageInfo.localPage);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join('\n');
                
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(pageText);
                    showFeedback('Page text copied to clipboard!');
                } else {
                    const textArea = document.createElement("textarea");
                    textArea.value = pageText;
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    showFeedback('Page text copied to clipboard!');
                }
            } catch (err) {
                console.error('Failed to copy text:', err);
                showFeedback('Error copying page text.');
            }
        });
    }

    if (sharePageBtn) {
        sharePageBtn.addEventListener('click', async () => {
            if (pdfDocs.length === 0 || !canvas) { alert('Please load a PDF file first'); return; }
            if (pageRendering) { alert('The page is still rendering, please wait'); return; }
            const wasCanvasHidden = canvas.style.visibility === 'hidden';
            if (wasCanvasHidden) canvas.style.visibility = 'visible';

            if (!navigator.share) {
                alert('Your browser does not support the Web Share API');
                if (wasCanvasHidden) canvas.style.visibility = 'hidden';
                return;
            }

            try {
                const tc = document.createElement('canvas');
                tc.width = canvas.width; tc.height = canvas.height;
                const tctx = tc.getContext('2d');
                if (!tctx) {
                    alert('Could not get context for the share canvas');
                    if (wasCanvasHidden) canvas.style.visibility = 'hidden';
                    return;
                }
                tctx.drawImage(canvas, 0, 0);
                if (drawingCanvas && drawingCtx) { tctx.drawImage(drawingCanvas, 0, 0, drawingCanvas.width, drawingCanvas.height, 0, 0, tc.width, tc.height); }
                
                const blob = await new Promise(resolve => tc.toBlob(resolve, 'image/png'));
                if (!blob) { throw new Error('Failed to create image data from canvas.'); }

                const pageInfo = getDocAndLocalPage(currentPage);
                const docNamePart = pageInfo ? pageInfo.docName.replace(/\.pdf$/i, '') : 'document';
                const fn = `page_${currentPage}_(${docNamePart}-p${pageInfo.localPage})_annotated.png`;
                const f = new File([blob], fn, { type: 'image/png' });
                const sd = { title: `PDF Global Page ${currentPage}`, text: `Page ${pageInfo.localPage} from ${docNamePart} (PDF Tool)`, files: [f] };

                if (navigator.canShare && navigator.canShare({ files: [f] })) {
                    await navigator.share(sd);
                } else {
                    console.warn('File sharing not supported, attempting to share text only');
                    const fsd = { title: sd.title, text: sd.text };
                    if (fsd.text && navigator.canShare && navigator.canShare(fsd)) {
                        await navigator.share(fsd);
                    } else {
                        alert('Your browser does not support sharing files or text.');
                    }
                }
            } catch (er) {
                console.error('Share error:', er);
                if (er.name !== 'AbortError') { alert('Share failed: ' + er.message); }
            } finally {
                if (wasCanvasHidden) { canvas.style.visibility = 'hidden'; }
            }
        });
    }

    if (toggleLocalMagnifierBtn) {
        toggleLocalMagnifierBtn.addEventListener('click', () => {
            if (pdfDocs.length === 0) return;
            localMagnifierEnabled = !localMagnifierEnabled;

            if (localMagnifierEnabled) {
                if (textSelectionModeActive) {
                    textSelectionModeActive = false;
                    if (textLayerDivGlobal) { textLayerDivGlobal.style.pointerEvents = 'none'; textLayerDivGlobal.classList.remove('text-selection-active'); }
                    if (canvas) canvas.style.visibility = 'visible';
                }
                if (highlighterEnabled) {
                    highlighterEnabled = false;
                    if (drawingCanvas) drawingCanvas.style.pointerEvents = 'none';
                }
                if (drawingCanvas) drawingCanvas.style.pointerEvents = 'none';
                if (textLayerDivGlobal) textLayerDivGlobal.style.pointerEvents = 'none';
                if (canvas) canvas.style.visibility = 'visible';
            } else {
                if (magnifierGlass) magnifierGlass.style.display = 'none';
                if (highlighterEnabled && drawingCanvas) { drawingCanvas.style.pointerEvents = 'auto'; } 
                else if (textSelectionModeActive && textLayerDivGlobal) { textLayerDivGlobal.style.pointerEvents = 'auto'; }
            }
            updatePageControls();
        });
    }

    if (localMagnifierZoomSelector) {
        localMagnifierZoomSelector.addEventListener('change', (e) => {
            LOCAL_MAGNIFIER_ZOOM_LEVEL = parseFloat(e.target.value);
        });
    }

    function handlePointerMoveForLocalMagnifier(e) {
        if (!localMagnifierEnabled || pdfDocs.length === 0) return;
        if (e.type === 'touchmove' || e.type === 'touchstart') e.preventDefault();

        let clientX, clientY;
        if (e.touches && e.touches.length > 0) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; } 
        else if (e.clientX !== undefined) { clientX = e.clientX; clientY = e.clientY; } 
        else { return; }
        updateLocalMagnifier(clientX, clientY);
    }

    function handlePointerLeaveForLocalMagnifier() {
        if (localMagnifierEnabled && magnifierGlass) {
            magnifierGlass.style.display = 'none';
        }
    }

    if (pdfContainer) {
        pdfContainer.addEventListener('mousemove', handlePointerMoveForLocalMagnifier);
        pdfContainer.addEventListener('mouseleave', handlePointerLeaveForLocalMagnifier);
        pdfContainer.addEventListener('touchstart', handlePointerMoveForLocalMagnifier, { passive: false });
        pdfContainer.addEventListener('touchmove', handlePointerMoveForLocalMagnifier, { passive: false });
        pdfContainer.addEventListener('touchend', handlePointerLeaveForLocalMagnifier);
        pdfContainer.addEventListener('touchcancel', handlePointerLeaveForLocalMagnifier);
    }

    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (pdfDocs.length > 0) {
                // Re-render with the current mode, which will auto-adjust
                renderPage(currentPage, getPatternFromSearchInput());
            }
        }, 250);
    });

    // --- NEW: Event Listeners for Zoom Controls ---
    if (fitWidthBtn) {
        fitWidthBtn.addEventListener('click', () => {
            currentZoomMode = 'width';
            renderPage(currentPage, getPatternFromSearchInput());
        });
    }
    if (fitHeightBtn) {
        fitHeightBtn.addEventListener('click', () => {
            currentZoomMode = 'height';
            renderPage(currentPage, getPatternFromSearchInput());
        });
    }
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            currentZoomMode = 'custom';
            currentScale += 0.2; // Zoom in by 20%
            renderPage(currentPage, getPatternFromSearchInput());
        });
    }
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            currentZoomMode = 'custom';
            currentScale = Math.max(0.1, currentScale - 0.2); // Zoom out, with a minimum of 10%
            renderPage(currentPage, getPatternFromSearchInput());
        });
    }


    function navigateToNextResult() {
        if (searchResults.length === 0 || !resultsDropdown) return;
        let nextResult = null;
        for (const result of searchResults) {
            if (result.page > currentPage) {
                nextResult = result;
                break;
            }
        }
        if (nextResult) {
            const nextPage = nextResult.page;
            goToPage(nextPage, getPatternFromSearchInput());
        } else {
            showFeedback('Already at the last result');
        }
    }

    function navigateToPreviousResult() {
        if (searchResults.length === 0 || !resultsDropdown) return;
        let prevResult = null;
        for (let i = searchResults.length - 1; i >= 0; i--) {
            if (searchResults[i].page < currentPage) {
                prevResult = searchResults[i];
                break;
            }
        }
        if (prevResult) {
            const prevPage = prevResult.page;
            goToPage(prevPage, getPatternFromSearchInput());
        } else {
            showFeedback('Already at the first result');
        }
    }

    function showFeedback(message) {
        let feedbackDiv = document.getElementById('feedback-message');
        if (!feedbackDiv) {
            feedbackDiv = document.createElement('div');
            feedbackDiv.id = 'feedback-message';
            document.body.appendChild(feedbackDiv);
            Object.assign(feedbackDiv.style, {
                position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
                backgroundColor: 'rgba(0, 0, 0, 0.7)', color: 'white', padding: '10px 20px',
                borderRadius: '20px', zIndex: '9999', opacity: '0',
                transition: 'opacity 0.5s', pointerEvents: 'none'
            });
        }
        feedbackDiv.textContent = message;
        feedbackDiv.style.opacity = '1';
        setTimeout(() => { feedbackDiv.style.opacity = '0'; }, 1500);
    }

    let touchStartX = 0;
    let touchStartY = 0;
    let isSwiping = false;
    const MIN_SWIPE_DISTANCE_X = 50;
    const MAX_SWIPE_DISTANCE_Y = 60;

    if (pdfContainer) {
        pdfContainer.addEventListener('touchstart', (e) => {
            if (highlighterEnabled || textSelectionModeActive || localMagnifierEnabled || e.touches.length !== 1) {
                isSwiping = false;
                return;
            }
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            isSwiping = true;
        }, { passive: true });

        pdfContainer.addEventListener('touchmove', (e) => {
            if (!isSwiping || e.touches.length !== 1) return;
            const currentX = e.touches[0].clientX;
            const diffX = currentX - touchStartX;
            if (Math.abs(diffX) < 10) {
                isSwiping = false;
            }
        }, { passive: true });

        pdfContainer.addEventListener('touchend', (e) => {
            if (!isSwiping || e.changedTouches.length !== 1) {
                isSwiping = false; return;
            }
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            const diffX = touchEndX - touchStartX;
            const diffY = touchEndY - touchStartY;

            if (Math.abs(diffX) > MIN_SWIPE_DISTANCE_X && Math.abs(diffY) < MAX_SWIPE_DISTANCE_Y) {
                const isSearchResultMode = searchResults.length > 0;
                if (diffX < 0) { // Swipe left
                    if (isSearchResultMode) { navigateToNextResult(); } 
                    else { nextPageBtn.click(); }
                } else { // Swipe right
                    if (isSearchResultMode) { navigateToPreviousResult(); } 
                    else { prevPageBtn.click(); }
                }
            }
            isSwiping = false;
        });

        pdfContainer.addEventListener('touchcancel', () => { isSwiping = false; });
    }

    initLocalMagnifier();
    updatePageControls();

    async function initializeApp() {
        try {
            await initDB();
            const storedFiles = await getFiles();

            if (storedFiles.length > 0) {
                const restoreContainer = document.getElementById('restore-session-container');
                const restoreBtn = document.getElementById('restore-session-btn');
                
                if(restoreContainer) restoreContainer.style.display = 'block';
                
                if(restoreBtn) {
                    restoreBtn.onclick = async () => {
                        await loadAndProcessFiles(storedFiles);
                        restoreContainer.style.display = 'none';
                    };
                }
            }
        } catch (error) {
            console.error("Could not initialize app from IndexedDB:", error);
        }
    }
    
    initializeApp();

});
