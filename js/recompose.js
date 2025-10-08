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

    const { PDFDocument } = window.PDFLib; // 確保 pdf-lib 已載入
    const newPdfDoc = await PDFDocument.create();
    const sortedPages = Array.from(selectedRecomposePages).sort((a, b) => a - b);

    try {
        // 建立一個 map 來避免重複載入同一個 PDF 的 ArrayBuffer
        const sourceDocs = new Map();

        for (const globalPageNum of sortedPages) {
            const pageInfo = getDocAndLocalPage(globalPageNum);
            if (!pageInfo) {
                console.warn(`Skipping invalid page ${globalPageNum}`);
                continue;
            }

            let sourcePdfDoc;
            // 檢查是否已經載入過這個來源 PDF
            if (sourceDocs.has(pageInfo.docIndex)) {
                sourcePdfDoc = sourceDocs.get(pageInfo.docIndex);
            } else {
                // 從 appState 取得我們儲存的 ArrayBuffer
                const sourcePdfBytes = appState.pdfArrayBuffers[pageInfo.docIndex];
                if (!sourcePdfBytes) {
                    console.warn(`ArrayBuffer for docIndex ${pageInfo.docIndex} not found. Skipping page.`);
                    continue;
                }
                // 使用 pdf-lib 載入 ArrayBuffer
                sourcePdfDoc = await PDFDocument.load(sourcePdfBytes);
                sourceDocs.set(pageInfo.docIndex, sourcePdfDoc);
            }
            
            // 從載入的來源 PDF 中複製頁面 (注意: pdf-lib 的頁碼是從 0 開始)
            const [copiedPage] = await newPdfDoc.copyPages(sourcePdfDoc, [pageInfo.localPage - 1]);
            
            // 將複製的頁面加入到我們的新 PDF 文件中
            newPdfDoc.addPage(copiedPage);
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
