import { dom, appState } from './state.js';
import { displayPdf, goToPage } from './viewer.js';
import { searchKeyword } from './search.js';

export function initEventHandlers() {
    dom.docSelectionDropdown.addEventListener('change', (e) => {
        const docIndex = parseInt(e.target.value);
        if (!isNaN(docIndex)) displayPdf(docIndex, 1);
    });

    dom.searchActionButton.addEventListener('click', () => searchKeyword(dom.searchInputElem.value));
    dom.searchInputElem.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchKeyword(dom.searchInputElem.value);
        }
    });

    dom.panelResultsDropdown.addEventListener('change', () => {
        const [docIndex, pageNum] = dom.panelResultsDropdown.value.split('-').map(Number);
        if (!isNaN(docIndex) && !isNaN(pageNum)) displayPdf(docIndex, pageNum);
    });
    
    dom.goToFirstPageBtn.addEventListener('click', () => goToPage(1));
    dom.prevPageBtn.addEventListener('click', () => goToPage(appState.currentPage - 1));
    dom.nextPageBtn.addEventListener('click', () => goToPage(appState.currentPage + 1));
    dom.goToLastPageBtn.addEventListener('click', () => {
        if (appState.currentDocIndex !== -1) goToPage(appState.pdfDocs[appState.currentDocIndex].numPages);
    });

    dom.goToPageBtn.addEventListener('click', () => {
        const pageNum = parseInt(dom.pageToGoInput.value);
        if (!isNaN(pageNum)) goToPage(pageNum);
    });
    dom.pageToGoInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const pageNum = parseInt(dom.pageToGoInput.value);
            if (!isNaN(pageNum)) goToPage(pageNum);
        }
    });
}

export function initResizer() {
    const resizer = dom.resizer;
    const toolbar = dom.toolbar;
    if (!resizer || !toolbar) return;
    let isResizing = false;
    resizer.addEventListener('mousedown', () => {
        isResizing = true;
        document.body.style.userSelect = 'none';
        document.body.style.pointerEvents = 'none';
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', stopResizing);
    });
    function handleMouseMove(e) {
        let newWidth = e.clientX;
        if (newWidth < 200) newWidth = 200;
        if (newWidth > 600) newWidth = 600;
        toolbar.style.width = `${newWidth}px`;
    }
    function stopResizing() {
        isResizing = false;
        document.body.style.userSelect = 'auto';
        document.body.style.pointerEvents = 'auto';
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', stopResizing);
    }
}

export function showLoading(isLoading) { document.body.style.cursor = isLoading ? 'wait' : 'default'; }

export function populateDocSelection() {
    dom.docSelectionDropdown.innerHTML = '';
    if (appState.pdfDocs.length === 0) {
        dom.docSelectionDropdown.innerHTML = '<option value="">請先載入檔案</option>';
        return;
    }
    appState.pdfDocs.forEach((doc, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = doc.name || `文件 ${index + 1}`;
        dom.docSelectionDropdown.appendChild(option);
    });
}

export function updateSearchResults() {
    dom.panelResultsDropdown.innerHTML = '';
    if (appState.searchResults.length === 0) {
        dom.panelResultsDropdown.innerHTML = '<option value="">無搜尋結果</option>';
        dom.resultsList.innerHTML = '<p class="placeholder-text">無搜尋結果</p>';
        return;
    }
    appState.searchResults.forEach(result => {
        const option = document.createElement('option');
        option.value = `${result.docIndex}-${result.pageNum}`;
        option.textContent = `P.${result.pageNum} (${result.docName})`;
        dom.panelResultsDropdown.appendChild(option);
    });
    dom.resultsList.innerHTML = ''; 
}

export function updateUIForNewState() {
    const hasDocs = appState.pdfDocs.length > 0;
    const isDocSelected = appState.currentDocIndex !== -1;
    dom.clearSessionBtn.style.display = hasDocs ? 'block' : 'none';
    const controls = [dom.docSelectionDropdown, dom.searchInputElem, dom.searchActionButton, dom.panelResultsDropdown, dom.goToFirstPageBtn, dom.prevPageBtn, dom.nextPageBtn, dom.goToLastPageBtn, dom.pageToGoInput, dom.goToPageBtn];
    controls.forEach(el => { if (el) el.disabled = !hasDocs; });

    if (isDocSelected) {
        const currentDoc = appState.pdfDocs[appState.currentDocIndex];
        const totalPages = currentDoc.numPages;
        dom.pageNumDisplay.textContent = `第 ${appState.currentPage} 頁 / 共 ${totalPages} 頁`;
        dom.pageToGoInput.value = appState.currentPage;
        dom.pageToGoInput.max = totalPages;
        dom.goToFirstPageBtn.disabled = appState.currentPage === 1;
        dom.prevPageBtn.disabled = appState.currentPage === 1;
        dom.nextPageBtn.disabled = appState.currentPage === totalPages;
        dom.goToLastPageBtn.disabled = appState.currentPage === totalPages;
    } else {
        dom.pageNumDisplay.textContent = '- / -';
        if (dom.pageToGoInput) dom.pageToGoInput.value = '';
    }
}
