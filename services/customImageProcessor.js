const axios = require('axios');

class CustomImageProcessor {
  constructor() {
    this.apiUrl = 'https://nigga.cemantix.net/generator/download-image/';
    this.timeout = 120000; // 2 minutes timeout
    this.maxRetries = 2; // Maximum retry attempts
  }

  /**
   * Process multiple images using the custom API with retry logic
   * @param {Array} imageUrls - Array of image objects with url, source, title
   * @returns {Promise<Array>} Array of processed image results
   */
  async processMultipleImages(imageUrls) {
    let lastError;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        console.log(`🔄 Processing ${imageUrls.length} images via custom API... (Attempt ${attempt + 1}/${this.maxRetries})`);
        
        // Extract just the URLs for the API call
        const imageLinks = imageUrls.map(img => img.url);
        
        const requestBody = {
          image_links: imageLinks
        };

        console.log('📤 Sending request to custom API:', this.apiUrl);
        
        const response = await axios.post(this.apiUrl, requestBody, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: this.timeout
        });

        if (response.data.status !== 'completed') {
          throw new Error(`API returned status: ${response.data.status}`);
        }

        const results = response.data.results;
        console.log(`✅ Successfully processed ${results.length} images`);

        // Transform the results to match the expected format
        const processedImages = [];
        
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const originalImageData = imageUrls[i];
          
          if (result.status === 'success') {
            processedImages.push({
              url: result.processed_url,
              title: originalImageData.title,
              source: originalImageData.source,
              original_url: result.original_url
            });
          } else {
            console.warn(`⚠️ Image processing failed for: ${result.original_url}`);
          }
        }

        return processedImages;

      } catch (error) {
        lastError = error;
        console.error(`❌ Custom API processing attempt ${attempt + 1} failed:`, error.message);
        
        if (attempt === this.maxRetries - 1) {
          // This was the last attempt, break out of the loop
          break;
        }
        
        // Wait before retrying (exponential backoff)
        const waitTime = Math.min(5000 * Math.pow(2, attempt), 30000); // Max 30 seconds
        console.log(`⏳ Waiting ${waitTime/1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    // If we get here, all attempts failed
    console.error('❌ All retry attempts failed');
    
    if (lastError.code === 'ECONNABORTED') {
      throw new Error('Request timeout - API took too long to respond');
    } else if (lastError.response) {
      throw new Error(`API error: ${lastError.response.status} - ${lastError.response.data?.message || 'Unknown error'}`);
    } else if (lastError.request) {
      throw new Error('Network error - Could not reach the API');
    } else {
      throw new Error(`Processing error: ${lastError.message}`);
    }
  }

  /**
   * Process a single image (wrapper for compatibility)
   * @param {Object} imageData - Image object with url, source, title
   * @returns {Promise<Object>} Processed image result
   */
  async processImage(imageData) {
    const results = await this.processMultipleImages([imageData]);
    return results[0];
  }

  /**
   * Get processing statistics (for compatibility with existing interface)
   * @param {Array} results - Processing results
   * @returns {Object} Statistics object
   */
  getProcessingStats(results) {
    const successful = results.filter(r => r.url).length;
    const failed = results.length - successful;
    
    return {
      total: results.length,
      successful,
      failed,
      success_rate: results.length > 0 ? (successful / results.length * 100).toFixed(1) : 0
    };
  }
}

module.exports = new CustomImageProcessor();