import { dom, appState } from './app.js';
import { updatePageControls } from './ui.js';
import { getPatternFromSearchInput } from './utils.js';
import { deactivateAllModes } from './annotation.js';

let pageRendering = false;
let currentPageTextContent = null;
let currentViewport = null;
let localMagnifierEnabled = false;
const LOCAL_MAGNIFIER_SIZE = 120;
let localMagnifierZoomLevel = 2.0;

export async function loadAndProcessFiles(files) {
    if (!files || files.length === 0) return null;

    if (typeof pdfjsLib === 'undefined') {
        alert('PDF library failed to load. Please refresh the page or check your internet connection.');
        return null;
    }
    
    deactivateAllModes();
    
    const pdfFiles = Array.from(files).filter(file => file && file.type === 'application/pdf');

    const loadingPromises = pdfFiles.map(file => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function() {
                // **變更點 1: 'this.result' 是我們的原始 ArrayBuffer，必須先保存下來！**
                const originalBuffer = this.result;
                
                // **變更點 2: 建立一個原始 Buffer 的副本，專門給 pdf.js 使用。**
                // .slice(0) 是複製 ArrayBuffer 的標準且高效的方法。
                const bufferForPdfjs = originalBuffer.slice(0);
                
                // **變更點 3: 現在我們用副本來建立 Uint8Array，並傳給 pdf.js。**
                const typedarrayForPdfjs = new Uint8Array(bufferForPdfjs);
                
                pdfjsLib.getDocument({ data: typedarrayForPdfjs, isEvalSupported: false, enableXfa: false }).promise.then(pdf => {
                    // **變更點 4: 當 Promise 完成時，我們 resolve 的是「原始」的 Buffer，而不是被分離的副本。**
                    resolve({ pdf: pdf, name: file.name, buffer: originalBuffer });
                }).catch(reason => {
                    console.error(`Error loading ${file.name}:`, reason);
                    resolve(null);
                });
            };
            reader.readAsArrayBuffer(file);
        });
    });

    const results = await Promise.all(loadingPromises);
    const loadedPdfs = results.filter(r => r !== null);
    
    if (loadedPdfs.length === 0) return null;

    const newPdfDocs = [];
    const newPageMap = [];
    const newPdfArrayBuffers = []; 

    loadedPdfs.forEach((result, docIndex) => {
        newPdfDocs.push(result.pdf);
        // 這段迴圈可以簡化
        for (let i = 1; i <= result.pdf.numPages; i++) {
            newPageMap.push({ docIndex: docIndex, localPage: i, docName: result.name });
        }
        newPdfArrayBuffers.push(result.buffer);
    });

    return {
        pdfDocs: newPdfDocs,
        pageMap: newPageMap,
        globalTotalPages: newPageMap.length,
        pdfArrayBuffers: newPdfArrayBuffers 
    };
}

export function getDocAndLocalPage(globalPage) {
    if (globalPage < 1 || globalPage > appState.globalTotalPages || appState.pageMap.length === 0) return null;
    const mapping = appState.pageMap[globalPage - 1];
    if (!mapping || appState.pdfDocs[mapping.docIndex] === undefined) return null;
    return {
        doc: appState.pdfDocs[mapping.docIndex],
        localPage: mapping.localPage,
        docName: mapping.docName,
        docIndex: mapping.docIndex
    };
}

