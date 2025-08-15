document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const toolSelector = document.getElementById('toolSelector');
    const statusText = document.getElementById('statusText');
    const status = document.getElementById('status');
    
    // Product extraction elements
    const extractBtn = document.getElementById('extractBtn');
    const exportBtn = document.getElementById('exportBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const copyBtn = document.getElementById('copyBtn');
    const productCount = document.getElementById('productCount');
    const lastUpdated = document.getElementById('lastUpdated');
    const productList = document.getElementById('productList');
    
    // Review scraping elements
    const scrapeBtn = document.getElementById('scrapeBtn');
    const pageCountInput = document.getElementById('pageCount');
    
    // Image download elements
    const jsonFile = document.getElementById('jsonFile');
    const downloadFolder = document.getElementById('downloadFolder');
    const maxDownloads = document.getElementById('maxDownloads');
    const fileInfo = document.getElementById('fileInfo');
    const analysisInfo = document.getElementById('analysisInfo');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const logArea = document.getElementById('logArea');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const stopBtn = document.getElementById('stopBtn');
    const clearLogBtn = document.getElementById('clearLogBtn');
    
    // Common elements
    const clearBtn = document.getElementById('clearBtn');
    
    let currentProducts = [];
    let isDownloading = false;
    let stopRequested = false;
    let jsonData = null;
    let validUrls = [];

    // Tool section switching
    toolSelector.addEventListener('change', function() {
        const selectedTool = this.value;
        
        // Hide all sections
        document.querySelectorAll('.tool-section').forEach(section => {
            section.classList.remove('active');
        });
        
        // Show selected section
        document.getElementById(selectedTool + 'Section').classList.add('active');
        
        // Update status
        switch(selectedTool) {
            case 'product':
                setStatus('info', '상품 정보 추출 도구가 선택되었습니다.');
                loadSavedProducts();
                break;
            case 'review':
                setStatus('info', '리뷰 수집 도구가 선택되었습니다.');
                break;
            case 'download':
                setStatus('info', '이미지 다운로드 도구가 선택되었습니다.');
                break;
        }
    });

    // Product extraction functionality
    extractBtn.addEventListener('click', async () => {
        try {
            setStatus('loading', '상품 정보를 추출 중...');
            extractBtn.disabled = true;
            
            // Find the most recently active tab in any window
            const tabs = await chrome.tabs.query({ active: true });
            const coupangTab = tabs.find(tab => tab.url && tab.url.includes('coupang.com'));
            
            if (!coupangTab) {
                setStatus('error', '쿠팡 사이트에서만 사용 가능합니다. 쿠팡 페이지를 열어주세요.');
                return;
            }
            
            const tab = coupangTab;
            
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractProducts' });
            
            if (response && response.products && response.products.length > 0) {
                currentProducts = response.products;
                
                await chrome.storage.local.set({
                    extractedProducts: currentProducts,
                    lastExtracted: new Date().toISOString(),
                    pageUrl: tab.url
                });
                
                displayProducts(currentProducts);
                setStatus('success', `${currentProducts.length}개 상품이 추출되었습니다.`);
                exportBtn.disabled = false;
                exportCsvBtn.disabled = false;
                copyBtn.disabled = false;
            } else {
                setStatus('error', '추출할 상품이 없습니다.');
            }
            
        } catch (error) {
            console.error('Extraction error:', error);
            setStatus('error', '추출 중 오류가 발생했습니다.');
        } finally {
            extractBtn.disabled = false;
        }
    });

    exportBtn.addEventListener('click', () => {
        if (currentProducts.length === 0) return;
        
        const dataStr = JSON.stringify(currentProducts, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `coupang-products-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        setStatus('success', 'JSON 파일이 다운로드되었습니다.');
    });

    exportCsvBtn.addEventListener('click', () => {
        if (currentProducts.length === 0) return;
        
        const csvData = convertToCSV(currentProducts);
        const dataBlob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `coupang-products-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        
        setStatus('success', 'CSV 파일이 다운로드되었습니다.');
    });

    copyBtn.addEventListener('click', async () => {
        if (currentProducts.length === 0) return;
        
        try {
            const clipboardData = convertToClipboardFormat(currentProducts);
            await navigator.clipboard.writeText(clipboardData);
            
            setStatus('success', '클립보드에 복사되었습니다.');
        } catch (error) {
            console.error('Clipboard copy failed:', error);
            setStatus('error', '클립보드 복사에 실패했습니다.');
        }
    });

    // Review scraping functionality
    scrapeBtn.addEventListener('click', async () => {
        // Find the most recently active tab in any window
        const tabs = await chrome.tabs.query({ active: true });
        const coupangTab = tabs.find(tab => tab.url && tab.url.includes('coupang.com/vp/products/'));
        
        if (coupangTab) {
            const tab = coupangTab;
            const maxPages = parseInt(pageCountInput.value, 10);
            if (isNaN(maxPages) || maxPages < 1) {
                setStatus('error', '페이지 수는 1 이상이어야 합니다.');
                return;
            }

            scrapeBtn.disabled = true;
            scrapeBtn.textContent = '수집 중...';
            setStatus('loading', '리뷰 수집을 시작합니다...');

            try {
                const response = await chrome.tabs.sendMessage(tab.id, { 
                    action: 'extractReviews', 
                    maxPages: maxPages 
                });

                if (response && response.success) {
                    const reviewsJson = JSON.stringify(response.reviews, null, 2);
                    const blob = new Blob(['\uFEFF' + reviewsJson], { type: 'application/json;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const timestamp = new Date().toISOString().slice(0, 19).replace(/[-T:]/g, "");
                    const productName = response.productName || response.productId || 'product';
                    
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${productName}.json`;
                    link.click();
                    
                    setStatus('success', `${response.reviews.length}개 리뷰가 수집되어 다운로드되었습니다.`);
                } else {
                    setStatus('error', `리뷰 수집 실패: ${response.error || '알 수 없는 오류'}`);
                }
            } catch (error) {
                setStatus('error', `리뷰 수집 중 오류: ${error.message}`);
            } finally {
                scrapeBtn.disabled = false;
                scrapeBtn.textContent = '리뷰 수집 시작';
            }

        } else {
            setStatus('error', '쿠팡 상품 상세 페이지를 열어주세요.');
        }
    });

    // Image download functionality
    jsonFile.addEventListener('change', handleFileSelect);
    analyzeBtn.addEventListener('click', analyzeJson);
    downloadBtn.addEventListener('click', startDownload);
    stopBtn.addEventListener('click', stopDownload);
    clearLogBtn.addEventListener('click', clearLog);

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            fileInfo.textContent = `선택된 파일: ${file.name}`;
            logMessage(`파일 선택: ${file.name}`, 'info');
        }
    }

    function logMessage(message, type = 'info') {
        const time = new Date().toLocaleTimeString('ko-KR', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = time;
        
        const messageSpan = document.createElement('span');
        messageSpan.className = `log-${type}`;
        messageSpan.textContent = ` - ${message}`;
        
        logEntry.appendChild(timeSpan);
        logEntry.appendChild(messageSpan);
        
        logArea.appendChild(logEntry);
        logArea.scrollTop = logArea.scrollHeight;
    }

    function clearLog() {
        logArea.innerHTML = '';
    }

    async function analyzeJson() {
        const file = jsonFile.files[0];
        if (!file) {
            setStatus('error', 'JSON 파일을 선택해주세요.');
            return;
        }
        
        try {
            const text = await file.text();
            jsonData = JSON.parse(text);
            
            const imageUrls = [];
            for (const review of jsonData) {
                if (review.image_urls && Array.isArray(review.image_urls)) {
                    imageUrls.push(...review.image_urls);
                }
            }
            
            const supportedExtensions = ['.jpg', '.jpeg', '.png'];
            validUrls = [];
            
            for (let url of imageUrls) {
                if (url.startsWith('https:https://')) {
                    url = url.replace('https:https://', 'https://');
                }
                
                const urlLower = url.toLowerCase();
                if (supportedExtensions.some(ext => urlLower.includes(ext))) {
                    validUrls.push(url);
                }
            }
            
            const maxDownloadsVal = parseInt(maxDownloads.value) || 0;
            const downloadCount = maxDownloadsVal > 0 ? 
                Math.min(maxDownloadsVal, validUrls.length) : validUrls.length;
            
            analysisInfo.innerHTML = `
                <p>총 리뷰 개수: ${jsonData.length}</p>
                <p>전체 이미지 URL: ${imageUrls.length}</p>
                <p>유효한 이미지 (JPG/PNG): ${validUrls.length}</p>
                <p>다운로드 예정: ${downloadCount}개</p>
            `;
            
            downloadBtn.disabled = false;
            logMessage(`파일 분석 완료 - 유효한 이미지: ${validUrls.length}개`, 'success');
            
        } catch (error) {
            setStatus('error', `파일 분석 중 오류: ${error.message}`);
            logMessage(`분석 오류: ${error.message}`, 'error');
        }
    }

    async function startDownload() {
        if (!validUrls || validUrls.length === 0) {
            setStatus('error', '먼저 JSON 파일을 분석해주세요.');
            return;
        }
        
        if (isDownloading) return;
        
        isDownloading = true;
        stopRequested = false;
        
        downloadBtn.disabled = true;
        stopBtn.disabled = false;
        
        const folderName = downloadFolder.value || 'downloaded_images';
        const maxDownloadsVal = parseInt(maxDownloads.value) || 0;
        const urlsToDownload = maxDownloadsVal > 0 ? 
            validUrls.slice(0, maxDownloadsVal) : validUrls;
        
        const totalCount = urlsToDownload.length;
        let downloadedCount = 0;
        let failedCount = 0;
        
        progressBar.style.width = '0%';
        progressText.textContent = `다운로드 중... (0/${totalCount})`;
        
        for (let i = 0; i < urlsToDownload.length; i++) {
            if (stopRequested) break;
            
            const url = urlsToDownload[i];
            const progress = ((i + 1) / totalCount * 100).toFixed(1);
            
            try {
                let extension = '.jpg';
                if (url.toLowerCase().includes('.png')) extension = '.png';
                else if (url.toLowerCase().includes('.jpeg')) extension = '.jpeg';
                
                const filename = `${folderName}/image_${String(i + 1).padStart(4, '0')}${extension}`;
                
                progressBar.style.width = `${progress}%`;
                progressText.textContent = `다운로드 중... (${i + 1}/${totalCount})`;
                
                await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage({
                        action: 'download',
                        url: url,
                        filename: filename
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else if (response && response.success) {
                            resolve(response);
                        } else {
                            reject(new Error(response?.error || '다운로드 실패'));
                        }
                    });
                });
                
                downloadedCount++;
                logMessage(`✓ 다운로드 완료: ${filename}`, 'success');
                
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                failedCount++;
                logMessage(`✗ 다운로드 실패: ${error.message}`, 'error');
            }
        }
        
        isDownloading = false;
        downloadBtn.disabled = false;
        stopBtn.disabled = true;
        
        if (stopRequested) {
            progressText.textContent = '중지됨';
            logMessage('다운로드 중지됨', 'info');
        } else {
            progressText.textContent = `완료 - 성공: ${downloadedCount}, 실패: ${failedCount}`;
            setStatus('success', `다운로드 완료! 성공: ${downloadedCount}개, 실패: ${failedCount}개`);
        }
    }

    function stopDownload() {
        stopRequested = true;
        logMessage('다운로드 중지 요청...', 'info');
    }

    // Common functionality
    clearBtn.addEventListener('click', async () => {
        if (confirm('저장된 모든 데이터를 삭제하시겠습니까?')) {
            currentProducts = [];
            await chrome.storage.local.clear();
            
            displayProducts([]);
            setStatus('success', '기록이 삭제되었습니다.');
            exportBtn.disabled = true;
            exportCsvBtn.disabled = true;
            copyBtn.disabled = true;
        }
    });

    // Helper functions
    async function loadSavedProducts() {
        try {
            const result = await chrome.storage.local.get(['extractedProducts', 'lastExtracted']);
            
            if (result.extractedProducts && result.extractedProducts.length > 0) {
                currentProducts = result.extractedProducts;
                displayProducts(currentProducts);
                exportBtn.disabled = false;
                exportCsvBtn.disabled = false;
                copyBtn.disabled = false;
                
                if (result.lastExtracted) {
                    const lastTime = new Date(result.lastExtracted);
                    const timeAgo = getTimeAgo(lastTime);
                    setStatus('success', `마지막 추출: ${timeAgo}`);
                }
            }
        } catch (error) {
            console.error('Error loading saved products:', error);
        }
    }

    function displayProducts(products) {
        productCount.textContent = `${products.length}개 상품`;
        
        if (products.length === 0) {
            productList.innerHTML = `
                <div class="empty-state">
                    <p>추출된 상품이 없습니다.</p>
                    <p>쿠팡 상품 페이지에서 "정보 추출" 버튼을 클릭하세요.</p>
                </div>
            `;
            return;
        }
        
        const now = new Date();
        lastUpdated.textContent = now.toLocaleString('ko-KR');
        
        productList.innerHTML = products.map(product => `
            <div class="product-item">
                <div class="product-header">
                    ${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.name}" class="product-image">` : ''}
                    <div class="product-info">
                        ${product.brand ? `<div class="product-brand">${product.brand}</div>` : ''}
                        <h3 class="product-name">${product.name}</h3>
                        <div class="product-price">
                            <span class="current-price">${product.currentPrice}</span>
                            ${product.originalPrice ? `<span class="original-price">${product.originalPrice}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="product-details">
                    ${product.unitPrice ? `<div>단위가격: ${product.unitPrice}</div>` : ''}
                    ${product.rating && product.ratingCount ? `
                        <div class="rating">평점: ${product.rating} ${product.ratingCount}</div>
                    ` : ''}
                    ${product.deliveryInfo ? `<div class="delivery-info">${product.deliveryInfo}</div>` : ''}
                    ${product.productUrl ? `<a href="${product.productUrl}" target="_blank" style="font-size: 11px; color: #007bff;">상품 보기</a>` : ''}
                </div>
            </div>
        `).join('');
    }

    function setStatus(type, message) {
        status.className = `status ${type}`;
        statusText.textContent = message;
    }

    function convertToClipboardFormat(products) {
        const headers = [
            '순번', '상품명', '브랜드', '현재가격', '원가격', '단위가격', '평점', '리뷰수',
            '배송유형', '배송정보', '상품URL', '이미지URL', '추출일시'
        ];
        
        const rows = [headers.join('\t')];
        
        products.forEach(product => {
            const row = [
                product.index || '',
                product.name?.replace(/\t/g, ' ') || '',
                product.brand?.replace(/\t/g, ' ') || '',
                product.currentPrice?.replace(/\t/g, ' ') || '',
                product.originalPrice?.replace(/\t/g, ' ') || '',
                product.unitPrice?.replace(/\t/g, ' ') || '',
                product.rating?.replace(/\t/g, ' ') || '',
                product.ratingCount?.replace(/\t/g, ' ') || '',
                product.deliveryType || '일반배송',
                product.deliveryInfo?.replace(/\t/g, ' ') || '',
                product.productUrl || '',
                product.imageUrl || '',
                product.extractedAt || ''
            ];
            rows.push(row.join('\t'));
        });
        
        return rows.join('\n');
    }

    function convertToCSV(products) {
        const headers = [
            '순번', '상품명', '브랜드', '현재가격', '원가격', '단위가격', '평점', '리뷰수',
            '배송유형', '배송정보', '상품URL', '이미지URL', '추출일시'
        ];
        
        const csvRows = [headers.join(',')];
        
        products.forEach(product => {
            const row = [
                product.index || '',
                `"${product.name?.replace(/"/g, '""') || ''}"`,
                `"${product.brand?.replace(/"/g, '""') || ''}"`,
                `"${product.currentPrice?.replace(/"/g, '""') || ''}"`,
                `"${product.originalPrice?.replace(/"/g, '""') || ''}"`,
                `"${product.unitPrice?.replace(/"/g, '""') || ''}"`,
                `"${product.rating?.replace(/"/g, '""') || ''}"`,
                `"${product.ratingCount?.replace(/"/g, '""') || ''}"`,
                `"${product.deliveryType || '일반배송'}"`,
                `"${product.deliveryInfo?.replace(/"/g, '""') || ''}"`,
                `"${product.productUrl?.replace(/"/g, '""') || ''}"`,
                `"${product.imageUrl?.replace(/"/g, '""') || ''}"`,
                `"${product.extractedAt?.replace(/"/g, '""') || ''}"`
            ];
            csvRows.push(row.join(','));
        });
        
        return '\ufeff' + csvRows.join('\n');
    }

    function getTimeAgo(date) {
        const now = new Date();
        const diff = now - date;
        
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (days > 0) return `${days}일 전`;
        if (hours > 0) return `${hours}시간 전`;
        if (minutes > 0) return `${minutes}분 전`;
        return '방금 전';
    }

    // Initialize
    loadSavedProducts();
});