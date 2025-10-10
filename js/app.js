import * as pdfjsLib from '../libs/pdf.js/pdf.mjs';

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
async function handleFileSelect(e) {
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
        UI.showLoading(true);
        const loadedFileData = await Promise.all(files.map(readFileAsBuffer));
        await saveFiles(loadedFileData);
        if (dom.restoreSessionContainer) dom.restoreSessionContainer.style.display = 'none';
        await loadFilesIntoApp(loadedFileData);
    } catch (error) {
        console.error("處理檔案時發生錯誤:", error);
        showFeedback("讀取或儲存檔案時出錯。");
    } finally {
        UI.showLoading(false);
    }
}

/**
 * 將讀取好的檔案數據載入到應用程式狀態中並觸發渲染。
 */
async function loadFilesIntoApp(loadedFileData) {
    resetAppState();
    
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
    try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = './libs/pdf.js/pdf.worker.mjs';
        window.pdfjsLib = pdfjsLib;

        initializeDom();
        
        // 初始化所有 UI 事件監聽器和功能
        UI.initEventHandlers();
        UI.initResizer();
        Viewer.initLocalMagnifier();
        Search.initThumbnailObserver();
        
        // 將核心應用邏輯的事件監聽器放在此處，以避免循環依賴
        dom.fileInput.addEventListener('change', handleFileSelect);
        dom.clearSessionBtn.addEventListener('click', () => {
            resetAppState();
            UI.updateUIForNewState();
            // 這裡可以加上清除 IndexedDB 的邏輯
        });

        UI.updateUIForNewState();
        
        await initDB();
        const storedFiles = await getFiles();
        if (storedFiles.length > 0) {
            if (dom.restoreSessionContainer) dom.restoreSessionContainer.style.display = 'block';
            if (dom.restoreSessionBtn) {
                dom.restoreSessionBtn.onclick = async () => {
                    // 這段邏輯可以保持不變
                };
            }
        }
    } catch (error) {
        console.error("App initialization failed:", error);
        showFeedback(error.message || "應用程式初始化失敗。");
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);
