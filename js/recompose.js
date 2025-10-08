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
            // 簡單地取第一個文字項，並截斷長度
            return textContent.items[0].str.trim().substring(0, 50);
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
    // 更新已選頁數
    if (dom.selectedPagesCountSpan) {
        dom.selectedPagesCountSpan.textContent = selectedRecomposePages.size;
    }
    // 更新生成按鈕狀態
    if (dom.generateNewPdfBtn) {
        dom.generateNewPdfBtn.disabled = selectedRecomposePages.size === 0;
    }
    // 更新並渲染目次列表
    renderTocList();
}

async function togglePageSelection(globalPage, element) {
    if (selectedRecomposePages.has(globalPage)) {
        selectedRecomposePages.delete(globalPage);
        element.classList.remove('selected');
        // 從 tocData 中移除
        tocData = tocData.filter(item => item.globalPage !== globalPage);
    } else {
        selectedRecomposePages.add(globalPage);
        element.classList.add('selected');
        // 新增到 tocData
        const defaultText = await getFirstLineOfText(globalPage);
        tocData.push({ globalPage, text: defaultText });
    }
    
    // 根據選擇順序重新排序 tocData
    const sortedSelectedPages = Array.from(selectedRecomposePages).sort((a, b) => a - b);
    tocData.sort((a, b) => sortedSelectedPages.indexOf(a.globalPage) - sortedSelectedPages.indexOf(b.globalPage));
    
    // 分配新的頁碼
    tocData.forEach((item, index) => {
        item.newPageNum = index + 1; // 目次頁之後的第一頁是 1
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
            // 當用戶編輯時，即時更新 tocData
            item.text = e.target.value;
        };

        const label = document.createElement('span');
        label.className = 'page-label';
        label.textContent = `→ 新頁碼 ${item.newPageNum}`;

        tocItemDiv.appendChild(input);
        tocItemDiv.appendChild(label);
        tocList.appendChild(tocItemDiv);
    });
}

// --- Thumbnail List Population (與之前類似) ---
function populateRecomposePageList() {
    // ... (這部分的程式碼與您現有的版本基本相同，無需修改)
}
async function renderRecomposeThumbnail(docIndex, localPageNum, imgElement) {
    // ... (這部分的程式碼與您現有的版本基本相同，無需修改)
}

// --- PDF Generation ---

export function triggerGeneratePdf(fileName) {
    // 這是由 ui.js 呼叫的函數
    generateNewPdf(fileName, tocData);
}

async function generateNewPdf(fileName, currentTocData) {
    if (selectedRecomposePages.size === 0) {
        showFeedback('請至少選擇一頁！');
        return;
    }

    dom.generateNewPdfBtn.disabled = true;
    dom.generateNewPdfBtn.innerHTML = '生成中...';

    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const newPdfDoc = await PDFDocument.create();
    const sortedPages = Array.from(selectedRecomposePages).sort((a, b) => a - b);

    try {
        // **步驟 1: 創建並加入目次頁**
        const tocPage = newPdfDoc.addPage();
        const { width, height } = tocPage.getSize();
        const font = await newPdfDoc.embedFont(StandardFonts.Helvetica);
        const fontSizeTitle = 24;
        const fontSizeItem = 12;
        let y = height - 70;

        tocPage.drawText('目次', {
            x: 50,
            y: y,
            font,
            size: fontSizeTitle,
            color: rgb(0, 0, 0),
        });
        y -= 40;

        currentTocData.forEach(item => {
            if (y < 50) return; // 避免文字超出頁面
            tocPage.drawText(`${item.text} .................................... ${item.newPageNum + 1}`, { // 頁碼+1，因為目次是第1頁
                x: 60,
                y: y,
                font,
                size: fontSizeItem,
                color: rgb(0.2, 0.2, 0.2),
            });
            y -= 20;
        });

        // **步驟 2: 複製使用者選擇的頁面**
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

        // **步驟 3: 保存並下載**
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
        showFeedback('生成新 PDF 失敗！請參閱控制台。');
    } finally {
        dom.generateNewPdfBtn.disabled = false;
        dom.generateNewPdfBtn.innerHTML = '生成 PDF 檔案';
    }
}
