export function showFeedback(message) {
    let feedbackDiv = document.getElementById('feedback-message');
    if (!feedbackDiv) {
        console.warn("Feedback element not found in DOM.");
        return;
    }
    feedbackDiv.textContent = message;
    feedbackDiv.style.opacity = '1';
    setTimeout(() => { feedbackDiv.style.opacity = '0'; }, 2000);
}

export function getEventPosition(element, event) {
    if (!element) return { x: 0, y: 0 };
    const rect = element.getBoundingClientRect();
    let clientX, clientY;
    if (event.touches && event.touches.length > 0) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
}

// Function to get a pattern from the search input
export function getPatternFromSearchInput(searchInputElem) {
    const input = searchInputElem ? searchInputElem.value.trim() : null;
    if (!input) return null;
    try {
        if (input.startsWith('/') && input.lastIndexOf('/') > 0) {
            const lastSlashIndex = input.lastIndexOf('/');
            return new RegExp(input.slice(1, lastSlashIndex), input.slice(lastSlashIndex + 1));
        } else {
            const escapedInput = input.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
            const keywords = escapedInput.split(/\s+/).filter(k => k.length > 0);
            if (keywords.length > 0) return new RegExp(keywords.join('.*?'), 'gi');
        }
    } catch (e) {
        console.warn('Could not create regex from input:', e);
        return null;
    }
    return null;
}
