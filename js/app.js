import * as pdfjsLib from '../libs/pdf.js/pdf.mjs';

import { dom, appState, resetAppState, initializeDom } from './state.js';
import { initDB, saveFiles, getFiles } from './db.js';
import * as UI from './ui.js';
import * as Viewer from './viewer.js';
import * as Search from './search.js';
import { showFeedback } from './utils.js';

async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const readFileAsBuffer = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, type: file.type, buffer: reader.result });
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });

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

async function initializeApp() {
    try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = './libs/pdf.js/pdf.worker.mjs';
        window.pdfjsLib = pdfjsLib;

        initializeDom();
        
        UI.initEventHandlers();
        UI.initResizer();
        Search.initThumbnailObserver();
        
        dom.fileInput.addEventListener('change', handleFileSelect);
        dom.clearSessionBtn.addEventListener('click', () => {
            resetAppState();
            UI.updateUIForNewState();
        });

        UI.updateUIForNewState();
        
        await initDB();
        const storedFiles = await getFiles();
        if (storedFiles.length > 0) {
            if (dom.restoreSessionContainer) dom.restoreSessionContainer.style.display = 'block';
            if (dom.restoreSessionBtn) {
                dom.restoreSessionBtn.onclick = async () => {
                    UI.showLoading(true);
                    try {
                        const loadedFileData = await Promise.all(storedFiles.map(file => new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve({ name: file.name, type: file.type, buffer: reader.result });
                            reader.onerror = reject;
                            reader.readAsArrayBuffer(file);
                        })));
                        await loadFilesIntoApp(loadedFileData);
                        dom.restoreSessionContainer.style.display = 'none';
                    } catch (error) {
                         showFeedback("恢復工作階段失敗。");
                    } finally {
                        UI.showLoading(false);
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
