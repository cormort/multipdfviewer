import { dom, appState } from './state.js';
import { updatePageControls } from './ui.js';
import { getPatternFromSearchInput } from './utils.js';
import { deactivateAllModes } from './annotation.js';
import { TextLayer } from '../libs/pdf.js/pdf.mjs';

let pageRendering = false;
let currentPageTextContent = null;
let currentViewport = null;

export async function loadAndProcessFiles(loadedFileData) {
    if (!loadedFileData || !Array.isArray(loadedFileData)) return null;
    deactivateAllModes();
    
    const loadingPromises = loadedFileData.map(item => {
        const typedarray = new Uint8Array(item.buffer);
        // **修正點：加入 cMapUrl 和 cMapPacked 參數來解決亞洲字體警告**
        const loadingTask = pdfjsLib.getDocument({
            data: typedarray,
            cMapUrl: "https://unpkg.com/pdfjs-dist@4.4.168/cmaps/",
            cMapPacked: true,
        });
        return loadingTask.promise.then(pdf => {
            return { pdf, name: item.name, buffer: item.buffer };
        }).catch(reason => {
            console.error(`載入檔案 ${item.name} 時發生錯誤:`, reason);
            return null;
        });
    });

    const results = await Promise.all(loadingPromises);
    const loadedPdfs = results.filter(r => r !== null);
    
    if (loadedPdfs.length === 0) return null;

    const newPdfDocs = [], newPageMap = [], newPdfArrayBuffers = []; 
    loadedPdfs.forEach((result, docIndex) => {
        newPdfDocs.push(result.pdf);
        for (let i = 1; i <= result.pdf.numPages; i++) {
            newPageMap.push({ docIndex, localPage: i, docName: result.name });
        }
        newPdfArrayBuffers.push(result.buffer);
    });

    return { pdfDocs: newPdfDocs, pageMap: newPageMap, globalTotalPages: newPageMap.length, pdfArrayBuffers: newPdfArrayBuffers };
}

export function getDocAndLocalPage(globalPage) {
    if (globalPage < 1 || globalPage > appState.globalTotalPages) return null;
    return appState.pageMap[globalPage - 1];
}

export function renderPage(globalPageNum) {
    const highlightPattern = getPatternFromSearchInput(dom.searchInputElem);
    if (appState.pdfDocs.length === 0 || pageRendering) return;

    pageRendering = true;
    updatePageControls();

    const pageMapping = getDocAndLocalPage(globalPageNum);
    if (!pageMapping) {
        pageRendering = false;
        console.warn(`找不到頁面映射: ${globalPageNum}`);
        return;
    }

    const { docIndex, localPage } = pageMapping;
    const doc = appState.pdfDocs[docIndex];

    doc.getPage(localPage).then(page => {
        if (appState.currentZoomMode === 'width' && dom.pdfViewWrapper) {
            appState.currentScale = (dom.pdfViewWrapper.clientWidth - 48) / page.getViewport({ scale: 1 }).width;
        } else if (appState.currentZoomMode === 'height' && dom.pdfViewWrapper) {
            appState.currentScale = (dom.pdfViewWrapper.clientHeight - 48) / page.getViewport({ scale: 1 }).height;
        }

        const viewport = page.getViewport({ scale: appState.currentScale });
        currentViewport = viewport;

        // **修正點：在設定寬高前，確保 dom.canvas 存在**
        if (!dom.canvas || !dom.ctx || !dom.textLayerDivGlobal) {
            console.error("Canvas 或 TextLayer 元素未找到！");
            pageRendering = false;
            return;
        }

        dom.canvas.width = viewport.width;
        dom.canvas.height = viewport.height;
        dom.textLayerDivGlobal.style.width = `${viewport.width}px`;
        dom.textLayerDivGlobal.style.height = `${viewport.height}px`;

        const renderContext = { canvasContext: dom.ctx, viewport };
        
        page.render(renderContext).promise.then(() => {
            return renderTextLayer(page, viewport, highlightPattern);
        }).catch(err => {
            console.error('頁面渲染失敗:', err);
        }).finally(() => {
            pageRendering = false;
            updatePageControls();
        });
    }).catch(reason => {
        console.error(`取得頁面時發生錯誤:`, reason);
        pageRendering = false;
    });
}

function renderTextLayer(page, viewport, highlightPattern) {
    return page.getTextContent().then(textContent => {
        currentPageTextContent = textContent;
        if (dom.textLayerDivGlobal) {
            dom.textLayerDivGlobal.innerHTML = '';
            const textLayer = new TextLayer({ textContentSource: textContent, container: dom.textLayerDivGlobal, viewport });
            return textLayer.render().then(() => {
                if (highlightPattern && appState.showSearchResultsHighlights) {
                    const textSpans = dom.textLayerDivGlobal.querySelectorAll('span');
                    textSpans.forEach(span => {
                        const originalText = span.textContent;
                        if (originalText) {
                            const newHtml = originalText.replace(highlightPattern, (match) => `<span class="wavy-underline">${match}</span>`);
                            if (newHtml !== originalText) span.innerHTML = newHtml;
                        }
                    });
                }
            });
        }
    }).catch(reason => console.error('渲染文字圖層時發生錯誤:', reason));
}

export function goToPage(globalPageNum) {
    const n = Math.max(1, Math.min(globalPageNum, appState.globalTotalPages));
    if (isNaN(n)) return;
    
    appState.currentPage = n;
    renderPage(appState.currentPage);
}

export { currentPageTextContent, currentViewport };
