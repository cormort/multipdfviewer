// in js/recompose.js

import { dom, appState } from './state.js';
import { getDocAndLocalPage } from './viewer.js';
import { showFeedback } from './utils.js';

// --- Module-level State ---
let selectedRecomposePages = new Set();
let tocData = []; // New structure: [{ type, globalPage?, text, newPageNum?, id }]
let recomposeThumbnailObserver = null;

// --- Helper Functions ---

/**
 * 獲取指定 PDF 頁面的第一行完整文字。
 */
async function getFirstLineOfText(globalPageNum) {
    const pageInfo = getDocAndLocalPage(globalPageNum);
    if (!pageInfo) return "未知頁面";

    try {
        const page = await pageInfo.doc.getPage(pageInfo.localPage);
        const textContent = await page.getTextContent();
        if (textContent.items.length === 0) return `第 ${globalPageNum} 頁`;

        const firstItem = textContent.items.find(item => item.str.trim().length > 0);
        if (!firstItem) return `第 ${globalPageNum} 頁`;

        const yPos = firstItem.transform[5];
        const tolerance = firstItem.height * 0.2; // 允許的 Y 軸誤差

        const lineItems = textContent.items
            .filter(item => Math.abs(item.transform[5] - yPos) < tolerance)
            .sort((a, b) => a.transform[4] - b.transform[4]); // 按 X 軸排序

        return lineItems.map(item => item.str).join('').trim().substring(0, 80);
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
    // 綁定新按鈕的事件
    document.getElementById('add-chapter-btn').onclick = addChapter;
    document.getElementById('export-toc-btn').onclick = exportToc;
    document.getElementById('import-toc-input').onchange = importToc;

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
    // 清除事件，避免記憶體洩漏
    document.getElementById('import-toc-input').value = null;
}

function updateUiComponents() {
    // 重新計算頁碼
    let currentPageCounter = 1;
    tocData.forEach(item => {
        if (item.type === 'page') {
            item.newPageNum = currentPageCounter++;
        }
    });

    if (dom.selectedPagesCountSpan) {
        dom.selectedPagesCountSpan.textContent = selectedRecomposePages.size;
    }
    if (dom.generateNewPdfBtn) {
        dom.generateNewPdfBtn.disabled = selectedRecomposePages.size === 0;
    }
    renderTocList();
}

async function togglePageSelection(globalPage, element) {
    const isSelected = selectedRecomposePages.has(globalPage);
    if (isSelected) {
        selectedRecomposePages.delete(globalPage);
        element.classList.remove('selected');
        tocData = tocData.filter(item => item.globalPage !== globalPage);
    } else {
        selectedRecomposePages.add(globalPage);
        element.classList.add('selected');
        const defaultText = await getFirstLineOfText(globalPage);
        tocData.push({ type: 'page', globalPage, text: defaultText, id: `page-${globalPage}` });
    }
    
    // 保持 tocData 與 selectedRecomposePages 的順序一致 (按原始頁碼排序)
    tocData.sort((a, b) => {
        const aIndex = a.type === 'page' ? a.globalPage : Infinity;
        const bIndex = b.type === 'page' ? b.globalPage : Infinity;
        return aIndex - bIndex;
    });

    updateUiComponents();
}

function renderTocList() {
    const tocList = dom.recomposeTocList;
    tocList.innerHTML = '';

    if (tocData.length === 0) {
        tocList.innerHTML = `<p class="toc-placeholder">選擇頁面或新增章節...</p>`;
        return;
    }

    tocData.forEach((item, index) => {
        const tocItemDiv = document.createElement('div');
        tocItemDiv.className = 'toc-item';
        tocItemDiv.classList.toggle('is-chapter', item.type === 'chapter');

        // 刪除按鈕
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-item-btn';
        deleteBtn.innerHTML = '<i class="fas fa-times-circle"></i>';
        deleteBtn.onclick = () => deleteTocItem(item.id);
        
        // 原始頁碼標籤 (僅頁面有)
        if (item.type === 'page') {
            const originalPageLabel = document.createElement('span');
            originalPageLabel.className = 'original-page-label';
            originalPageLabel.textContent = `P.${item.globalPage}`;
            tocItemDiv.appendChild(originalPageLabel);
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control';
        input.value = item.text;
        input.placeholder = item.type === 'chapter' ? '輸入章節標題...' : '';
        input.oninput = (e) => { item.text = e.target.value; };

        tocItemDiv.appendChild(input);

        // 新頁碼標籤 (僅頁面有)
        if (item.type === 'page') {
            const newPageLabel = document.createElement('span');
            newPageLabel.className = 'page-label';
            newPageLabel.textContent = `→ 新頁碼 ${item.newPageNum + 1}`;
            tocItemDiv.appendChild(newPageLabel);
        }
        
        tocItemDiv.appendChild(deleteBtn);
        tocList.appendChild(tocItemDiv);
    });
}

// --- New TOC Actions ---

function addChapter() {
    tocData.push({ type: 'chapter', text: '新章節', id: `ch-${Date.now()}` });
    updateUiComponents();
}

function deleteTocItem(id) {
    const itemToDelete = tocData.find(item => item.id === id);
    if (itemToDelete && itemToDelete.type === 'page') {
        selectedRecomposePages.delete(itemToDelete.globalPage);
        // 更新縮圖的選中狀態
        const thumb = dom.recomposePageList.querySelector(`[data-global-page="${itemToDelete.globalPage}"]`);
        if (thumb) thumb.classList.remove('selected');
    }
    tocData = tocData.filter(item => item.id !== id);
    updateUiComponents();
}

function exportToc() {
    if (tocData.length === 0) {
        showFeedback("目次是空的！");
        return;
    }
    let textContent = "";
    tocData.forEach(item => {
        if (item.type === 'page') {
            textContent += `PAGE: ${item.globalPage} | ${item.text}\n`;
        } else {
            textContent += `CHAPTER: ${item.text}\n`;
        }
    });

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'toc_export.txt';
    link.click();
    URL.revokeObjectURL(link.href);
}

function importToc(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const newTocData = [];
        const newSelectedPages = new Set();
        const lines = text.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
            if (line.startsWith('CHAPTER: ')) {
                newTocData.push({ type: 'chapter', text: line.substring(9).trim(), id: `ch-${Date.now()}-${Math.random()}` });
            } else if (line.startsWith('PAGE: ')) {
                const parts = line.substring(6).split('|');
                if (parts.length === 2) {
                    const globalPage = parseInt(parts[0].trim(), 10);
                    const text = parts[1].trim();
                    // 驗證頁面是否存在
                    if (!isNaN(globalPage) && getDocAndLocalPage(globalPage)) {
                        newSelectedPages.add(globalPage);
                        newTocData.push({ type: 'page', globalPage, text, id: `page-${globalPage}` });
                    }
                }
            }
        }
        
        tocData = newTocData;
        selectedRecomposePages = newSelectedPages;
        
        // 更新縮圖選中狀態
        dom.recomposePageList.querySelectorAll('.recompose-thumbnail-item').forEach(thumb => {
            const page = parseInt(thumb.dataset.globalPage, 10);
            thumb.classList.toggle('selected', selectedRecomposePages.has(page));
        });

        updateUiComponents();
        showFeedback("目次已匯入！");
    };
    reader.readAsText(file);
}


