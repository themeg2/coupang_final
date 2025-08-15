// Content script to extract product information
function extractProductInfo() {
  
  const products = [];
  
  // Find all product units based on the container structure (Coupang)
  const productElements = document.querySelectorAll('.ProductUnit_productUnit__Qd6sv');
  
  productElements.forEach((element, index) => {
    try {
      // Extract product name
      const nameElement = element.querySelector('.ProductUnit_productName__gre7e');
      const name = nameElement ? nameElement.textContent.trim() : '';
      
      // Extract price information
      const priceElement = element.querySelector('.Price_priceValue__A4KOr');
      const currentPrice = priceElement ? priceElement.textContent.trim() : '';
      
      const basePriceElement = element.querySelector('.PriceInfo_basePrice__8BQ32');
      const originalPrice = basePriceElement ? basePriceElement.textContent.trim() : '';
      
      // Extract unit price
      const unitPriceElement = element.querySelector('.UnitPrice_unitPrice__R_ZcA');
      const unitPrice = unitPriceElement ? unitPriceElement.textContent.trim() : '';
      
      // Extract image URL
      const imageElement = element.querySelector('.ProductUnit_productImage__Mqcg1 img');
      const imageUrl = imageElement ? imageElement.src : '';
      
      // Extract product URL
      const linkElement = element.querySelector('a');
      const productUrl = linkElement ? linkElement.href : '';
      
      // Extract rating
      const ratingElement = element.querySelector('.ProductRating_star__RGSlV');
      const ratingCountElement = element.querySelector('.ProductRating_ratingCount__R0Vhz');
      const rating = ratingElement ? ratingElement.style.width : '';
      let ratingCount = ratingCountElement ? ratingCountElement.textContent.trim() : '';
      
      // Fix negative review count - extract only numbers
      if (ratingCount) {
        const match = ratingCount.match(/\d+/);
        ratingCount = match ? match[0] : '';
      }
      
      // Extract delivery info
      const deliveryElements = element.querySelectorAll('.DeliveryInfo_delivery__c7z4P span');
      const deliveryInfo = Array.from(deliveryElements).map(span => span.textContent.trim()).join(' ');
      
      // Extract brand info if available
      const brandElement = element.querySelector('.RluxBadge_rluxBadgeBrandName__bD3_K');
      const brand = brandElement ? brandElement.textContent.trim() : '';
      
      // Extract delivery type based on badge images
      const deliveryBadges = element.querySelectorAll('.ImageBadge_default__JWaYp img, img[alt*="로켓"], img[alt*="배송"]');
      let deliveryType = '일반배송'; // Default
      
      deliveryBadges.forEach(badge => {
        const src = badge.src || '';
        const alt = badge.alt || '';
        
        // 우선순위 순서대로 체크 (더 구체적인 것부터)
        
        // 1. 로켓프레시 (신선식품 배송)
        if (alt.includes('로켓프레시') || alt.includes('프레시') ||
            src.includes('rocket-fresh') || src.includes('fresh')) {
          deliveryType = '로켓프레시';
        }
        // 2. 로켓와우 (구체적)
        else if (alt.includes('로켓와우') || alt.includes('와우') || 
                 src.includes('rocketwow') || src.includes('wow')) {
          deliveryType = '로켓와우';
        }
        // 3. 판매자로켓 (Merchant)
        else if (alt.includes('판매자') || alt === '판매자로켓' ||
                 src.includes('Merchant') || src.includes('merchant')) {
          deliveryType = '판매자로켓';
        }
        // 4. 로켓직구 (Global)
        else if (alt.includes('로켓직구') || alt.includes('직구') ||
                 src.includes('global') || src.includes('Global')) {
          deliveryType = '로켓직구';
        }
        // 5. 일반 로켓배송 (가장 일반적)
        else if (alt.includes('로켓배송') || alt === '로켓배송' ||
                 src.includes('rocket') || src.includes('Rocket')) {
          deliveryType = '로켓배송';
        }
      });
      
      // Only add product if it has essential information
      if (name && currentPrice) {
        products.push({
          index: index + 1,
          name,
          currentPrice,
          originalPrice,
          unitPrice,
          imageUrl,
          productUrl,
          rating,
          ratingCount,
          deliveryInfo,
          brand,
          deliveryType,
          extractedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error extracting product info:', error);
    }
  });
  
  return products;
}

// Get product ID from current page
function getProductIdFromCurrentPage() {
  // URL에서 productId 추출 시도
  const urlParams = new URLSearchParams(window.location.search);
  let productId = urlParams.get('productId');
  
  if (!productId) {
    // URL path에서 상품 ID 추출 시도 (/vp/products/123456789 형태)
    const pathMatch = window.location.pathname.match(/\/vp\/products\/(\d+)/);
    if (pathMatch) {
      productId = pathMatch[1];
    }
  }
  
  if (!productId) {
    // URL path에서 상품 ID 추출 시도 (/products/123456789 형태)
    const pathMatch = window.location.pathname.match(/\/products\/(\d+)/);
    if (pathMatch) {
      productId = pathMatch[1];
    }
  }
  
  return productId;
}

// Get product name from current page
function getProductNameFromCurrentPage() {
  // Try different selectors for product name
  const selectors = [
    'h1.prod-buy-header__title',
    'h1[class*="title"]',
    '.prod-buy-header__title',
    '.product-title',
    'h1',
    'title'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      return element.textContent.trim().replace(/\s+/g, ' ');
    }
  }
  
  // Fallback to document title
  return document.title.replace(' - 쿠팡!', '').trim();
}

// Extract reviews from current page (리뷰수집 기능)
async function extractReviewsFromCurrentPage(maxPages = 3) {
  const getText = (element, selector) => { 
    const el = element.querySelector(selector); 
    return el ? el.innerText.trim() : ""; 
  };
  
  const scrapeCurrentPage = () => {
    const reviewsOnPage = [];
    const reviewArticles = document.querySelectorAll("article.sdp-review__article__list");
    for (const review of reviewArticles) {
      const ratingEl = review.querySelector("div.sdp-review__article__list__info__product-info__star-orange");
      const helpfulEl = review.querySelector("div.sdp-review__article__list__help__count > strong");
      const imageElements = review.querySelectorAll("img.sdp-review__article__list__attachment__img");
      const imageUrls = [];
      imageElements.forEach(img => { 
        const url = img.getAttribute("data-origin-path") || img.src; 
        if (url) {
          // URL이 이미 https:로 시작하면 그대로, 아니면 https: 추가
          if (url.startsWith('https:') || url.startsWith('http:')) {
            imageUrls.push(url);
          } else if (url.startsWith('//')) {
            imageUrls.push("https:" + url);
          } else {
            imageUrls.push(url);
          }
        }
      });
      reviewsOnPage.push({
        user_name: getText(review, "span.sdp-review__article__list__info__user__name"),
        rating: ratingEl ? parseInt(ratingEl.getAttribute("data-rating"), 10) : 0,
        date: getText(review, "div.sdp-review__article__list__info__product-info__reg-date"),
        product_info: getText(review, "div.sdp-review__article__list__info__product-info__name"),
        headline: getText(review, "div.sdp-review__article__list__headline") || "제목 없음",
        content: getText(review, "div.sdp-review__article__list__review__content").replace(/\n/g, ' '),
        helpful_count: helpfulEl ? parseInt(helpfulEl.innerText.replace(/,/g, ''), 10) : 0,
        image_urls: imageUrls
      });
    }
    return reviewsOnPage;
  };

  try {
    const allReviews = [];
    const productId = getProductIdFromCurrentPage();

    for (let i = 1; i <= maxPages; i++) {
      chrome.runtime.sendMessage({ action: 'reviewStatus', status: `${i} / ${maxPages} 페이지 수집 중...` });
      
      const reviewSection = document.getElementById("sdpReview");
      if (reviewSection) {
        reviewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        await new Promise(resolve => setTimeout(resolve, 500));
      } else { 
        throw new Error("상품평 섹션을 찾을 수 없습니다."); 
      }
      
      const reviews = scrapeCurrentPage();
      if (reviews.length === 0 && i > 1) {
        chrome.runtime.sendMessage({ action: 'reviewStatus', status: `${i} 페이지에 리뷰가 없어 중단합니다.` }); 
        break;
      }
      allReviews.push(...reviews);

      if (i === maxPages) {
        chrome.runtime.sendMessage({ action: 'reviewStatus', status: '요청한 페이지까지 수집 완료!' });
        break;
      }
      
      const nextPageButton = document.querySelector(`button.sdp-review__article__page__num[data-page='${i + 1}']`);
      if (nextPageButton) {
        nextPageButton.click();
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        chrome.runtime.sendMessage({ action: 'reviewStatus', status: '마지막 페이지입니다.' });
        break;
      }
    }
    
    return { reviews: allReviews, productId: productId };
  } catch (error) {
    chrome.runtime.sendMessage({ action: 'reviewError', error: error.message });
    throw error;
  }
}

// Listen for messages from background and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ success: true, ready: true });
  } else if (request.action === 'extractProducts') {
    const products = extractProductInfo();
    sendResponse({ products });
  } else if (request.action === 'extractReviews') {
    const maxPages = request.maxPages || 3;
    extractReviewsFromCurrentPage(maxPages).then(result => {
      sendResponse({ success: true, reviews: result.reviews, productId: result.productId });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // 비동기 응답을 위해 true 반환
  }
});