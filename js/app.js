import { initDB, saveFiles, getFiles } from './db.js';
import * as UI from './ui.js';
import * as Viewer from './viewer.js';
import * as Search from './search.js';
import * as Recompose from './recompose.js';
import { showFeedback } from './utils.js';

// Centralized DOM Elements
export const dom = {
    appContainer: document.getElementById('app-container'),
    toolbar: document.getElementById('toolbar'),
    toolbarToggleTab: document.getElementById('toolbar-toggle-tab'),
    mainContent: document.getElementById('main-content'),
    resizer: document.getElementById('resizer'),
    pdfContainer: document.getElementById('pdf-container'),
    canvas: document.getElementById('pdf-canvas'),
    ctx: document.getElementById('pdf-canvas')?.getContext('2d'),
    textLayerDivGlobal: document.getElementById('text-layer'),
    drawingCanvas: document.getElementById('drawing-canvas'),
    drawingCtx: document.getElementById('drawing-canvas')?.getContext('2d'),
    magnifierGlass: document.getElementById('magnifier-glass'),
    magnifierCanvas: document.getElementById('magnifier-canvas'),
    localMagnifierCtx: document.getElementById('magnifier-canvas')?.getContext('2d'),
    
    // File
    fileInput: document.getElementById('fileInput'),
    fileInputLabel: document.querySelector('label[for="fileInput"]'),
    clearSessionBtn: document.getElementById('clear-session-btn'),
    restoreSessionBtn: document.getElementById('restore-session-btn'),
    restoreSessionContainer: document.getElementById('restore-session-container'),
    
    // Nav
    goToFirstPageBtn: document.getElementById('go-to-first-page'),
    prevPageBtn: document.getElementById('prev-page'),
    nextPageBtn: document.getElementById('next-page'),
    goToLastPageBtn: document.getElementById('go-to-last-page'),
    pageNumDisplay: document.getElementById('page-num-display'),
    pageToGoInput: document.getElementById('page-to-go'),
    goToPageBtn: document.getElementById('go-to-page-btn'),
    pageSlider: document.getElementById('page-slider'),
    
    // Search
    searchInputElem: document.getElementById('searchInput'),
    searchActionButton: document.getElementById('search-action-button'),
    resultsDropdown: document.getElementById('resultsDropdown'),
    panelResultsDropdown: document.getElementById('panelResultsDropdown'),
    fileFilterDropdown: document.getElementById('fileFilterDropdown'),
    panelFileFilterDropdown: document.getElementById('panelFileFilterDropdown'),
    searchResultsPanel: document.getElementById('search-results-panel'),
    resultsList: document.getElementById('results-list'),
    
    // Zoom
    zoomOutBtn: document.getElementById('zoom-out-btn'),
    zoomInBtn: document.getElementById('zoom-in-btn'),
    zoomLevelDisplay: document.getElementById('zoom-level-display'),
    
    // Tools
    toggleUnderlineBtn: document.getElementById('toggle-underline-btn'),
    toggleHighlighterBtn: document.getElementById('toggle-highlighter-btn'),
    clearHighlighterBtn: document.getElementById('clear-highlighter-btn'),
    toggleTextSelectionBtn: document.getElementById('toggle-text-selection-btn'),
    toggleParagraphSelectionBtn: document.getElementById('toggle-paragraph-selection-btn'),
    copyPageTextBtn: document.getElementById('copy-page-text-btn'),
    exportPageBtn: document.getElementById('export-page-btn'),
    sharePageBtn: document.getElementById('share-page-btn'),
    toggleLocalMagnifierBtn: document.getElementById('toggle-local-magnifier-btn'),
    localMagnifierZoomControlsDiv: document.getElementById('local-magnifier-zoom-controls'),
    localMagnifierZoomSelector: document.getElementById('local-magnifier-zoom-selector'),
    
    // Recompose
    recomposePdfBtn: document.getElementById('recompose-pdf-btn'),
    recomposePanel: document.getElementById('recompose-panel'),
    closeRecomposePanelBtn: document.getElementById('close-recompose-panel'),
    recomposePageList: document.getElementById('recompose-page-list'),
    newPdfNameInput: document.getElementById('newPdfName'),
    generateNewPdfBtn: document.getElementById('generate-new-pdf-btn'),
    selectedPagesCountSpan: document.getElementById('selected-pages-count'),
};

// Central Application State
export let appState = {
    pdfDocs: [],
    pageMap: [],
    globalTotalPages: 0,
    currentPage: 1,
    currentScale: 1.0,
    currentZoomMode: 'height',
    
    searchResults: [],
    currentFileFilter: 'all',
    showSearchResultsHighlights: true,
    
    highlighterEnabled: false,
    textSelectionModeActive: false,
    paragraphSelectionModeActive: false,
    localMagnifierEnabled: false,
    pdfArrayBuffers: [],
};

export function resetAppState() {
    appState = {
        pdfDocs: [],
        pageMap: [],
        globalTotalPages: 0,
        currentPage: 1,
        currentScale: 1.0,
        currentZoomMode: 'height',
        searchResults: [],
        currentFileFilter: 'all',
        showSearchResultsHighlights: true,
        highlighterEnabled: false,
        textSelectionModeActive: false,
        paragraphSelectionModeActive: false,
        localMagnifierEnabled: false,
        pdfArrayBuffers: [],
    };
    if (dom.searchInputElem) dom.searchInputElem.value = '';
    // Also clear localStorage thumbnails if any
    Object.keys(localStorage)
        .filter(key => key.startsWith('thumbnail-'))
        .forEach(key => localStorage.removeItem(key));
}

export async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
        try {
            await saveFiles(files);
            if (dom.restoreSessionContainer) dom.restoreSessionContainer.style.display = 'none';
        } catch (dbError) {
            console.warn("Could not save session to IndexedDB, but proceeding with loading.", dbError);
        }

        try {
            await loadFilesIntoApp(files);
        } catch (loadError) {
            console.error("Failed to load or process PDF files:", loadError);
            showFeedback("Error loading or processing PDF files.");
        }
    }
}

async function loadFilesIntoApp(files) {
    resetAppState();
    UI.updateUIForNewState(); // Show a "loading" state
    
    const loadedData = await Viewer.loadAndProcessFiles(files);
    if (!loadedData) {
        showFeedback('No valid PDF files were loaded.');
        resetAppState();
        UI.updateUIForNewState();
        return;
    }

    appState.pdfDocs = loadedData.pdfDocs;
    appState.pageMap = loadedData.pageMap;
    appState.globalTotalPages = loadedData.globalTotalPages;
    appState.pdfArrayBuffers = loadedData.pdfArrayBuffers;
    
    Viewer.renderPage(1); // Render the first page
    UI.updateUIForNewState(); // Update UI with new file data
}

async function initializeApp() {
    // Set PDF.js worker source
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs`;
    } else {
        console.error("pdf.js library is not loaded!");
        return;
    }

    UI.initEventHandlers();
    Viewer.initLocalMagnifier();
    Search.initThumbnailObserver();
    UI.updateUIForNewState(); // Initial UI setup

    try {
        await initDB();
        const storedFiles = await getFiles();
        if (storedFiles.length > 0) {
            if (dom.restoreSessionContainer) dom.restoreSessionContainer.style.display = 'block';
            if (dom.restoreSessionBtn) {
                dom.restoreSessionBtn.onclick = async () => {
                    await loadFilesIntoApp(storedFiles);
                    dom.restoreSessionContainer.style.display = 'none';
                };
            }
        }
    } catch (error) {
        console.error("Could not initialize app from IndexedDB:", error);
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', initializeApp);
