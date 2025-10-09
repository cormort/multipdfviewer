import { dom, appState } from './state.js';
import { getDocAndLocalPage } from './viewer.js';
import { showFeedback } from './utils.js';

// --- Module-level State ---
let selectedRecomposePages = new Set();
let tocData = [];
let recomposeThumbnailObserver = null;
let sortableInstance = null;
let lastSelectedPage = -1;

// --- Helper Functions ---
async function getFirstLineOfText(globalPageNum) {
    const pageInfo = getDocAndLocalPage(globalPageNum);
    if (!pageInfo) return "未知頁面";
    try {
        const page = await pageInfo.doc.getPage(pageInfo.localPage);
        const textContent = await page.getTextContent();
        if (textContent.items.length === 0) return `第 ${globalPageNum} 頁`;
        const sortedItems = [...textContent.items].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
        const lines = [];
        if (sortedItems.length > 0) {
            let currentLine = [sortedItems[0]];
            for (let i = 1; i < sortedItems.length; i++) {
                if (Math.abs(sortedItems[i].transform[5] - currentLine[0].transform[5]) < 2) {
                    currentLine.push(sortedItems[i]);
                } else {
                    lines.push(currentLine.map(item => item.str).join(''));
                    currentLine = [sortedItems[i]];
                }
            }
            lines.push(currentLine.map(item => item.str).join(''));
        }
        for (const lineText of lines) {
            const trimmedLine = lineText.trim();
            if (trimmedLine.length === 0) continue;
            const isLikelyPageNumber = trimmedLine.length <= 10 && /^\s*[\d\s-–—]+\s*$/.test(trimmedLine);
            if (!isLikelyPageNumber) return trimmedLine.substring(0, 80);
        }
        return lines.length > 0 ? lines[0].trim().substring(0, 80) : `第 ${globalPageNum} 頁`;
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
    document.getElementById('add-chapter-btn').onclick = addChapter;
    document.getElementById('export-toc-btn').onclick = exportToc;
    document.getElementById('import-toc-input').onchange = importToc;
    
    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(dom.recomposeTocList, {
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'sortable-ghost',
        onEnd: (evt) => {
            const movedItem = tocData.splice(evt.oldIndex, 1)[0];
            tocData.splice(evt.newIndex, 0, movedItem);
            updateUiComponents();
        }
    });

    populateRecomposePageList();
    updateUiComponents();
}

export function hideRecomposePanel() {
    dom.recomposePanel.style.display = 'none';
    selectedRecomposePages.clear();
    tocData = [];
    lastSelectedPage = -1;
    dom.recomposePageList.innerHTML = '';
    dom.recomposeTocList.innerHTML = '';
    if (recomposeThumbnailObserver) recomposeThumbnailObserver.disconnect();
    if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
    }
    document.getElementById('import-toc-input').value = null;
}

function updateUiComponents() {
    let currentPageCounter = 1;
    tocData.forEach(item => {
        if (item.type === 'page') {
            item.newPageNum = currentPageCounter++;
        }
    });
    if (dom.selectedPagesCountSpan) dom.selectedPagesCountSpan.textContent = selectedRecomposePages.size;
    if (dom.generateNewPdfBtn) dom.generateNewPdfBtn.disabled = selectedRecomposePages.size === 0;
    
    dom.recomposePageList.querySelectorAll('.recompose-thumbnail-item').forEach(thumb => {
        const page = parseInt(thumb.dataset.globalPage, 10);
        const checkbox = thumb.querySelector('.thumbnail-checkbox');
        if (checkbox) {
            checkbox.checked = selectedRecomposePages.has(page);
        }
    });

    renderTocList();
}