export function renderPage(globalPageNum, highlightPattern = null) {
    if (appState.pdfDocs.length === 0 || !dom.pdfContainer || !dom.canvas || !dom.ctx) return;
    pageRendering = true;
    currentPageTextContent = null;
    currentViewport = null;
    updatePageControls(); // Update controls at the start
    if (dom.drawingCtx && dom.drawingCanvas) dom.drawingCtx.clearRect(0, 0, dom.drawingCanvas.width, dom.drawingCanvas.height);
    // clearParagraphHighlights(); // This should be in annotation.js

    const pageInfo = getDocAndLocalPage(globalPageNum);
    if (!pageInfo) {
        pageRendering = false;
        updatePageControls();
        return;
    }

    const { doc, localPage } = pageInfo;

    doc.getPage(localPage).then(page => {
        const viewportOriginal = page.getViewport({ scale: 1 });
        let scaleForCss;

        if (appState.currentZoomMode === 'width') {
            scaleForCss = dom.pdfContainer.clientWidth / viewportOriginal.width;
        } else if (appState.currentZoomMode === 'height') {
            const availableHeight = dom.pdfContainer.clientHeight - 20;
            scaleForCss = availableHeight / viewportOriginal.height;
        } else {
            scaleForCss = appState.currentScale;
        }
        appState.currentScale = scaleForCss;

        dom.textLayerDivGlobal.classList.toggle('highlights-hidden', !appState.showSearchResultsHighlights);

        const viewportCss = page.getViewport({ scale: scaleForCss });
        currentViewport = viewportCss;
        const devicePixelRatio = window.devicePixelRatio || 1;
        const QUALITY_FACTOR = 2.0;
        const renderScale = scaleForCss * devicePixelRatio * QUALITY_FACTOR;
        const viewportRender = page.getViewport({ scale: renderScale });

        dom.canvas.width = viewportRender.width;
        dom.canvas.height = viewportRender.height;
        dom.canvas.style.width = `${viewportCss.width}px`;
        dom.canvas.style.height = `${viewportCss.height}px`;

        const renderContext = { canvasContext: dom.ctx, viewport: viewportRender };
        
        page.render(renderContext).promise.then(() => {
            pageRendering = false;
            updatePageControls(); // Update again when done

            const canvasOffsetTop = dom.canvas.offsetTop;
            const canvasOffsetLeft = dom.canvas.offsetLeft;
            dom.textLayerDivGlobal.style.width = `${viewportCss.width}px`;
            dom.textLayerDivGlobal.style.height = `${viewportCss.height}px`;
            dom.textLayerDivGlobal.style.top = `${canvasOffsetTop}px`;
            dom.textLayerDivGlobal.style.left = `${canvasOffsetLeft}px`;

            dom.drawingCanvas.width = viewportCss.width;
            dom.drawingCanvas.height = viewportCss.height;
            dom.drawingCanvas.style.top = `${canvasOffsetTop}px`;
            dom.drawingCanvas.style.left = `${canvasOffsetLeft}px`;
            
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
    if (!dom.textLayerDivGlobal || !pdfjsLib || !pdfjsLib.util) return Promise.resolve();
    return page.getTextContent().then(textContent => {
        currentPageTextContent = textContent;
        dom.textLayerDivGlobal.innerHTML = ''; // Clear previous text layer
        pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: dom.textLayerDivGlobal,
            viewport: viewport,
            textDivs: []
        });

        // Apply custom highlights after rendering
        if (highlightPattern) {
            const textDivs = dom.textLayerDivGlobal.querySelectorAll('span');
            textDivs.forEach(textDiv => {
                if (highlightPattern.test(textDiv.textContent)) {
                    // Create a wavy underline effect by wrapping text
                    textDiv.innerHTML = textDiv.textContent.replace(highlightPattern, (match) => `<span class="wavy-underline">${match}</span>`);
                }
            });
        }
    }).catch(reason => console.error('Error rendering text layer: ' + reason));
}


export function goToPage(globalPageNum, highlightPatternForPage = null) {
    if (appState.pdfDocs.length === 0 || isNaN(globalPageNum)) return;
    const n = Math.max(1, Math.min(globalPageNum, appState.globalTotalPages));
    const currentGlobalPattern = getPatternFromSearchInput(dom.searchInputElem);
    
    if (pageRendering && appState.currentPage === n) return; // Prevent re-rendering same page
    
    appState.currentPage = n;
    const finalHighlightPattern = highlightPatternForPage !== null ? highlightPatternForPage : currentGlobalPattern;
    renderPage(appState.currentPage, finalHighlightPattern);
    
    if (dom.pageToGoInput) dom.pageToGoInput.value = appState.currentPage;
    if (dom.pageSlider) dom.pageSlider.value = appState.currentPage;
    if (dom.resultsDropdown) dom.resultsDropdown.value = appState.currentPage;
    if (dom.panelResultsDropdown) dom.panelResultsDropdown.value = appState.currentPage;
}

// Magnifier Functions
export function initLocalMagnifier() {
    if (dom.magnifierCanvas && dom.magnifierGlass) {
        dom.magnifierGlass.style.width = `${LOCAL_MAGNIFIER_SIZE}px`;
        dom.magnifierGlass.style.height = `${LOCAL_MAGNIFIER_SIZE}px`;
        dom.magnifierCanvas.width = LOCAL_MAGNIFIER_SIZE;
        dom.magnifierCanvas.height = LOCAL_MAGNIFIER_SIZE;
    }
    if (dom.localMagnifierZoomSelector) localMagnifierZoomLevel = parseFloat(dom.localMagnifierZoomSelector.value);
}

export function toggleLocalMagnifier() {
    const wasActive = localMagnifierEnabled;
    deactivateAllModes();
    if (!wasActive) {
        localMagnifierEnabled = true;
    }
    appState.localMagnifierEnabled = localMagnifierEnabled;
    updatePageControls();
}


export function updateLocalMagnifier(clientX, clientY) {
    if (!localMagnifierEnabled || !dom.canvas || !dom.magnifierGlass || !dom.localMagnifierCtx || !dom.pdfContainer) {
        if (dom.magnifierGlass) dom.magnifierGlass.style.display = 'none';
        return;
    }
    
    const pdfContainerRect = dom.pdfContainer.getBoundingClientRect();
    const pointXInContainer = clientX - pdfContainerRect.left;
    const pointYInContainer = clientY - pdfContainerRect.top;
    
    const canvasRect = dom.canvas.getBoundingClientRect();
    const pointXOnCanvas = clientX - canvasRect.left;
    const pointYOnCanvas = clientY - canvasRect.top;

    if (pointXOnCanvas < 0 || pointXOnCanvas > dom.canvas.offsetWidth || pointYOnCanvas < 0 || pointYOnCanvas > dom.canvas.offsetHeight) {
        dom.magnifierGlass.style.display = 'none';
        return;
    }
    dom.magnifierGlass.style.display = 'block';

    const scaleX = dom.canvas.width / dom.canvas.offsetWidth;
    const scaleY = dom.canvas.height / dom.canvas.offsetHeight;
    const srcX = pointXOnCanvas * scaleX;
    const srcY = pointYOnCanvas * scaleY;
    
    const srcRectCSSWidth = LOCAL_MAGNIFIER_SIZE / localMagnifierZoomLevel;
    const srcRectCSSHeight = LOCAL_MAGNIFIER_SIZE / localMagnifierZoomLevel;
    
    const srcRectPixelWidth = srcRectCSSWidth * scaleX;
    const srcRectPixelHeight = srcRectCSSHeight * scaleY;
    
    const srcRectX = srcX - (srcRectPixelWidth / 2);
    const srcRectY = srcY - (srcRectPixelHeight / 2);

    dom.localMagnifierCtx.clearRect(0, 0, LOCAL_MAGNIFIER_SIZE, LOCAL_MAGNIFIER_SIZE);
    dom.localMagnifierCtx.fillStyle = 'white';
    dom.localMagnifierCtx.fillRect(0, 0, LOCAL_MAGNIFIER_SIZE, LOCAL_MAGNIFIER_SIZE);
    dom.localMagnifierCtx.drawImage(dom.canvas, srcRectX, srcRectY, srcRectPixelWidth, srcRectPixelHeight, 0, 0, LOCAL_MAGNIFIER_SIZE, LOCAL_MAGNIFIER_SIZE);

    if (dom.drawingCanvas && dom.drawingCanvas.width > 0 && dom.drawingCanvas.height > 0) {
        const srcDrawRectX = pointXOnCanvas - (srcRectCSSWidth / 2);
        const srcDrawRectY = pointYOnCanvas - (srcRectCSSHeight / 2);
        dom.localMagnifierCtx.drawImage(dom.drawingCanvas, srcDrawRectX, srcDrawRectY, srcRectCSSWidth, srcRectCSSHeight, 0, 0, LOCAL_MAGNIFIER_SIZE, LOCAL_MAGNIFIER_SIZE);
    }
    
    let magnifierTop = (pointYInContainer - LOCAL_MAGNIFIER_SIZE - 10);
    let magnifierLeft = (pointXInContainer - (LOCAL_MAGNIFIER_SIZE / 2));
    
    magnifierTop = Math.max(0, Math.min(magnifierTop, dom.pdfContainer.clientHeight - LOCAL_MAGNIFIER_SIZE - 5));
    magnifierLeft = Math.max(0, Math.min(magnifierLeft, dom.pdfContainer.clientWidth - LOCAL_MAGNIFIER_SIZE - 5));
    
    dom.magnifierGlass.style.top = `${magnifierTop + dom.pdfContainer.scrollTop}px`;
    dom.magnifierGlass.style.left = `${magnifierLeft + dom.pdfContainer.scrollLeft}px`;
}

export function updateMagnifierZoomLevel(level) {
    localMagnifierZoomLevel = parseFloat(level);
}

export { currentPageTextContent, currentViewport };
