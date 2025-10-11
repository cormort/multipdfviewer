// app.js
import * as pdfjsLib from '../libs/pdf.js/pdf.mjs';
import { dom, appState, resetAppState, initializeDom } from './state.js';
import { initDB, saveFiles, getFiles } from './db.js';
import * as UI from './ui.js';
import * as Viewer from './viewer.js';
import { showFeedback } from './utils.js';

async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    try {
        UI.showLoading(true);
        await loadFilesIntoApp(files);
        await saveFiles(files); 
        if (dom.restoreSessionContainer) dom.restoreSessionContainer.style.display = 'none';
    } catch (error) {
        console.error("處理檔案時發生錯誤:", error);
        showFeedback("讀取或儲存檔案時出錯。");
    } finally {
        UI.showLoading(false);
    }
}

async function loadFilesIntoApp(files) {
    resetAppState();
    const loadedData = await Viewer.loadAndProcessFiles(files);
    if (!loadedData) {
        showFeedback('未載入任何有效的 PDF 檔案。');
        UI.updateUIForNewState();
        return;
    }
    appState.pdfDocs = loadedData.pdfDocs;
    appState.pdfBlobs = loadedData.pdfBlobs;
    
    UI.populateDocSelection();
    Viewer.displayPdf(0, 1); 
}

async function initializeApp() {
    try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = './libs/pdf.js/pdf.worker.mjs';
        window.pdfjsLib = pdfjsLib;

        initializeDom();
        UI.initEventHandlers();
        UI.initResizer();
        
        dom.fileInput.addEventListener('change', handleFileSelect);
        dom.clearSessionBtn.addEventListener('click', () => {
            resetAppState();
            if(dom.pdfEmbed) dom.pdfEmbed.src = "about:blank";
            UI.updateUIForNewState();
            UI.populateDocSelection();
            UI.updateSearchResults(); 
        });

        UI.updateUIForNewState();
        
        await initDB();
        const storedFiles = await getFiles();
        if (storedFiles.length > 0) {
            dom.restoreSessionContainer.style.display = 'block';
            dom.restoreSessionBtn.onclick = async () => {
                UI.showLoading(true);
                try {
                    await loadFilesIntoApp(storedFiles);
                    dom.restoreSessionContainer.style.display = 'none';
                } catch (error) {
                     showFeedback("恢復工作階段失敗。");
                } finally {
                    UI.showLoading(false);
                }
            };
        }
    } catch (error) {
        console.error("App initialization failed:", error);
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);
