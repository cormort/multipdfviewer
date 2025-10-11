// search.js
import { dom, appState } from './state.js';
import { displayPdf } from './viewer.js';
import { updateSearchResults, showLoading } from './ui.js';

export async function searchKeyword(query) {
    if (!query || appState.pdfDocs.length === 0) {
        appState.searchResults = [];
        updateSearchResults();
        return;
    }

    showLoading(true);
    let pattern;
    try {
        if (query.startsWith('/') && query.lastIndexOf('/') > 0) {
            const lastSlashIndex = query.lastIndexOf('/');
            pattern = new RegExp(query.slice(1, lastSlashIndex), query.slice(lastSlashIndex + 1));
        } else {
            const escapedInput = query.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
            const keywords = escapedInput.split(/\s+/).filter(k => k.length > 0);
            if (keywords.length > 0) pattern = new RegExp(keywords.join('.*?'), 'gi');
        }
    } catch (e) {
        console.warn('無法建立正則表達式:', e);
        showLoading(false);
        return;
    }

    if (!pattern) {
        showLoading(false);
        return;
    }

    const allPromises = appState.pdfDocs.flatMap((doc, docIndex) => {
        const pagePromises = [];
        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
            pagePromises.push(
                doc.getPage(pageNum)
                    .then(page => page.getTextContent())
                    .then(textContent => {
                        const pageText = textContent.items.map(item => item.str).join('');
                        pattern.lastIndex = 0;
                        if (pattern.test(pageText)) {
                            return {
                                docIndex,
                                pageNum,
                                docName: doc.name || `文件 ${docIndex + 1}`
                            };
                        }
                        return null;
                    })
            );
        }
        return pagePromises;
    });

    const results = (await Promise.all(allPromises)).filter(r => r !== null);
    
    appState.searchResults = results.sort((a, b) => a.docIndex - b.docIndex || a.pageNum - b.pageNum);
    
    updateSearchResults();

    if (appState.searchResults.length > 0) {
        const firstResult = appState.searchResults[0];
        displayPdf(firstResult.docIndex, firstResult.pageNum);
    }

    showLoading(false);
}
