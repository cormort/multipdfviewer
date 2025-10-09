// 從本地模組導入
import { dom, appState } from './state.js';
import { getDocAndLocalPage } from './viewer.js';
import { showFeedback } from './utils.js';

// --- Module-level State ---
let selectedRecomposePages = new Set();
let tocData = [];
let recomposeThumbnailObserver = null;

// --- Helper Function ---
async function getFirstLineOfText(globalPageNum) {
    const pageInfo = getDocAndLocalPage(globalPageNum);
    if (!pageInfo) return "未知頁面";
    try {
        const page = await pageInfo.doc.getPage(pageInfo.localPage);
        const textContent = await page.getTextContent();
        if (textContent.items.length > 0) {
            const firstTextItem = textContent.items.find(item => item.str.trim().length > 0);
            return firstTextItem ? firstTextItem.str.trim().substring(0, 50) : `第 ${globalPageNum} 頁`;
        }
        return `第 ${globalPageNum} 頁`;
    } catch (error) {
        console.error("獲取首行文字失敗:", error);
        return `第 ${globalPageNum} 頁 (錯誤)`;
    }
}

// --- UI and State Management ---
export function showRecomposePanel() {
    if (appState.pdfDocs.length === 0) {
        showFeedback('請先載入 PDF 檔案！');
        return;
    }
    dom.recomposePanel.style.display = 'flex';
    populateRecomposePageList();
    updateUiComponents();
}

export function hideRecomposePanel() {
    dom.recomposePanel.style.display = 'none';
    selectedRecomposePages.clear();
    tocData = [];
    dom.recomposePageList.innerHTML = '';
    dom.recomposeTocList.innerHTML = '';
    if (recomposeThumbnailObserver) {
        recomposeThumbnailObserver.disconnect();
    }
}

function updateUiComponents() {
    if (dom.selectedPagesCountSpan) {
        dom.selectedPagesCountSpan.textContent = selectedRecomposePages.size;
    }
    if (dom.generateNewPdfBtn) {
        dom.generateNewPdfBtn.disabled = selectedRecomposePages.size === 0;
    }
    renderTocList();
}

async function togglePageSelection(globalPage, element) {
    if (selectedRecomposePages.has(globalPage)) {
        selectedRecomposePages.delete(globalPage);
        element.classList.remove('selected');
        tocData = tocData.filter(item => item.globalPage !== globalPage);
    } else {
        selectedRecomposePages.add(globalPage);
        element.classList.add('selected');
        const defaultText = await getFirstLineOfText(globalPage);
        tocData.push({ globalPage, text: defaultText });
    }
    
    const sortedSelectedPages = Array.from(selectedRecomposePages).sort((a, b) => a - b);
    tocData.sort((a, b) => sortedSelectedPages.indexOf(a.globalPage) - sortedSelectedPages.indexOf(b.globalPage));
    
    tocData.forEach((item, index) => {
        item.newPageNum = index + 1;
    });

    updateUiComponents();
}

function renderTocList() {
    const tocList = dom.recomposeTocList;
    tocList.innerHTML = '';
    if (tocData.length === 0) {
        tocList.innerHTML = `<p class="toc-placeholder">選擇頁面後將在此處生成目次...</p>`;
        return;
    }
    tocData.forEach(item => {
        const tocItemDiv = document.createElement('div');
        tocItemDiv.className = 'toc-item';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control';
        input.value = item.text;
        input.oninput = (e) => { item.text = e.target.value; };
        const label = document.createElement('span');
        label.className = 'page-label';
        label.textContent = `→ 新頁碼 ${item.newPageNum + 1}`;
        tocItemDiv.appendChild(input);
        tocItemDiv.appendChild(label);
        tocList.appendChild(tocItemDiv);
    });
}

// --- Thumbnail List Population ---
function populateRecomposePageList() {
    dom.recomposePageList.innerHTML = '<p>載入頁面中...</p>';
    if (recomposeThumbnailObserver) recomposeThumbnailObserver.disconnect();
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
        img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        const pageLabel = document.createElement('div');
        pageLabel.className = 'page-label';
        pageLabel.textContent = `P.${globalPage}`;
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
        const scale = 150 / viewport.width;
        const scaledViewport = page.getViewport({ scale });
        const canvasEl = document.createElement('canvas');
        const thumbnailCtx = canvasEl.getContext('2d');
        canvasEl.height = scaledViewport.height;
        canvasEl.width = scaledViewport.width;
        const renderContext = { canvasContext: thumbnailCtx, viewport: scaledViewport };
        await page.render(renderContext).promise;
        imgElement.src = canvasEl.toDataURL('image/jpeg', 0.8);
    } catch (error) {
        console.error(`Failed to render thumbnail:`, error);
        imgElement.alt = "渲染失敗";
    }
}

