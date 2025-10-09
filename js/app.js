// 從本地模組導入
import { dom, appState, resetAppState, initializeDom } from './state.js';
import { initDB, saveFiles, getFiles } from './db.js';
import * as UI from './ui.js';
import * as Viewer from './viewer.js';
import * as Search from './search.js';
import { showFeedback } from './utils.js';

/**
 * 處理用戶選擇的檔案。
 */
export async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const readFileAsBuffer = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ name: file.name, type: file.type, buffer: reader.result });
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

/**
 * 將讀取好的檔案數據載入到應用程式狀態中並觸發渲染。
 */
async function loadFilesIntoApp(loadedFileData) {
    resetAppState();
    UI.updateUIForNewState();
    
    const loadedData = await Viewer.loadAndProcessFiles(loadedFileData);
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

/**
 * 應用程式的主初始化函數。
 */
async function initializeApp() {
    // **變更點: 使用全域的 pdfjsLib，並提供 worker 的 CDN 路徑**
    const waitForPdfJs = () => {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const interval = setInterval(() => {
                if (typeof window.pdfjsLib !== 'undefined') {
                    clearInterval(interval);
                    resolve(window.pdfjsLib);
                }
                attempts++;
                if (attempts > 100) { // 等待最多 10 秒
                    clearInterval(interval);
                    reject(new Error("pdf.js library failed to load from script tag!"));
                }
            }, 100);
        });
    };

    try {
        const pdfjsLib = await waitForPdfJs();
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js`;
        window.pdfjsLib = pdfjsLib; // 確保它在全域可用

        initializeDom();
        UI.initEventHandlers();
        Viewer.initLocalMagnifier();
        Search.initThumbnailObserver();
        UI.updateUIForNewState();
        
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
        console.error("App initialization failed:", error);
        showFeedback(error.message || "應用程式初始化失敗。");
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);