async function togglePageSelection(globalPage, element, event) {
    if (event.shiftKey && lastSelectedPage > 0) {
        const start = Math.min(lastSelectedPage, globalPage);
        const end = Math.max(lastSelectedPage, globalPage);
        const pagesToSelect = [];
        for (let i = start; i <= end; i++) {
            if (!selectedRecomposePages.has(i)) {
                pagesToSelect.push(i);
            }
        }
        for (const pageNum of pagesToSelect) {
            selectedRecomposePages.add(pageNum);
            const defaultText = await getFirstLineOfText(pageNum);
            tocData.push({ type: 'page', globalPage: pageNum, text: defaultText, id: `page-${pageNum}` });
        }
    } else {
        const isSelected = selectedRecomposePages.has(globalPage);
        if (isSelected) {
            selectedRecomposePages.delete(globalPage);
            tocData = tocData.filter(item => item.globalPage !== globalPage);
        } else {
            selectedRecomposePages.add(globalPage);
            const defaultText = await getFirstLineOfText(globalPage);
            tocData.push({ type: 'page', globalPage, text: defaultText, id: `page-${globalPage}` });
        }
    }
    
    lastSelectedPage = globalPage;

    tocData.sort((a, b) => {
        const aVal = a.type === 'page' ? a.globalPage : Infinity;
        const bVal = b.type === 'page' ? b.globalPage : Infinity;
        if (aVal === Infinity && bVal === Infinity) return 0;
        return aVal - bVal;
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
    tocData.forEach((item) => {
        const tocItemDiv = document.createElement('div');
        tocItemDiv.className = 'toc-item';
        tocItemDiv.classList.toggle('is-chapter', item.type === 'chapter');
        
        const dragHandle = document.createElement('span');
        dragHandle.className = 'drag-handle';
        dragHandle.innerHTML = '<i class="fas fa-grip-vertical"></i>';
        tocItemDiv.appendChild(dragHandle);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-item-btn';
        deleteBtn.innerHTML = '<i class="fas fa-times-circle"></i>';
        deleteBtn.onclick = () => deleteTocItem(item.id);

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
        if (item.type === 'page') {
            const newPageLabel = document.createElement('span');
            newPageLabel.className = 'page-label';
            newPageLabel.textContent = `→ 新頁碼 ${item.newPageNum + (dom.addTocCheckbox.checked ? 1 : 0)}`;
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
                    if (!isNaN(globalPage) && getDocAndLocalPage(globalPage)) {
                        newSelectedPages.add(globalPage);
                        newTocData.push({ type: 'page', globalPage, text, id: `page-${globalPage}` });
                    }
                }
            }
        }
        tocData = newTocData;
        selectedRecomposePages = newSelectedPages;
        updateUiComponents();
        showFeedback("目次已匯入！");
    };
    reader.readAsText(file);
}

// --- Thumbnail List Population ---
function populateRecomposePageList() {
    dom.recomposePageList.innerHTML = '<p style="padding: 10px; text-align: center;">載入頁面中...</p>';
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
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'thumbnail-checkbox';
        thumbnailItem.appendChild(checkbox);

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
        thumbnailItem.addEventListener('click', (event) => togglePageSelection(globalPage, thumbnailItem, event));
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
    const addToc = dom.addTocCheckbox.checked;
    const addPageNumbers = dom.addNewPagenumberCheckbox.checked;
    generateNewPdf(fileName, tocData, addToc, addPageNumbers);
}

async function generateNewPdf(fileName, currentTocData, addToc, addPageNumbers) {
    if (currentTocData.filter(i => i.type === 'page').length === 0) {
        showFeedback('請至少選擇一個頁面！');
        return;
    }
    dom.generateNewPdfBtn.disabled = true;
    dom.generateNewPdfBtn.innerHTML = '生成中...';

    const { PDFDocument, rgb, PageSizes } = window.PDFLib;

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
                if (attempts > 50) {
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

        const fontUrl = './fonts/SourceHanSansTC-Regular.otf';
        const fontBytes = await fetch(fontUrl).then(res => res.ok ? res.arrayBuffer() : Promise.reject(`字體檔案載入失敗: ${res.status}`));
        const customFont = await newPdfDoc.embedFont(fontBytes);

        if (addToc) {
            const tocPage = newPdfDoc.addPage(PageSizes.A4.reverse());
            const { width, height } = tocPage.getSize();
            let y = height - 70;
            tocPage.drawText('目次', { x: 50, y, font: customFont, size: 24, color: rgb(0, 0, 0) });
            y -= 40;
            currentTocData.forEach(item => {
                if (y < 50) return;
                if (item.type === 'chapter') {
                    tocPage.drawText(item.text, { x: 60, y, font: customFont, size: 14, color: rgb(0.1, 0.1, 0.1) });
                    y -= 25;
                } else {
                    const pageNumberText = `${item.newPageNum + (addToc ? 1 : 0)}`;
                    const lineText = `${item.text}`;
                    const lineWidth = customFont.widthOfTextAtSize(lineText, 12);
                    const pageNumWidth = customFont.widthOfTextAtSize(pageNumberText, 12);
                    const dotsWidth = width - 100 - lineWidth - pageNumWidth - 10;
                    const dots = '.'.repeat(Math.max(0, Math.floor(dotsWidth / customFont.widthOfTextAtSize('.', 12))));
                    tocPage.drawText(`${lineText} ${dots} ${pageNumberText}`, { x: 60, y, font: customFont, size: 12, color: rgb(0.2, 0.2, 0.2) });
                    y -= 20;
                }
            });
        }

        const pagesToCopy = currentTocData.filter(i => i.type === 'page');
        const sourceDocs = new Map();
        for (const item of pagesToCopy) {
            const pageInfo = getDocAndLocalPage(item.globalPage);
            if (!pageInfo || sourceDocs.has(pageInfo.docIndex)) continue;
            const sourcePdfBytes = appState.pdfArrayBuffers[pageInfo.docIndex];
            if (sourcePdfBytes) {
                const sourcePdfDoc = await PDFDocument.load(sourcePdfBytes, { updateMetadata: false });
                sourceDocs.set(pageInfo.docIndex, sourcePdfDoc);
            }
        }

        const copiedPages = [];
        for (const item of pagesToCopy) {
            const pageInfo = getDocAndLocalPage(item.globalPage);
            const sourcePdfDoc = sourceDocs.get(pageInfo.docIndex);
            if (!sourcePdfDoc) continue;
            const [copiedPage] = await newPdfDoc.copyPages(sourcePdfDoc, [pageInfo.localPage - 1]);
            copiedPages.push(copiedPage);
        }
        
        const totalContentPages = copiedPages.length;
        for (let i = 0; i < totalContentPages; i++) {
            const page = copiedPages[i];
            if (addPageNumbers) {
                const { width, height } = page.getSize();
                const pageNumberText = `${i + 1 + (addToc ? 1 : 0)} / ${totalContentPages + (addToc ? 1 : 0)}`;
                const textWidth = customFont.widthOfTextAtSize(pageNumberText, 10);
                page.drawText(pageNumberText, {
                    x: width - textWidth - 30,
                    y: 20,
                    font: customFont,
                    size: 10,
                    color: rgb(0.5, 0.5, 0.5),
                });
            }
            newPdfDoc.addPage(page);
        }

        const pdfBytes = await newPdfDoc.save({ useObjectStreams: false });
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
