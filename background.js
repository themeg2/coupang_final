// Background script for the Chrome extension
let mainWindow = null;

chrome.runtime.onInstalled.addListener(() => {
    console.log('쿠팡 통합 도구 extension installed');
});

// Handle extension icon click - open as standalone window
chrome.action.onClicked.addListener(async (tab) => {
    // Check if window already exists and is open
    if (mainWindow) {
        try {
            const window = await chrome.windows.get(mainWindow);
            if (window) {
                // Focus existing window
                chrome.windows.update(mainWindow, { focused: true });
                return;
            }
        } catch (error) {
            // Window doesn't exist anymore, create new one
            mainWindow = null;
        }
    }
    
    // Create new standalone window
    chrome.windows.create({
        url: chrome.runtime.getURL('popup.html'),
        type: 'popup',
        width: 800,
        height: 1000,
        focused: true
    }, (window) => {
        mainWindow = window.id;
    });
});

// Handle window closed event
chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === mainWindow) {
        mainWindow = null;
    }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received in background:', request);
    
    if (request.action === 'saveProducts') {
        // Save products to storage
        chrome.storage.local.set({
            extractedProducts: request.products,
            lastExtracted: new Date().toISOString(),
            pageUrl: sender.tab ? sender.tab.url : ''
        }).then(() => {
            sendResponse({ success: true });
        }).catch((error) => {
            sendResponse({ success: false, error: error.message });
        });
        
        return true; // Keep message channel open for async response
    } else if (request.action === 'download' || request.action === 'downloadImage') {
        // 통합된 다운로드 기능
        try {
            chrome.downloads.download({
                url: request.url,
                filename: request.filename,
                saveAs: false,
                conflictAction: 'uniquify'
            }, (downloadId) => {
                if (chrome.runtime.lastError) {
                    console.error('Download error:', chrome.runtime.lastError);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    console.log('Download started:', downloadId);
                    sendResponse({ success: true, downloadId: downloadId });
                }
            });
        } catch (error) {
            console.error('Download error:', error);
            sendResponse({ success: false, error: error.message });
        }
        return true; // 비동기 응답을 위해 true 반환
    } else if (request.action === 'downloadBlob') {
        // Handle blob download from content script
        try {
            const blob = new Blob([request.data], { type: request.type });
            const url = URL.createObjectURL(blob);
            
            chrome.downloads.download({
                url: url,
                filename: request.filename,
                conflictAction: 'uniquify'
            }, (downloadId) => {
                if (chrome.runtime.lastError) {
                    console.error('Blob download error:', chrome.runtime.lastError);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    console.log('Blob download started:', downloadId);
                    sendResponse({ success: true, downloadId: downloadId });
                    
                    // Clean up the object URL
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                }
            });
        } catch (error) {
            console.error('Blob download error:', error);
            sendResponse({ success: false, error: error.message });
        }
        return true; // Keep message channel open for async response
    } else if (request.action === 'reviewStatus') {
        // 리뷰 수집 상태 메시지 처리
        console.log('Review status:', request.status);
    } else if (request.action === 'reviewError') {
        // 리뷰 수집 에러 메시지 처리
        console.error('Review error:', request.error);
    }
});

// 다운로드 완료 이벤트 처리
chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state && delta.state.current === 'complete') {
        console.log('Download completed:', delta.id);
    }
});