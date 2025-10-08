// in js/app.js

// **變更點 1: 從新的 state.js 導入狀態和 DOM**
import { dom, appState, resetAppState } from './state.js';
import { initDB, saveFiles, getFiles } from './db.js';
import * as UI from './ui.js';
import * as Viewer from './viewer.js';
import * as Search from './search.js';
import { showFeedback } from './utils.js';

// **變更點 2: dom 和 appState 的定義已移至 state.js，這裡不再需要它們**

async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const readFileAsBuffer = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({
                name: file.name,
                type: file.type,
                buffer: reader.result
            });
            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(file);
        });
    };

    try {
        const loadedFileData = await Promise.all(files.map(readFileAsBuffer));
        await saveFiles(loadedFileData);
        if (dom.restoreSessionContainer) dom.restoreSessionContainer.style.display = 'none';
        await loadFilesIntoApp(loadedFileData);
    } catch (error) {
        console.error("處理檔案時發生錯誤:", error);
        showFeedback("讀取或儲存檔案時出錯。");
    }
}

async function loadFilesIntoApp(loadedFileData) {
    resetAppState();
    UI.updateUIForNewState();
    
    const loadedData = await Viewer.loadAndProcessFiles(loadedFileData);

    // --- ↓↓↓ 在這裡加入 console.log ↓↓↓ ---
    console.log("從 viewer.js 返回的已處理數據:", loadedData);

    
    if (!loadedData) {
        showFeedback('未載入任何有效的 PDF 檔案。');
        resetAppState();
        UI.updateUIForNewState();
        return;
    }

    appState.pdfDocs = loadedData.pdfDocs;
    appState.pageMap = loadedData.pageMap;
    appState.globalTotalPages = loadedData.globalTotalPages;
    appState.pdfArrayBuffers = loadedData.pdfArrayBuffers;

    Viewer.renderPage(1);
    UI.updateUIForNewState();
}

async function initializeApp() {
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs`;
    } else {
        console.error("pdf.js library is not loaded!");
        return;
    }

    // **變更點 3: 將 handleFileSelect 作為回呼函數傳遞給 UI 模組**
    UI.initEventHandlers(handleFileSelect);
    Viewer.initLocalMagnifier();
    Search.initThumbnailObserver();
    UI.updateUIForNewState();

    try {
        await initDB();
        const storedFiles = await getFiles();
        if (storedFiles.length > 0) {
            if (dom.restoreSessionContainer) dom.restoreSessionContainer.style.display = 'block';
            if (dom.restoreSessionBtn) {
                dom.restoreSessionBtn.onclick = async () => {
                    const readFileAsBuffer = (file) => {
                        return new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve({ name: file.name, type: file.type, buffer: reader.result });
                            reader.onerror = (error) => reject(error);
                            reader.readAsArrayBuffer(file);
                        });
                    };
                    try {
                        const loadedFileData = await Promise.all(storedFiles.map(readFileAsBuffer));
                        await loadFilesIntoApp(loadedFileData);
                        dom.restoreSessionContainer.style.display = 'none';
                    } catch (error) {
                         showFeedback("恢復工作階段失敗。");
                         console.error("Error restoring session:", error);
                    }
                };
            }
        }
    } catch (error) {
        console.error("Could not initialize app from IndexedDB:", error);
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);
