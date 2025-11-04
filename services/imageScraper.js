const axios = require('axios');
const cheerio = require('cheerio');
const { HttpsProxyAgent } = require('https-proxy-agent');

class ImageScraper {
  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
    ];
    this.proxies = this.loadProxies();
    this.currentProxyIndex = 0;
    this.currentUserAgentIndex = 0;
  }

  /**
   * Get next user agent for rotation
   * @returns {string} User agent string
   */
  getNextUserAgent() {
    const userAgent = this.userAgents[this.currentUserAgentIndex];
    this.currentUserAgentIndex = (this.currentUserAgentIndex + 1) % this.userAgents.length;
    return userAgent;
  }

  /**
   * Load proxies from environment variable
   * @returns {Array} Array of proxy URLs
   */
  loadProxies() {
    const proxyList = process.env.PROXY_LIST;
    if (!proxyList) {
      console.warn('No PROXY_LIST found in environment variables');
      return [];
    }
    
    const proxies = proxyList.split(',').map(proxy => proxy.trim());
    console.log(`Loaded ${proxies.length} proxies for rotation`);
    return proxies;
  }

  /**
   * Get next proxy for rotation
   * @returns {string|null} Proxy URL or null if no proxies available
   */
  getNextProxy() {
    if (this.proxies.length === 0) return null;
    
    const proxy = this.proxies[this.currentProxyIndex];
    this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;
    return proxy;
  }

  /**
   * Create axios config with proxy and rotating user agent
   * @param {string} proxy - Proxy URL
   * @param {boolean} isApiCall - Whether this is for the API call (different headers)
   * @returns {Object} Axios configuration object
   */
  createAxiosConfig(proxy = null, isApiCall = false) {
    const userAgent = this.getNextUserAgent();
    
    const config = {
      headers: {
        'User-Agent': userAgent,
        'Accept': isApiCall ? 'application/json, text/javascript, */*; q=0.01' : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/avif,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': isApiCall ? 'empty' : 'document',
        'Sec-Fetch-Mode': isApiCall ? 'cors' : 'navigate',
        'Sec-Fetch-Site': isApiCall ? 'same-origin' : 'none',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: 45000,
      maxRedirects: 5
    };

    if (isApiCall) {
      config.headers['X-Requested-With'] = 'XMLHttpRequest';
      config.headers['Referer'] = 'https://duckduckgo.com/';
    } else {
      config.headers['Upgrade-Insecure-Requests'] = '1';
    }

    if (proxy) {
      config.httpsAgent = new HttpsProxyAgent(proxy);
      config.httpAgent = new HttpsProxyAgent(proxy);
      console.log(`Using proxy: ${proxy.split('@')[1] || proxy}`); // Hide credentials in log
    }

    return config;
  }

  /**
   * Search for images on DuckDuckGo with proxy rotation
   * @param {string} keyword - Search keyword
   * @param {number} limit - Number of images to fetch (default: 3)
   * @returns {Promise<Array>} Array of image URLs
   */
  async searchImages(keyword, limit = 3) {
    const maxRetries = Math.min(8, this.proxies.length); // Try up to 8 different proxies
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(`🔍 DuckDuckGo search attempt ${attempt + 1}/${maxRetries} for keyword: ${keyword}`);
        
        // Get next proxy for this attempt
        const proxy = this.getNextProxy();
        
        // DuckDuckGo image search URL
        const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(keyword)}&t=h_&iax=images&ia=images`;
        
        // First, get the search page with realistic browser headers
        const searchConfig = this.createAxiosConfig(proxy, false);
        const response = await axios.get(searchUrl, searchConfig);

        const $ = cheerio.load(response.data);
        
        // Extract vqd token needed for DuckDuckGo API
        const vqdMatch = response.data.match(/vqd=['"]([^'"]+)['"]/);
        if (!vqdMatch) {
          throw new Error('Could not extract vqd token from DuckDuckGo');
        }
        
        const vqd = vqdMatch[1];
        console.log('✅ VQD token extracted:', vqd);

        // Wait a bit to simulate human behavior
        await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

        // Now make the actual image search API call with API-specific headers
        const imageApiUrl = `https://duckduckgo.com/i.js`;
        const imageApiConfig = this.createAxiosConfig(proxy, true);
        imageApiConfig.params = {
          l: 'us-en',
          o: 'json',
          q: keyword,
          vqd: vqd,
          f: ',,,',
          p: '1',
          v7exp: 'a'
        };

        const imageResponse = await axios.get(imageApiUrl, imageApiConfig);
        const imageData = imageResponse.data;
        
        if (!imageData.results || imageData.results.length === 0) {
          throw new Error('No images found in DuckDuckGo results');
        }

        // Filter and process images
        const imageUrls = this.processImageResults(imageData.results, limit);
        
        if (imageUrls.length === 0) {
          throw new Error('No valid images after filtering');
        }

        console.log(`✅ Successfully found ${imageUrls.length} valid images using DuckDuckGo`);
        return imageUrls;

      } catch (error) {
        lastError = error;
        console.error(`❌ DuckDuckGo search attempt ${attempt + 1} failed:`, error.message);
        
        // If this was the last attempt, we'll throw the error
        if (attempt === maxRetries - 1) {
          break;
        }
        
        // Wait longer between failed attempts with some randomization
        const waitTime = 2000 + (attempt * 1000) + Math.random() * 2000;
        console.log(`⏳ Waiting ${Math.round(waitTime/1000)}s before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    // If we get here, all attempts failed
    throw new Error(`DuckDuckGo search failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
  }

  /**
   * Process and filter image results
   * @param {Array} results - Raw image results from DuckDuckGo
   * @param {number} limit - Number of images to return
   * @returns {Array} Filtered image URLs
   */
  processImageResults(results, limit) {
    const validImages = [];
    
    for (const result of results) {
      if (validImages.length >= limit) break;
      
      const imageUrl = result.image;
      const sourceUrl = result.url;
      
      // Skip if no image URL
      if (!imageUrl) continue;
      
      // Filter out Wikipedia images
      if (this.isWikipediaSource(sourceUrl) || this.isWikipediaSource(imageUrl)) {
        console.log('Skipping Wikipedia image:', imageUrl);
        continue;
      }
      
      // Check if image URL is valid
      if (this.isValidImageUrl(imageUrl)) {
        validImages.push({
          url: imageUrl,
          source: sourceUrl,
          title: result.title || 'Untitled'
        });
      }
    }
    
    return validImages;
  }



  /**
   * Check if URL is from Wikipedia
   * @param {string} url - URL to check
   * @returns {boolean} True if from Wikipedia
   */
  isWikipediaSource(url) {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    return lowerUrl.includes('wikipedia.org') || 
           lowerUrl.includes('wikimedia.org') ||
           lowerUrl.includes('wiki');
  }

  /**
   * Validate if URL is a proper image URL
   * @param {string} url - URL to validate
   * @returns {boolean} True if valid image URL
   */
  isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    // Check if URL starts with http/https
    if (!url.startsWith('http')) return false;
    
    // Check for common image extensions
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    const hasImageExtension = imageExtensions.some(ext => 
      url.toLowerCase().includes(ext)
    );
    
    // Also accept URLs that might be images but don't have extensions
    const isLikelyImage = url.includes('image') || 
                         url.includes('photo') || 
                         url.includes('pic') ||
                         hasImageExtension;
    
    return isLikelyImage && url.length > 10;
  }
}

module.exports = ImageScraper;