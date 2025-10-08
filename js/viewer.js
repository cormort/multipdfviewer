import { dom, appState } from './app.js';
import { updatePageControls } from './ui.js';
import { getPatternFromSearchInput } from './utils.js';
import { deactivateAllModes } from './annotation.js';

// 模組內部狀態
let pageRendering = false;
let currentPageTextContent = null;
let currentViewport = null;
let localMagnifierEnabled = false;
const LOCAL_MAGNIFIER_SIZE = 120;
let localMagnifierZoomLevel = 2.0;

/**
 * 處理預先讀取好的檔案數據，使用 pdf.js 解析它們。
 * @param {Array<Object>} loadedFileData - 包含 { name, type, buffer } 的物件陣列。
 * @returns {Promise<Object|null>} 解析後的 PDF 數據或 null。
 */
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
        const bufferForPdfjs = originalBuffer.slice(0); // 為 pdf.js 創建副本
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

/**
 * 根據全局頁碼獲取對應的 PDF 文件實例和本地頁碼。
 * @param {number} globalPage - 全局頁碼。
 * @returns {Object|null} 包含 doc, localPage, docName, docIndex 的物件或 null。
 */
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

/**
 * 渲染指定頁碼的 PDF 頁面到畫布上。
 * @param {number} globalPageNum - 要渲染的全局頁碼。
 * @param {RegExp|null} highlightPattern - 用於高亮搜尋結果的正規表達式。
 */
export function renderPage(globalPageNum, highlightPattern = null) {
    if (appState.pdfDocs.length === 0 || !dom.pdfContainer || !dom.canvas || !dom.ctx) return;
    if (pageRendering) return; // 如果正在渲染，則不執行新的渲染請求

    pageRendering = true;
    currentPageTextContent = null;
    currentViewport = null;
    updatePageControls();
    
    if (dom.drawingCtx) dom.drawingCtx.clearRect(0, 0, dom.drawingCanvas.width, dom.drawingCanvas.height);
    // 注意: clearParagraphHighlights 應該在 annotation.js 中處理

    const pageInfo = getDocAndLocalPage(globalPageNum);
    if (!pageInfo) {
        pageRendering = false;
        updatePageControls();
        return;
    }

    const { doc, localPage } = pageInfo;

    doc.getPage(localPage).then(page => {
        let scaleForCss;
        if (appState.currentZoomMode === 'width') {
            scaleForCss = (dom.pdfContainer.clientWidth - 48) / page.getViewport({ scale: 1 }).width;
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
            console.error(`Error rendering page ${localPage} from doc ${pageInfo.docName}:`, reason);
        }).finally(() => {
            pageRendering = false;
            updatePageControls();
        });
    }).catch(reason => {
        console.error(`Error getting page ${localPage} from doc ${pageInfo.docName}:`, reason);
        pageRendering = false;
        updatePageControls();
    });
}

/**
 * 渲染文字圖層，使其可被選取和搜尋。
 * @param {PDFPageProxy} page - PDF.js 的頁面物件。
 * @param {PageViewport} viewport - 當前頁面的視圖。
 * @param {RegExp|null} highlightPattern - 用於高亮的正規表達式。
 */
function renderTextLayer(page, viewport, highlightPattern) {
    return page.getTextContent().then(textContent => {
        currentPageTextContent = textContent;
        dom.textLayerDivGlobal.innerHTML = '';
        
        const textLayer = document.createElement('div');
        textLayer.className = 'text-layer-inner';
        dom.textLayerDivGlobal.appendChild(textLayer);

        pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayer,
            viewport: viewport,
            textDivs: []
        });

        if (highlightPattern) {
            setTimeout(() => { // 等待 pdf.js 渲染完成
                const textDivs = textLayer.querySelectorAll('span');
                textDivs.forEach(textDiv => {
                    const newContent = textDiv.textContent.replace(highlightPattern, (match) => `<span class="wavy-underline">${match}</span>`);
                    if (newContent !== textDiv.textContent) {
                        textDiv.innerHTML = newContent;
                    }
                });
            }, 100);
        }
    }).catch(reason => console.error('Error rendering text layer:', reason));
}

