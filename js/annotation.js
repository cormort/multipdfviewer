import { dom, appState } from './state.js';
import { updatePageControls } from './ui.js';
import { getEventPosition, showFeedback } from './utils.js';
import { currentPageTextContent, currentViewport } from './viewer.js';

let isDrawing = false;
let lastX = 0;
let lastY = 0;

export function deactivateAllModes(except = null) {
    if (except !== 'highlighter' && appState.highlighterEnabled) {
        appState.highlighterEnabled = false;
        if (dom.drawingCanvas) dom.drawingCanvas.style.pointerEvents = 'none';
    }
    if (except !== 'textSelection' && appState.textSelectionModeActive) {
        appState.textSelectionModeActive = false;
        if (dom.textLayerDivGlobal) {
            dom.textLayerDivGlobal.classList.remove('text-selection-active');
        }
    }
    if (except !== 'localMagnifier' && appState.localMagnifierEnabled) {
        appState.localMagnifierEnabled = false;
        if (dom.magnifierGlass) dom.magnifierGlass.style.display = 'none';
    }
    if (except !== 'paragraphSelection' && appState.paragraphSelectionModeActive) {
        appState.paragraphSelectionModeActive = false;
        if (dom.pdfContainer) dom.pdfContainer.classList.remove('paragraph-selection-mode');
        clearParagraphHighlights();
    }
    updatePageControls();
}

export function startDrawing(e) {
    if (!appState.highlighterEnabled) return;
    isDrawing = true;
    const pos = getEventPosition(dom.drawingCanvas, e);
    [lastX, lastY] = [pos.x, pos.y];
    dom.drawingCtx.beginPath();
    dom.drawingCtx.moveTo(lastX, lastY);
    if (e.type === 'touchstart') e.preventDefault();
}

export function draw(e) {
    if (!isDrawing || !appState.highlighterEnabled) return;
    const pos = getEventPosition(dom.drawingCanvas, e);
    dom.drawingCtx.lineTo(pos.x, pos.y);
    dom.drawingCtx.stroke();
    [lastX, lastY] = [pos.x, pos.y];
    if (e.type === 'touchmove') e.preventDefault();
}

export function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
}

export function toggleHighlighter() {
    const wasActive = appState.highlighterEnabled;
    deactivateAllModes();
    if (!wasActive) {
        appState.highlighterEnabled = true;
        if (dom.drawingCanvas) {
            dom.drawingCanvas.style.pointerEvents = 'auto';
            dom.drawingCtx.strokeStyle = 'rgba(255, 255, 0, 0.3)'; // Highlighter color
            dom.drawingCtx.lineWidth = 15;
            dom.drawingCtx.lineJoin = 'round';
            dom.drawingCtx.lineCap = 'round';
        }
    }
    updatePageControls();
}

export function toggleTextSelection() {
    const wasActive = appState.textSelectionModeActive;
    deactivateAllModes();
    if (!wasActive) {
        appState.textSelectionModeActive = true;
        if (dom.textLayerDivGlobal) {
            dom.textLayerDivGlobal.classList.add('text-selection-active');
        }
    }
    updatePageControls();
}

export function toggleParagraphSelection() {
    if (appState.pdfDocs.length === 0 || !appState.textSelectionModeActive) return;

    appState.paragraphSelectionModeActive = !appState.paragraphSelectionModeActive;

    if (appState.paragraphSelectionModeActive) {
        if (dom.pdfContainer) dom.pdfContainer.classList.add('paragraph-selection-mode');
    } else {
        if (dom.pdfContainer) dom.pdfContainer.classList.remove('paragraph-selection-mode');
        clearParagraphHighlights();
    }
    
    updatePageControls();
}

export function clearParagraphHighlights() {
    document.querySelectorAll('.paragraph-highlight, #copy-paragraph-btn').forEach(el => el.remove());
}

