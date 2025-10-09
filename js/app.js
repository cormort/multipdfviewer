// in js/app.js

// **變更點 1: 從 CDN URL 直接導入函式庫**
import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';

// 將 pdfjsLib 附加到 window 物件上，以便 viewer.js 等舊模組可以訪問
// 這是為了最小化修改的臨時方案
window.pdfjsLib = pdfjsLib;

// 從本地模組導入
import { dom, appState, resetAppState, initializeDom } from './state.js';
import { initDB, saveFiles, getFiles } from './db.js';
import * as UI from './ui.js';
import * as Viewer from './viewer.js';
import * as Search from './search.js';
import { showFeedback } from './utils.js';

// ... (handleFileSelect 和 loadFilesIntoApp 函數保持不變) ...
export async function handleFileSelect(e) { /* ... */ }
async function loadFilesIntoApp(loadedFileData) { /* ... */ }

/**
 * 應用程式的主初始化函數。
 */
async function initializeApp() {
    // **變更點 2: 不再需要等待，直接使用導入的 pdfjsLib**
    if (pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs`;
    } else {
        console.error("pdf.js library failed to load via import!");
        showFeedback("核心 PDF 函式庫載入失敗。");
        return;
    }

    initializeDom();
    UI.initEventHandlers();
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
