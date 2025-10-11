import { dom, appState } from './state.js';
import { updateUIForNewState } from './ui.js';

/**
 * 載入並處理用戶選擇的檔案。
 * @param {File[]} files - 從 input 元素獲取的文件列表。
 * @returns {Promise<Object|null>} 一個包含 pdfDocs 和 pdfBlobs 的物件，或在失敗時返回 null。
 */
export async function loadAndProcessFiles(files) {
    if (!files || files.length === 0) return null;

    // 將 File 物件讀取為 ArrayBuffer
    const readFileAsBuffer = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ buffer: reader.result, name: file.name });
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });

    const fileData = await Promise.all(Array.from(files).map(readFileAsBuffer));
    
    // 使用 pdf.js 平行處理所有檔案
    const loadingPromises = fileData.map(data => {
        const typedarray = new Uint8Array(data.buffer);
        const loadingTask = pdfjsLib.getDocument({
            data: typedarray,
            // 提供 cMap 資源路徑以正確顯示亞洲語言字體
            cMapUrl: "https://unpkg.com/pdfjs-dist@4.4.168/cmaps/",
            cMapPacked: true,
        });
        return loadingTask.promise.then(pdf => {
            pdf.name = data.name; // 為 pdf 物件附加名稱，以便在 UI 中顯示
            const blob = new Blob([data.buffer], { type: 'application/pdf' });
            return { 
                pdf, // 用於獲取元數據 (如頁數) 和搜尋
                blobUrl: URL.createObjectURL(blob) // 用於在 <embed> 中顯示
            };
        }).catch(err => {
            console.error(`載入 ${data.name} 失敗`, err);
            return null;
        });
    });

    const results = (await Promise.all(loadingPromises)).filter(r => r !== null);
    if (results.length === 0) return null;

    // 將處理好的結果分類儲存
    return {
        pdfDocs: results.map(r => r.pdf),
        pdfBlobs: results.map(r => ({ url: r.blobUrl, name: r.pdf.name }))
    };
}

/**
 * 在 <embed> 元素中顯示指定的 PDF 文件和頁碼。
 * @param {number} docIndex - 要顯示的文件在 appState 中的索引。
 * @param {number} [pageNum=1] - 要跳轉到的頁碼。
 */
export function displayPdf(docIndex, pageNum = 1) {
    if (docIndex < 0 || docIndex >= appState.pdfBlobs.length) return;
    
    appState.currentDocIndex = docIndex;
    appState.currentPage = pageNum;
    
    const blobInfo = appState.pdfBlobs[docIndex];
    
    // 設定 embed 的 src，並加上頁碼和「符合頁寬」的參數
    // #page=[頁碼]&view=FitW 是 Adobe PDF Open Parameters 標準
    dom.pdfEmbed.src = `${blobInfo.url}#page=${pageNum}&view=FitW`;
    
    // 更新 UI 上的文件選擇下拉選單和頁碼顯示
    dom.docSelectionDropdown.value = docIndex;
    updateUIForNewState();
}

/**
 * 跳轉到目前顯示文件的指定頁碼。
 * @param {number} pageNum - 目標頁碼。
 */
export function goToPage(pageNum) {
    if (appState.currentDocIndex === -1) return;
    const currentDoc = appState.pdfDocs[appState.currentDocIndex];
    const totalPages = currentDoc.numPages;

    // 確保頁碼在有效範圍內
    const newPageNum = Math.max(1, Math.min(pageNum, totalPages));

    // 呼叫 displayPdf 來更新畫面
    displayPdf(appState.currentDocIndex, newPageNum);
}