export function handleParagraphSelection(e) {
    if (!appState.paragraphSelectionModeActive || !currentPageTextContent || !currentViewport) return;

    clearParagraphHighlights();

    const pos = getEventPosition(dom.textLayerDivGlobal, e);
    const clickPoint = { x: pos.x, y: pos.y };

    let closestItem = null;
    let minDistance = Infinity;

    // Find the text item closest to the click
    currentPageTextContent.items.forEach(item => {
        const itemRect = {
            left: item.transform[4],
            top: item.transform[5] - item.height,
            right: item.transform[4] + item.width,
            bottom: item.transform[5]
        };
        const transformedRect = pdfjsLib.util.transform(currentViewport.transform, itemRect);
        
        // A simple distance check (could be more sophisticated)
        const distance = Math.sqrt(Math.pow(clickPoint.x - transformedRect.left, 2) + Math.pow(clickPoint.y - transformedRect.bottom, 2));
        if (distance < minDistance) {
            minDistance = distance;
            closestItem = item;
        }
    });

    if (!closestItem || minDistance > closestItem.height * 2) return; // Ignore clicks too far away

    const lineTolerance = closestItem.height * 0.5;
    const paragraphBreakTolerance = closestItem.height * 1.5;

    const lines = [];
    let currentLine = [];
    let lastY = -1;

    const sortedItems = [...currentPageTextContent.items].sort((a, b) => a.transform[5] - b.transform[5] || a.transform[4] - b.transform[4]);

    sortedItems.forEach(item => {
        if (lastY === -1 || Math.abs(item.transform[5] - lastY) < lineTolerance) {
            currentLine.push(item);
        } else {
            lines.push(currentLine.sort((a, b) => a.transform[4] - b.transform[4]));
            currentLine = [item];
        }
        lastY = item.transform[5];
    });
    lines.push(currentLine.sort((a, b) => a.transform[4] - b.transform[4]));

    let clickedLineIndex = lines.findIndex(line => line.includes(closestItem));
    if (clickedLineIndex === -1) return;

    let paragraphStartLine = clickedLineIndex;
    while (paragraphStartLine > 0) {
        const currentLineY = lines[paragraphStartLine][0].transform[5];
        const prevLineY = lines[paragraphStartLine - 1][0].transform[5];
        if (Math.abs(currentLineY - prevLineY) > paragraphBreakTolerance) break;
        paragraphStartLine--;
    }

    let paragraphEndLine = clickedLineIndex;
    while (paragraphEndLine < lines.length - 1) {
        const currentLineY = lines[paragraphEndLine][0].transform[5];
        const nextLineY = lines[paragraphEndLine + 1][0].transform[5];
        if (Math.abs(nextLineY - currentLineY) > paragraphBreakTolerance) break;
        paragraphEndLine++;
    }

    let paragraphText = '';
    for (let i = paragraphStartLine; i <= paragraphEndLine; i++) {
        const line = lines[i];
        if (line.length === 0) continue;
        const firstItem = line[0];
        const lastItem = line[line.length - 1];

        const firstItemRect = { left: firstItem.transform[4], top: firstItem.transform[5] - firstItem.height, right: 0, bottom: 0 };
        const lastItemRect = { left: 0, top: 0, right: lastItem.transform[4] + lastItem.width, bottom: lastItem.transform[5] };

        const highlight = document.createElement('div');
        highlight.className = 'paragraph-highlight';
        highlight.style.left = `${firstItem.transform[4]}px`;
        highlight.style.top = `${firstItem.transform[5] - firstItem.height}px`;
        highlight.style.width = `${(lastItem.transform[4] + lastItem.width) - firstItem.transform[4]}px`;
        highlight.style.height = `${firstItem.height}px`;

        // Apply viewport transform
        highlight.style.transform = `matrix(${currentViewport.transform.join(',')})`;
        highlight.style.transformOrigin = '0 0';
        
        dom.textLayerDivGlobal.appendChild(highlight);
        paragraphText += line.map(item => item.str).join('') + '\n';
    }

    const lastLineOfParagraph = lines[paragraphEndLine];
    if (lastLineOfParagraph.length > 0) {
        const lastItemOfParagraph = lastLineOfParagraph[lastLineOfParagraph.length - 1];
        const copyBtn = document.createElement('button');
        copyBtn.id = 'copy-paragraph-btn';
        copyBtn.textContent = '複製';
        copyBtn.style.left = `${lastItemOfParagraph.transform[4] + lastItemOfParagraph.width + 5}px`;
        copyBtn.style.top = `${lastItemOfParagraph.transform[5] - lastItemOfParagraph.height}px`;
        copyBtn.style.transform = `matrix(${currentViewport.transform.join(',')})`;
        copyBtn.style.transformOrigin = '0 0';
        
        copyBtn.onclick = async () => {
            try {
                await navigator.clipboard.writeText(paragraphText.trim());
                showFeedback('段落已複製！');
                clearParagraphHighlights();
            } catch (err) {
                showFeedback('複製失敗。');
                console.error('Copy failed:', err);
            }
        };
        dom.textLayerDivGlobal.appendChild(copyBtn);
    }
}
