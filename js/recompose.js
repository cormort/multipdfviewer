// in js/recompose.js

import { dom, appState } from './state.js';
import { getDocAndLocalPage } from './viewer.js';
import { showFeedback } from './utils.js';

let selectedRecomposePages = new Set();
let tocData = []; // 儲存目次資訊: [{ globalPage, text, newPageNum }]
let recomposeThumbnailObserver = null;

// --- Helper Function ---
/**
 * 獲取指定 PDF 頁面的第一行文字作為預設目次標題。
 * @param {number} globalPageNum - 全局頁碼。
 * @returns {Promise<string>} 頁面的第一行文字。
 */
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
        input.oninput = (e) => {
            item.text = e.target.value;
        };

        const label = document.createElement('span');
        label.className = 'page-label';
        label.textContent = `→ 新頁碼 ${item.newPageNum + 1}`; // 頁碼+1，因為目次是第1頁

        tocItemDiv.appendChild(input);
        tocItemDiv.appendChild(label);
        tocList.appendChild(tocItemDiv);
    });
}

// --- Thumbnail List Population ---

function populateRecomposePageList() {
    dom.recomposePageList.innerHTML = '<p style="padding: 10px; text-align: center;">載入頁面中...</p>';

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
        img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; // 透明佔位符

        const pageLabel = document.createElement('div');
        pageLabel.className = 'page-label';
        const cleanName = pageInfo.docName.replace(/\.pdf$/i, '');
        pageLabel.textContent = `P.${globalPage}`;
        pageLabel.title = `檔案: ${cleanName}, 本地頁: ${pageInfo.localPage}`;

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
        console.error(`Failed to render recompose thumbnail for doc ${docIndex} page ${localPageNum}:`, error);
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

    // **變更點 1: 從 window 物件中獲取 PDFDocument 和 fontkit**
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const fontkit = window.fontkit;

    if (!fontkit) {
        showFeedback('字體引擎 fontkit 載入失敗！');
        console.error('fontkit is not loaded. Please check the script tag in your HTML.');
        dom.generateNewPdfBtn.disabled = false;
        dom.generateNewPdfBtn.innerHTML = '生成 PDF 檔案';
        return;
    }

    const newPdfDoc = await PDFDocument.create();
    
    // **變更點 2: 在創建 PDF 後，立刻註冊 fontkit**
    newPdfDoc.registerFontkit(fontkit);

    const sortedPages = Array.from(selectedRecomposePages).sort((a, b) => a - b);

    try {
        // 載入本地的中文字體檔案
        const fontUrl = './fonts/BiauKai.ttf'; // <-- 確保這個路徑在您的 GitHub 倉庫中是正確的！
        const fontBytes = await fetch(fontUrl).then(res => {
            if (!res.ok) {
                throw new Error(`字體檔案載入失敗: ${res.status} ${res.statusText}`);
            }
            return res.arrayBuffer();
        });
        
        // 將字體嵌入到 PDF 文件中
        const customFont = await newPdfDoc.embedFont(fontBytes);

        // ... (後續創建目次頁、複製頁面、保存下載的程式碼完全不需要修改) ...
        // ...
        
        // 步驟 1: 創建並加入目次頁
        const tocPage = newPdfDoc.addPage();
        // ... (繪製文字的邏輯完全相同)

        // 步驟 2: 複製使用者選擇的頁面
        // ... (複製頁面的邏輯完全相同)

        // 步驟 3: 保存並下載
        // ... (保存下載的邏輯完全相同)

    } catch (error) {
        console.error('生成新 PDF 失敗:', error);
        showFeedback(`生成新 PDF 失敗: ${error.message}`);
    } finally {
        dom.generateNewPdfBtn.disabled = false;
        dom.generateNewPdfBtn.innerHTML = '生成 PDF 檔案';
    }
}
