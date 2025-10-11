import { dom, appState } from './state.js';
import { updateUIForNewState } from './ui.js';
import { showFeedback } from './utils.js'; // **修正點 1: 導入 showFeedback 函式**

export async function loadAndProcessFiles(files) {
    if (!files || files.length === 0) return null;
    const readFileAsBuffer = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ buffer: reader.result, name: file.name });
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
    const fileData = await Promise.all(Array.from(files).map(readFileAsBuffer));
    const loadingPromises = fileData.map(data => {
        const typedarray = new Uint8Array(data.buffer);
        const loadingTask = pdfjsLib.getDocument({
            data: typedarray,
            cMapUrl: "https://unpkg.com/pdfjs-dist@4.4.168/cmaps/",
            cMapPacked: true,
        });
        return loadingTask.promise.then(pdf => {
            pdf.name = data.name;
            const blob = new Blob([data.buffer], { type: 'application/pdf' });
            return { 
                pdf,
                blobUrl: URL.createObjectURL(blob)
            };
        }).catch(err => {
            console.error(`載入 ${data.name} 失敗`, err);
            // **修正點 2: 在 UI 上顯示友善的錯誤訊息**
            showFeedback(`檔案 "${data.name}" 載入失敗，可能已損毀或格式不支援。`);
            return null;
        });
    });
    const results = (await Promise.all(loadingPromises)).filter(r => r !== null);
    if (results.length === 0) return null;
    return {
        pdfDocs: results.map(r => r.pdf),
        pdfBlobs: results.map(r => ({ url: r.blobUrl, name: r.pdf.name }))
    };
}

export function displayPdf(docIndex, pageNum = 1) {
    if (docIndex < 0 || docIndex >= appState.pdfBlobs.length) return;
    appState.currentDocIndex = docIndex;
    appState.currentPage = pageNum;
    const blobInfo = appState.pdfBlobs[docIndex];
    dom.pdfEmbed.src = `${blobInfo.url}#page=${pageNum}&view=FitW`;
    dom.docSelectionDropdown.value = docIndex;
    updateUIForNewState();
}

export function goToPage(pageNum) {
    if (appState.currentDocIndex === -1) return;
    const currentDoc = appState.pdfDocs[appState.currentDocIndex];
    const totalPages = currentDoc.numPages;
    const newPageNum = Math.max(1, Math.min(pageNum, totalPages));
    displayPdf(appState.currentDocIndex, newPageNum);
}