// --- PDF Generation ---
export function triggerGeneratePdf(fileName) {
    generateNewPdf(fileName, tocData);
}

async function generateNewPdf(fileName, currentTocData) {
    if (selectedRecomposePages.size === 0) {
        showFeedback('請至少選擇一頁！');
        return;
    }
    dom.generateNewPdfBtn.disabled = true;
    dom.generateNewPdfBtn.innerHTML = '生成中...';

    // 從 window 物件獲取函式庫
    const { PDFDocument, rgb } = window.PDFLib;

    // 安全地等待 fontkit 載入
    const getFontkit = () => {
        return new Promise((resolve, reject) => {
            if (window.fontkit) return resolve(window.fontkit);
            let attempts = 0;
            const interval = setInterval(() => {
                if (window.fontkit) {
                    clearInterval(interval);
                    return resolve(window.fontkit);
                }
                attempts++;
                if (attempts > 50) { // Wait max 5 seconds
                    clearInterval(interval);
                    reject(new Error('字體引擎 fontkit 載入超時！'));
                }
            }, 100);
        });
    };

    try {
        const fontkit = await getFontkit();
        const newPdfDoc = await PDFDocument.create();
        newPdfDoc.registerFontkit(fontkit);

        const sortedPages = Array.from(selectedRecomposePages).sort((a, b) => a - b);

        const fontUrl = './fonts/SourceHanSansTC-Regular.otf';
        const fontBytes = await fetch(fontUrl).then(res => {
            if (!res.ok) throw new Error(`字體檔案載入失敗: ${res.status}`);
            return res.arrayBuffer();
        });
        const customFont = await newPdfDoc.embedFont(fontBytes);

        // 步驟 1: 創建目次頁
        const tocPage = newPdfDoc.addPage();
        const { width, height } = tocPage.getSize();
        let y = height - 70;
        tocPage.drawText('目次', { x: 50, y: y, font: customFont, size: 24, color: rgb(0, 0, 0) });
        y -= 40;
        currentTocData.forEach(item => {
            if (y < 50) return;
            const pageNumberText = `${item.newPageNum + 1}`;
            const lineText = `${item.text}`;
            const lineWidth = customFont.widthOfTextAtSize(lineText, 12);
            const pageNumWidth = customFont.widthOfTextAtSize(pageNumberText, 12);
            const dotsWidth = width - 100 - lineWidth - pageNumWidth - 10;
            const dots = '.'.repeat(Math.max(0, Math.floor(dotsWidth / customFont.widthOfTextAtSize('.', 12))));
            tocPage.drawText(`${lineText} ${dots} ${pageNumberText}`, { x: 60, y: y, font: customFont, size: 12, color: rgb(0.2, 0.2, 0.2) });
            y -= 20;
        });

        // 步驟 2: 複製頁面
        const sourceDocs = new Map();
        for (const globalPageNum of sortedPages) {
            const pageInfo = getDocAndLocalPage(globalPageNum);
            if (!pageInfo) continue;
            let sourcePdfDoc;
            if (sourceDocs.has(pageInfo.docIndex)) {
                sourcePdfDoc = sourceDocs.get(pageInfo.docIndex);
            } else {
                const sourcePdfBytes = appState.pdfArrayBuffers[pageInfo.docIndex];
                if (!sourcePdfBytes) continue;
                sourcePdfDoc = await PDFDocument.load(sourcePdfBytes);
                sourceDocs.set(pageInfo.docIndex, sourcePdfDoc);
            }
            const [copiedPage] = await newPdfDoc.copyPages(sourcePdfDoc, [pageInfo.localPage - 1]);
            newPdfDoc.addPage(copiedPage);
        }

        // 步驟 3: 保存下載
        const pdfBytes = await newPdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        showFeedback(`已生成新 PDF: ${link.download}`);
        hideRecomposePanel();

    } catch (error) {
        console.error('生成新 PDF 失敗:', error);
        showFeedback(`生成新 PDF 失敗: ${error.message}`);
    } finally {
        dom.generateNewPdfBtn.disabled = false;
        dom.generateNewPdfBtn.innerHTML = '生成 PDF 檔案';
    }
}