// --- Thumbnail List Population (No changes needed) ---
function populateRecomposePageList() { /* ... */ }
async function renderRecomposeThumbnail(docIndex, localPageNum, imgElement) { /* ... */ }


// --- PDF Generation ---
export function triggerGeneratePdf(fileName) {
    generateNewPdf(fileName, tocData);
}

async function generateNewPdf(fileName, currentTocData) {
    if (currentTocData.filter(i => i.type === 'page').length === 0) {
        showFeedback('請至少選擇一個頁面！');
        return;
    }
    dom.generateNewPdfBtn.disabled = true;
    dom.generateNewPdfBtn.innerHTML = '生成中...';

    const { PDFDocument, rgb, PageSizes } = window.PDFLib;

    try {
        const fontkit = await getFontkit(); // Assuming getFontkit exists
        const newPdfDoc = await PDFDocument.create();
        newPdfDoc.registerFontkit(fontkit);

        const fontUrl = './fonts/BiauKai.ttf';
        const fontBytes = await fetch(fontUrl).then(res => res.ok ? res.arrayBuffer() : Promise.reject(`字體檔案載入失敗: ${res.status}`));
        const customFont = await newPdfDoc.embedFont(fontBytes);

        // 步驟 1: 創建橫版目次頁
        const tocPage = newPdfDoc.addPage(PageSizes.A4.reverse()); // A4 Landscape
        const { width, height } = tocPage.getSize();
        let y = height - 70;

        tocPage.drawText('目次', { x: 50, y, font: customFont, size: 24, color: rgb(0, 0, 0) });
        y -= 40;

        currentTocData.forEach(item => {
            if (y < 50) return;
            if (item.type === 'chapter') {
                tocPage.drawText(item.text, { x: 60, y, font: customFont, size: 14, color: rgb(0.1, 0.1, 0.1) });
                y -= 25; // Chapter has more space
            } else {
                const pageNumberText = `${item.newPageNum + 1}`;
                const lineText = `${item.text}`;
                const lineWidth = customFont.widthOfTextAtSize(lineText, 12);
                const pageNumWidth = customFont.widthOfTextAtSize(pageNumberText, 12);
                const dotsWidth = width - 100 - lineWidth - pageNumWidth - 10;
                const dots = '.'.repeat(Math.max(0, Math.floor(dotsWidth / customFont.widthOfTextAtSize('.', 12))));
                tocPage.drawText(`${lineText} ${dots} ${pageNumberText}`, { x: 60, y, font: customFont, size: 12, color: rgb(0.2, 0.2, 0.2) });
                y -= 20;
            }
        });

        // 步驟 2: 複製頁面
        const pagesToCopy = currentTocData.filter(i => i.type === 'page');
        const sourceDocs = new Map();
        for (const item of pagesToCopy) {
            const pageInfo = getDocAndLocalPage(item.globalPage);
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
        link.click();
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

// Assuming getFontkit is defined somewhere, if not, add it here.
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