/**
 * 跳轉到指定的全局頁碼。
 * @param {number} globalPageNum - 目標全局頁碼。
 * @param {RegExp|null} highlightPatternForPage - 用於高亮的正規表達式。
 */
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

// --- Magnifier Functions ---

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
    const wasActive = localMagnifierEnabled;
    deactivateAllModes();
    localMagnifierEnabled = !wasActive;
    appState.localMagnifierEnabled = localMagnifierEnabled; // 更新全局狀態
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

    const dpr = window.devicePixelRatio || 1;
    const scaleX = dom.canvas.width / dom.canvas.offsetWidth;
    const scaleY = dom.canvas.height / dom.canvas.offsetHeight;
    
    const srcX = pointXOnCanvas * scaleX;
    const srcY = pointYOnCanvas * scaleY;
    
    const srcRectPixelWidth = (LOCAL_MAGNIFIER_SIZE / localMagnifierZoomLevel) * scaleX;
    const srcRectPixelHeight = (LOCAL_MAGNIFIER_SIZE / localMagnifierZoomLevel) * scaleY;
    
    const srcRectX = srcX - (srcRectPixelWidth / 2);
    const srcRectY = srcY - (srcRectPixelHeight / 2);

    dom.localMagnifierCtx.clearRect(0, 0, dom.magnifierCanvas.width, dom.magnifierCanvas.height);
    dom.localMagnifierCtx.drawImage(dom.canvas, srcRectX, srcRectY, srcRectPixelWidth, srcRectPixelHeight, 0, 0, dom.magnifierCanvas.width, dom.magnifierCanvas.height);

    if (dom.drawingCanvas && dom.drawingCanvas.width > 0) {
        const drawScaleX = dom.drawingCanvas.width / dom.canvas.offsetWidth;
        const drawScaleY = dom.drawingCanvas.height / dom.canvas.offsetHeight;
        const drawSrcX = pointXOnCanvas * drawScaleX;
        const drawSrcY = pointYOnCanvas * drawScaleY;
        const drawSrcWidth = (LOCAL_MAGNIFIER_SIZE / localMagnifierZoomLevel) * drawScaleX;
        const drawSrcHeight = (LOCAL_MAGNIFIER_SIZE / localMagnifierZoomLevel) * drawScaleY;
        const drawSrcRectX = drawSrcX - (drawSrcWidth / 2);
        const drawSrcRectY = drawSrcY - (drawSrcHeight / 2);
        
        dom.localMagnifierCtx.drawImage(dom.drawingCanvas, drawSrcRectX, drawSrcRectY, drawSrcWidth, drawSrcHeight, 0, 0, dom.magnifierCanvas.width, dom.magnifierCanvas.height);
    }
    
    let magnifierTop = (pointYInContainer - LOCAL_MAGNIFIER_SIZE - 15);
    let magnifierLeft = (pointXInContainer - (LOCAL_MAGNIFIER_SIZE / 2));
    
    magnifierTop = Math.max(5, Math.min(magnifierTop, dom.pdfContainer.clientHeight - LOCAL_MAGNIFIER_SIZE - 5));
    magnifierLeft = Math.max(5, Math.min(magnifierLeft, dom.pdfContainer.clientWidth - LOCAL_MAGNIFIER_SIZE - 5));
    
    dom.magnifierGlass.style.top = `${magnifierTop + dom.pdfContainer.scrollTop}px`;
    dom.magnifierGlass.style.left = `${magnifierLeft + dom.pdfContainer.scrollLeft}px`;
}

export function updateMagnifierZoomLevel(level) {
    localMagnifierZoomLevel = parseFloat(level);
}

// 導出內部狀態，供其他模組（主要是 annotation.js）訪問
export { currentPageTextContent, currentViewport };
