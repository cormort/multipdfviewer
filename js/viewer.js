import { dom, appState } from './state.js';
import { displayPdf } from './viewer.js'; // **修正點 1: 導入新的 displayPdf 函式**
import { updateSearchResults, showLoading } from './ui.js';

/**
 * 根據輸入框中的關鍵字或正則表達式，在所有已載入的 PDF 文件中進行搜尋。
 * @param {string} query - 來自搜尋輸入框的文字。
 */
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
            if (keywords.length > 0) {
                pattern = new RegExp(keywords.join('.*?'), 'gi');
            }
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
                        pattern.lastIndex = 0; // 重置正則表達式的 lastIndex
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

    // 如果有結果，自動跳轉到第一個結果
    if (appState.searchResults.length > 0) {
        const firstResult = appState.searchResults[0];
        // **修正點 2: 呼叫 displayPdf 而不是舊的 goToPage**
        displayPdf(firstResult.docIndex, firstResult.pageNum);
    }

    showLoading(false);
}
