// in js/recompose.js

import { dom, appState } from './state.js';
import { get對此疏忽感到非常抱歉。

---

### 解決方案

我們只需要將 `populateRecomposePageListDocAndLocalPage } from './viewer.js';
import { showFeedback } from './utils.js';

` 和 `renderRecomposeThumbnail` 這兩個函數的完整程式碼，放回到 `js/recompose.js` 檔案中即可。

---

### 步驟：修改 `js/recompose.js`

請打開您的 `js/recompose.js` 檔案。您會看到裡面有這兩個函數的空殼或註解。

**請用以下完整的程式碼，替換掉您 `js/recompose.js` 檔案中對應的 `populatelet selectedRecomposePages = new Set();
let tocData = []; // 儲存目次資訊: [{ globalPage, text, newPageNum }]
let recomposeThumbnailObserver = null;

// --- Helper Function ---RecomposePageList` 和 `renderRecomposeThumbnail` 函數。**

```javascript
// in js/recompose.js

// ... (檔案頂部的 import 和變數定義保持不變) ...

// --- UI and
/**
 * 獲取指定 PDF 頁面的第一行文字作為預設目次標題。
 * @param {number} globalPageNum - 全局頁碼。
 * @returns {Promise<string>} 頁面的第一行文字。
 */
async function getFirstLineOfText(globalPageNum) {
    const pageInfo = getDocAndLocalPage(globalPageNum);
    if (!pageInfo) return "未知頁面"; State Management ---

// ... (showRecomposePanel, hideRecomposePanel, updateUiComponents, togglePageSelection, renderTocList 這些函數都保持不變) ...


// --- Thumbnail List Population (這是需要被填充的部分) ---

    try {
        const page = await pageInfo.doc.getPage(pageInfo.localPage);
        

/**
 * 填充重新組成面板中的頁面縮圖列表。
 */
function populateRecomposePageListconst textContent = await page.getTextContent();
        if (textContent.items.length > 0) {
            const firstTextItem = textContent.items.find(item => item.str.trim().length > 0);
            return firstTextItem ? firstTextItem.str.trim().substring(0, 50) : `第 ${globalPageNum} 頁`;
        }
        return `第 ${globalPageNum} () {
    dom.recomposePageList.innerHTML = '<p style="padding: 10px; text-align: center;">載入頁面中...</p>';

    if (recomposeThumbnailObserver) {
        recomposeThumbnailObserver.disconnect();
    }

    recomposeThumbnailObserver = new IntersectionObserver((entries, observer) => {
        entries頁`;
    } catch (error) {
        console.error("獲取首行文字失敗:", error);
        return `第 ${globalPageNum} 頁 (錯誤)`;
    }
}

// --- UI and.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target.querySelector('img');
                const docIndex = parseInt(img.dataset.docIndex, 10);
 State Management ---

export function showRecomposePanel() {
    if (appState.pdfDocs.length === 0) {
        showFeedback('請先載入 PDF 檔案！');
        return;
    }
    dom.recomposePanel.style.display = 'flex';
    populateRecomposePageList(); // <--                const localPage = parseInt(img.dataset.localPage, 10);
                renderRecomposeThumbnail(docIndex, localPage, img);
                observer.unobserve(entry.target);
            }
        });
    }, { root: dom.recomposePageList, rootMargin: '0px 0px 2 確保呼叫這個函數
    updateUiComponents();
}

export function hideRecomposePanel() {
    dom.recomposePanel.style.display = 'none';
    selectedRecomposePages.clear();
    tocData = [];00px 0px' });

    dom.recomposePageList.innerHTML = ''; // 清空載入中訊息

    for (let globalPage = 1; globalPage <= appState.globalTotalPages; globalPage++)
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
        element.classList.remove('selected {
        const pageInfo = getDocAndLocalPage(globalPage);
        if (!pageInfo) continue;

        const thumbnailItem = document.createElement('div');
        thumbnailItem.className = 'recompose-thumbnail-item';
        thumbnailItem.dataset.globalPage = globalPage;

        const img = document.createElement('img');
        img.dataset.docIndex = pageInfo.docIndex;
        img.dataset.localPage = pageInfo.localPage;
        img.alt = `Page ${globalPage}`;
        // 使用一個透明的 1x1 pixel GIF 作為佔位符，避免 404 錯誤
        img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/AC');
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
        tocList.innerHTML = `<p class="toc-placeholder">選擇頁面後將在此處生成目wAAAAAAQABAAACADs='; 

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

/**
 * 渲染單個頁面的縮圖到指定的 img 元素上。
 * @param {number} docIndex - 檔案索引。
 * @次...</p>`;
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
        label.classNameparam {number} localPageNum - 本地頁碼。
 * @param {HTMLImageElement} imgElement - 目標 img 元素。
 */
async function renderRecomposeThumbnail(docIndex, localPageNum, imgElement) {
    try {
        const doc = appState.pdfDocs[docIndex];
        if (!doc) return;
        
        const page = await doc.getPage(localPageNum);
        const viewport = page.getViewport({ scale: 1 });
        const THUMBNAIL_WIDTH = 150; //  = 'page-label';
        label.textContent = `→ 新頁碼 ${item.newPageNum + 1}`; // 頁碼+1，因為目次是第1頁

        tocItemDiv.appendChild(input);
        tocItemDiv.appendChild(label);
        tocList.appendChild(tocItemDiv);
    });
}

// --- Thumbnail List Population (恢復並修正這部分) ---

/**
 * 填充重新組成面板中的頁面縮圖列表。
 */
function populateRecomposePageList() {
    dom.recomposePageList.innerHTML = '<p style="padding: 10px; text-align: center;">載入頁面中...</p>';
縮圖的固定寬度
        const scale = THUMBNAIL_WIDTH / viewport.width;
        const scaledViewport = page.getViewport({ scale: scale });

        const canvasEl = document.createElement('canvas');
        const thumbnailCtx = canvasEl.getContext('2d');
        canvasEl.height = scaledViewport.height;
        canvasEl.width = scaledViewport.width;
        
        const renderContext = { canvasContext: thumbnailCtx, viewport: scaledViewport };
        await page.render(renderContext).promise;
        
        // 使用 JPEG 格式以獲得更好的壓縮率
        const dataUrl = canvasEl.toDataURL('image/jpeg', 0.8);
        imgElement.src = dataUrl;

    } catch (error) {
        console.error(`Failed to render recompose thumbnail for doc ${docIndex} page ${localPageNum}:`, error);
            selectedRecomposePages.clear();
    tocData = [];

    if (recomposeThumbnailObserver) {
        recomposeThumbnailObserver.disconnect();
    }

    recomposeThumbnailObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // 可以在這裡設置一個錯誤狀態的圖片
        imgElement.alt = "渲染失敗";
    }
}


// --- PDF Generation ---

// ... (triggerGeneratePdf 和 generateNewPdf 函數保持不變) ...
const img = entry.target.querySelector('img');
                const docIndex = parseInt(img.dataset.docIndex, 10);
                const localPage = parseInt(img.dataset.localPage, 10);
                renderRecomposeThumbnail(docIndex, localPage, img);
                observer.unobserve(entry.target);
