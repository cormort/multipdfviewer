// in js/viewer.js

import { dom, appState } from './state.js';
import { updatePageControls } from './ui.js';
import { getPatternFromSearchInput } from './utils.js';
import { deactivateAllModes } from './annotation.js';

// **▼▼▼ 修正點 1: 從 pdf.mjs 匯入 TextLayer 類別 ▼▼▼**
import { TextLayer } from '../libs/pdf.js/pdf.mjs';

// 模組內部狀態
let pageRendering = false;
let currentPageTextContent = null;
let currentViewport = null;
let localMagnifierEnabled = false;
const LOCAL_MAGNIFIER_SIZE = 120;
let localMagnifierZoomLevel = 2.0;

export async function loadAndProcessFiles(loadedFileData) {
    if (!loadedFileData || loadedFileData.length === 0) return null;

    if (typeof pdfjsLib === 'undefined') {
        alert('PDF library failed to load.');
        return null;
    }
    
    deactivateAllModes();
    
    const pdfFilesData = loadedFileData.filter(item => item.type === 'application/pdf');

    const loadingPromises = pdfFilesData.map(item => {
        const originalBuffer = item.buffer;
        const bufferForPdfjs = originalBuffer.slice(0);
        const typedarrayForPdfjs = new Uint8Array(bufferForPdfjs);
        
        return pdfjsLib.getDocument({ data: typedarrayForPdfjs, isEvalSupported: false, enableXfa: false }).promise.then(pdf => {
            return { pdf: pdf, name: item.name, buffer: originalBuffer };
        }).catch(reason => {
            console.error(`Error loading ${item.name}:`, reason);
            return null;
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
    console.log(`準備渲染頁面，頁碼: ${globalPageNum}`);
    
    if (appState.pdfDocs.length === 0 || !dom.pdfContainer || !dom.canvas || !dom.ctx) return;
    if (pageRendering) return;

    pageRendering = true;
    currentPageTextContent = null;
    currentViewport = null;
    updatePageControls();
    
    if (dom.drawingCtx) dom.drawingCtx.clearRect(0, 0, dom.drawingCanvas.width, dom.drawingCanvas.height);

    const pageInfo = getDocAndLocalPage(globalPageNum);
    if (!pageInfo) {
        pageRendering = false;
        updatePageControls();
        return;
    }

    const { doc, localPage } = pageInfo;

    doc.getPage(localPage).then(page => {
        console.log("成功獲取到 PDF 頁面物件:", page);

        let scaleForCss;
        if (appState.currentZoomMode === 'width') {
            scaleForCss = (dom.pdfContainer.clientWidth - 1) / page.getViewport({ scale: 1 }).width;
        } else if (appState.currentZoomMode === 'height') {
            scaleForCss = (dom.pdfContainer.clientHeight - 48) / page.getViewport({ scale: 1 }).height;
        } else {
            scaleForCss = appState.currentScale;
        }
        appState.currentScale = scaleForCss;

        dom.textLayerDivGlobal.classList.toggle('highlights-hidden', !appState.showSearchResultsHighlights);

        const viewport = page.getViewport({ scale: appState.currentScale });
        currentViewport = viewport;

        const devicePixelRatio = window.devicePixelRatio || 1;
        const QUALITY_FACTOR = 2.0;
        const renderScale = appState.currentScale * devicePixelRatio * QUALITY_FACTOR;
        const renderViewport = page.getViewport({ scale: renderScale });

        dom.canvas.width = renderViewport.width;
        dom.canvas.height = renderViewport.height;
        dom.canvas.style.width = `${viewport.width}px`;
        dom.canvas.style.height = `${viewport.height}px`;

        const renderContext = { canvasContext: dom.ctx, viewport: renderViewport };
        
        page.render(renderContext).promise.then(() => {
            const canvasOffsetTop = dom.canvas.offsetTop;
            const canvasOffsetLeft = dom.canvas.offsetLeft;

            dom.textLayerDivGlobal.style.width = `${viewport.width}px`;
            dom.textLayerDivGlobal.style.height = `${viewport.height}px`;
            dom.textLayerDivGlobal.style.top = `${canvasOffsetTop}px`;
            dom.textLayerDivGlobal.style.left = `${canvasOffsetLeft}px`;

            dom.drawingCanvas.width = viewport.width;
            dom.drawingCanvas.height = viewport.height;
            dom.drawingCanvas.style.top = `${canvasOffsetTop}px`;
            dom.drawingCanvas.style.left = `${canvasOffsetLeft}px`;
            
            return renderTextLayer(page, viewport, highlightPattern);

        }).catch(reason => {
            console.error(`Error rendering page:`, reason);
        }).finally(() => {
            pageRendering = false;
            updatePageControls();
        });
    }).catch(reason => {
        console.error(`Error getting page:`, reason);
        pageRendering = false;
        updatePageControls();
    });
}

// **▼▼▼ 修正點 2: 更新整個 renderTextLayer 函式以使用新的 TextLayer 物件 ▼▼▼**
function renderTextLayer(page, viewport, highlightPattern) {
    return page.getTextContent().then(textContent => {
        currentPageTextContent = textContent;
        dom.textLayerDivGlobal.innerHTML = ''; // 清空舊的圖層

        // 1. 建立新的 TextLayer 實例
        const textLayer = new TextLayer({
            textContentSource: textContent,
            container: dom.textLayerDivGlobal,
            viewport: viewport,
        });

        // 2. 執行渲染
        return textLayer.render().then(() => {
            // 3. 渲染完成後，才執行高亮操作
            if (highlightPattern) {
                const textSpans = dom.textLayerDivGlobal.querySelectorAll('span');
                
                textSpans.forEach(span => {
                    const originalText = span.textContent;
                    if (originalText) {
                        const newHtml = originalText.replace(highlightPattern, (match) => `<span class="wavy-underline">${match}</span>`);
                        if (newHtml !== originalText) {
                            span.innerHTML = newHtml;
                        }
                    }
                });
            }
        });

    }).catch(reason => {
        console.error('Error rendering text layer:', reason);
    });
}


export function goToPage(globalPageNum, highlightPatternForPage = null) {
    if (appState.pdfDocs.length === 0 || isNaN(globalPageNum)) return;
    const n = Math.max(1, Math.min(globalPageNum, appState.globalTotalPages));
    if (pageRendering && appState.currentPage === n) return;
    
    appState.currentPage = n;
    const finalHighlightPattern = highlightPatternForPage !== null ? highlightPatternForPage : getPatternFromSearchInput(dom.searchInputElem);
    renderPage(appState.currentPage, finalHighlightPattern);
    
    if (dom.pageToGoInput) dom.pageToGoInput.value = appState.currentPage;
    if (dom.pageSlider) dom.pageSlider.value = appState.currentPage;
    if (dom.resultsDropdown) dom.resultsDropdown.value = appState.currentPage;
    if (dom.panelResultsDropdown) dom.panelResultsDropdown.value = appState.currentPage;
}

export function initLocalMagnifier() {
    if (dom.magnifierCanvas && dom.magnifierGlass) {
        dom.magnifierGlass.style.width = `${LOCAL_MAGNIFIER_SIZE}px`;
        dom.magnifierGlass.style.height = `${LOCAL_MAGNIFIER_SIZE}px`;
        dom.magnifierCanvas.width = LOCAL_MAGNIFIER_SIZE * (window.devicePixelRatio || 1);
        dom.magnifierCanvas.height = LOCAL_MAGNIFIER_SIZE * (window.devicePixelRatio || 1);
    }
    if (dom.localMagnifierZoomSelector) {
        localMagnifierZoomLevel = parseFloat(dom.localMagnifierZoomSelector.value);
    }
}

export function toggleLocalMagnifier() {
    localMagnifierEnabled = !localMagnifierEnabled;
    deactivateAllModes({ except: 'localMagnifier' });
    appState.localMagnifierEnabled = localMagnifierEnabled;
    updatePageControls();
}

export function updateLocalMagnifier(clientX, clientY) {
    if (!localMagnifierEnabled || !dom.magnifierGlass || !dom.canvas) return;

    const canvasRect = dom.canvas.getBoundingClientRect();
    const magnifierRect = dom.magnifierGlass.getBoundingClientRect();
    
    const x = clientX - canvasRect.left;
    const y = clientY - canvasRect.top;

    if (x < 0 || y < 0 || x > canvasRect.width || y > canvasRect.height) {
        dom.magnifierGlass.style.display = 'none';
        return;
    }

    dom.magnifierGlass.style.display = 'block';
    dom.magnifierGlass.style.left = `${clientX - magnifierRect.width / 2}px`;
    dom.magnifierGlass.style.top = `${clientY - magnifierRect.height / 2}px`;

    const pixelRatio = window.devicePixelRatio || 1;
    const ctx = dom.localMagnifierCtx;
    ctx.clearRect(0, 0, dom.magnifierCanvas.width, dom.magnifierCanvas.height);
    
    const sourceX = (x * dom.canvas.width / dom.canvas.clientWidth) - (dom.magnifierCanvas.width / (2 * localMagnifierZoomLevel * pixelRatio));
    const sourceY = (y * dom.canvas.height / dom.canvas.clientHeight) - (dom.magnifierCanvas.height / (2 * localMagnifierZoomLevel * pixelRatio));
    
    const sourceWidth = dom.magnifierCanvas.width / (localMagnifierZoomLevel * pixelRatio);
    const sourceHeight = dom.magnifierCanvas.height / (localMagnifierZoomLevel * pixelRatio);

    const destWidth = dom.magnifierCanvas.width;
    const destHeight = dom.magnifierCanvas.height;
    
    ctx.drawImage(dom.canvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, destWidth, destHeight);
}


export function updateMagnifierZoomLevel(level) {
    localMagnifierZoomLevel = parseFloat(level);
}

export { currentPageTextContent, currentViewport };
