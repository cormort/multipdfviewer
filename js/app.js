// in js/app.js

import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';

// 從 state.js 導入共享狀態和 DOM 初始化函數
import { dom, appState, resetAppState, initializeDom } from './state.js';
// 導入其他模組
import { initDB, saveFiles, getFiles } from './db.js';
import * as UI from './ui.js';
import * as Viewer from './viewer.js';
import * as Search from './search.js';
import { showFeedback } from './utils.js';

// **變更點 2: 將 pdfjsLib 傳遞給需要它的模組**
// (或者更好的方式是，讓每個需要的模組自己導入)
// 為了簡化，我們先將它附加到 window 物件上，讓其他模組可以訪問
window.pdfjsLib = pdfjsLib;

/**
 * 處理用戶選擇的檔案。
 * @param {Event} e - 檔案輸入框的 change 事件。
 */
export async function handleFileSelect(e) {
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

/**
 * 將讀取好的檔案數據載入到應用程式狀態中並觸發渲染。
 * @param {Array<Object>} loadedFileData - 包含 { name, type, buffer } 的物件陣列。
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
    // **變更點 3: workerSrc 的設定現在使用導入的 pdfjsLib**
    if (pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs`;
    } else {
        console.error("pdf.js library failed to load via import!");
        return;
    }
    
    // 1. 設定 PDF.js 的 worker 路徑
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs`;
    } else {
        console.error("pdf.js library is not loaded!");
        return;
    }

    // 2. 初始化 DOM 元素的引用
    initializeDom();

    // 3. 綁定所有事件監聽器
    UI.initEventHandlers();
    Viewer.initLocalMagnifier();
    Search.initThumbnailObserver();
    
    // 4. 根據初始狀態更新 UI
    UI.updateUIForNewState();

    // 5. 嘗試從 IndexedDB 恢復工作階段
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

// 當 DOM 完全載入後，啟動應用程式
document.addEventListener('DOMContentLoaded', initializeApp);
