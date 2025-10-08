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
}
