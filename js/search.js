import { dom, appState } from './app.js';
import { goToPage, getDocAndLocalPage } from './viewer.js';
import { updateResultsNav, updateFilterAndResultsUI } from './ui.js';
import { getPatternFromSearchInput } from './utils.js';

let thumbnailObserver = null;

export function initThumbnailObserver() {
    if (thumbnailObserver) {
        thumbnailObserver.disconnect();
    }

    thumbnailObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const canvas = entry.target;
                const docIndex = parseInt(canvas.dataset.docIndex, 10);
                const localPage = parseInt(canvas.dataset.localPage, 10);
                renderThumbnail(docIndex, localPage, canvas);
                observer.unobserve(canvas);
            }
        });
    }, { root: dom.resultsList, rootMargin: '0px 0px 200px 0px' });
}

async function renderThumbnail(docIndex, localPageNum, canvasEl) {
    try {
        const doc = appState.pdfDocs[docIndex];
        if (!doc || !canvasEl) return;
        const page = await doc.getPage(localPageNum);
        const viewport = page.getViewport({ scale: 1 });
        const scale = (canvasEl.parentElement.clientWidth - 20) / viewport.width;
        const scaledViewport = page.getViewport({ scale: scale });
        const thumbnailCtx = canvasEl.getContext('2d');
        canvasEl.height = scaledViewport.height;
        canvasEl.width = scaledViewport.width;
        const renderContext = { canvasContext: thumbnailCtx, viewport: scaledViewport };
        await page.render(renderContext).promise;
    } catch (error) {
        console.error(`Failed to render thumbnail for doc ${docIndex} page ${localPageNum}:`, error);
    }
}

export function searchKeyword() {
    appState.searchResults = [];
    appState.currentFileFilter = 'all';

    const searchingOption = '<option value="">搜尋中...</option>';
    if(dom.resultsDropdown) dom.resultsDropdown.innerHTML = searchingOption;
    if(dom.panelResultsDropdown) dom.panelResultsDropdown.innerHTML = searchingOption;
    if(dom.resultsList) dom.resultsList.innerHTML = '<p style="padding: 10px;">正在搜尋，請稍候...</p>';
    updateResultsNav();

    const pattern = getPatternFromSearchInput(dom.searchInputElem);

    if (appState.pdfDocs.length === 0 || !pattern) {
        if (appState.pdfDocs.length > 0) goToPage(appState.currentPage, null);
        updateFilterAndResultsUI();
        return;
    }

    let promises = [];
    
    appState.pageMap.forEach((pageInfo, index) => {
        const currentGlobalPageForSearch = index + 1;
        promises.push(
            appState.pdfDocs[pageInfo.docIndex].getPage(pageInfo.localPage)
            .then(p => p.getTextContent())
            .then(textContent => {
                const pageText = textContent.items.map(item => item.str).join('');
                pattern.lastIndex = 0;
                if (pattern.test(pageText)) {
                    pattern.lastIndex = 0; // Reset for next use
                    const matchResult = pattern.exec(pageText);
                    let foundMatchSummary = '找到相符結果';
                    if (matchResult) {
                        const matchedText = matchResult[0];
                        const matchIndex = matchResult.index;
                        const contextLength = 40;
                        const startIndex = Math.max(0, matchIndex - contextLength);
                        const endIndex = Math.min(pageText.length, matchIndex + matchedText.length + contextLength);
                        const preMatch = pageText.substring(startIndex, matchIndex).replace(/\n/g, ' ');
                        const highlightedMatch = matchedText.replace(/\n/g, ' ');
                        const postMatch = pageText.substring(matchIndex + matchedText.length, endIndex).replace(/\n/g, ' ');
                        foundMatchSummary = `${startIndex > 0 ? '... ' : ''}${preMatch}<span class="wavy-underline">${highlightedMatch}</span>${postMatch}${endIndex < pageText.length ? ' ...' : ''}`;
                    }
                    return { page: currentGlobalPageForSearch, summary: foundMatchSummary, docName: pageInfo.docName, docIndex: pageInfo.docIndex, localPage: pageInfo.localPage };
                }
                return null;
            }).catch(err => {
                console.warn(`Error processing page for search: Doc ${pageInfo.docName}, Page ${pageInfo.localPage}`, err);
                return null;
            })
        );
    });

    Promise.all(promises).then((allPageResults) => {
        appState.searchResults = allPageResults.filter(r => r !== null).sort((a, b) => a.page - b.page);
        
        updateFilterAndResultsUI('all'); 
        
        if (appState.searchResults.length > 0) {
            goToPage(appState.searchResults[0].page, pattern);
        } else {
             goToPage(appState.currentPage, null); // No results, clear highlights
        }
        
        updateResultsNav();
    }).catch(err => {
        console.error('An unexpected error occurred during search:', err);
        const errorMsg = '<option value="">搜尋錯誤</option>';
        if(dom.resultsDropdown) dom.resultsDropdown.innerHTML = errorMsg;
        if(dom.panelResultsDropdown) dom.panelResultsDropdown.innerHTML = errorMsg;
        if(dom.resultsList) dom.resultsList.innerHTML = '<p style="padding: 10px;">搜尋時發生錯誤。</p>';
        updateResultsNav();
    });
}

export function rerenderAllThumbnails() {
    if (!dom.resultsList) return;
    initThumbnailObserver();
    const resultItems = dom.resultsList.querySelectorAll('.result-item');
    
    resultItems.forEach(item => {
        const canvasEl = item.querySelector('.thumbnail-canvas');
        if (canvasEl) {
            thumbnailObserver.observe(canvasEl);
        }
    });
}
