const axios = require('axios');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class VPSImageStorage {
  constructor() {
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    this.uploadDir = process.env.VPS_UPLOAD_DIR || './uploads/images';
    this.baseUrl = process.env.VPS_BASE_URL || 'http://localhost:3000';
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.timeout = 30000; // 30 seconds
    
    console.log(`🔧 VPS Storage initialized with baseUrl: ${this.baseUrl}`);
    
    // Ensure upload directory exists
    this.initializeUploadDirectory();
  }

  /**
   * Initialize upload directory structure
   */
  async initializeUploadDirectory() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      console.log(`✅ Upload directory initialized: ${this.uploadDir}`);
    } catch (error) {
      console.error('❌ Failed to initialize upload directory:', error.message);
    }
  }

  /**
   * Process multiple images and store them on VPS
   * @param {Array} imageUrls - Array of image objects with url, source, title
   * @param {string} keyword - Search keyword for folder organization
   * @param {string} watermarkText - Optional watermark text to apply on images
   * @returns {Promise<Array>} Array of processed image results
   */
  async processMultipleImages(imageUrls, keyword, watermarkText = null) {
    console.log(`🔄 Processing ${imageUrls.length} images on VPS...`);
    
    const uploadPromises = imageUrls.map(async (image, index) => {
      try {
        const result = await this.downloadAndStoreImage(image, keyword, index, watermarkText);
        return {
          url: result.publicUrl,
          title: image.title || 'Untitled',
          source: image.source,
          original_url: image.url
        };
      } catch (error) {
        console.error(`❌ Failed to process image ${index + 1}:`, error.message);
        return null;
      }
    });

    const results = await Promise.allSettled(uploadPromises);
    
    // Filter successful uploads
    const successfulUploads = results
      .filter(result => result.status === 'fulfilled' && result.value !== null)
      .map(result => result.value);

    console.log(`✅ Successfully processed ${successfulUploads.length} out of ${imageUrls.length} images on VPS`);
    
    return successfulUploads;
  }

  /**
   * Download image from URL and store it on VPS
   * @param {Object} imageData - Image object with url, source, title
   * @param {string} keyword - Search keyword for folder organization
   * @param {number} index - Image index for naming
   * @param {string} watermarkText - Optional watermark text
   * @returns {Promise<Object>} Result with local path and public URL
   */
  async downloadAndStoreImage(imageData, keyword, index, watermarkText = null) {
    try {
      console.log(`📥 Downloading image ${index + 1}: ${imageData.url}`);
      
      // Download image
      const imageBuffer = await this.downloadImage(imageData.url);
      
      // Process and optimize image
      const processedBuffer = await this.processImage(imageBuffer, watermarkText);
      
      // Generate file path and name
      const { filePath, publicUrl } = this.generateFilePaths(keyword, index);
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      
      // Save image to disk
      await fs.writeFile(filePath, processedBuffer);
      
      console.log(`✅ Successfully stored image ${index + 1}: ${publicUrl}`);
      
      return {
        localPath: filePath,
        publicUrl: publicUrl,
        originalUrl: imageData.url,
        title: imageData.title
      };
      
    } catch (error) {
      console.error(`❌ Failed to store image ${index + 1}:`, error.message);
      throw error;
    }
  }

  /**
   * Download image from URL
   * @param {string} imageUrl - URL of the image
   * @returns {Promise<Buffer>} Image buffer
   */
  async downloadImage(imageUrl) {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: this.timeout,
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'image/*,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        },
        maxContentLength: this.maxFileSize,
        maxBodyLength: this.maxFileSize
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: Failed to download image`);
      }

      const buffer = Buffer.from(response.data);
      
      // Validate that it's actually an image
      if (buffer.length < 100) {
        throw new Error('Downloaded file is too small to be a valid image');
      }

      return buffer;
      
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Download timeout - image took too long to download');
      }
      throw new Error(`Download failed: ${error.message}`);
    }
  }

  /**
   * Process and optimize image using Sharp
   * @param {Buffer} imageBuffer - Raw image buffer
   * @param {string} watermarkText - Optional watermark text
   * @returns {Promise<Buffer>} Processed image buffer
   */
  async processImage(imageBuffer, watermarkText = null) {
    try {
      // Get image metadata
      const metadata = await sharp(imageBuffer).metadata();
      console.log(`🔧 Processing image: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

      // Process image: resize if too large, convert to JPEG, optimize
      let processedImage = sharp(imageBuffer);

      // Resize if image is too large (max 1920px width)
      if (metadata.width > 1920) {
        processedImage = processedImage.resize(1920, null, {
          withoutEnlargement: true,
          fit: 'inside'
        });
      }

      // Convert to WebP with optimization
      let processedBuffer = await processedImage
        .webp({
          quality: 85,
          effort: 6
        })
        .toBuffer();

      // Apply watermark if text is provided
      if (watermarkText) {
        processedBuffer = await this.applyWatermark(processedBuffer, watermarkText);
      }

      console.log(`✨ Image processed: ${imageBuffer.length} bytes -> ${processedBuffer.length} bytes`);
      return processedBuffer;

    } catch (error) {
      console.error('⚠️ Image processing failed, using original:', error.message);
      // If processing fails, return original buffer
      return imageBuffer;
    }
  }

  /**
   * Generate file paths and public URL
   * @param {string} keyword - Search keyword
   * @param {number} index - Image index
   * @returns {Object} Object with filePath and publicUrl
   */
  generateFilePaths(keyword, index) {
    const timestamp = Date.now();
    const uuid = uuidv4().split('-')[0]; // Use first part of UUID
    
    const filename = `${timestamp}_${uuid}_${index + 1}.webp`;
    const filePath = path.join(this.uploadDir, filename);
    const publicUrl = `${this.baseUrl}/images/${filename}`;
    
    return { filePath, publicUrl };
  }

  /**
   * Get storage statistics
   * @param {Array} results - Processing results
   * @returns {Object} Statistics object
   */
  getProcessingStats(results) {
    const successful = results.filter(r => r && r.url).length;
    const failed = results.length - successful;
    
    return {
      total: results.length,
      successful,
      failed,
      success_rate: results.length > 0 ? (successful / results.length * 100).toFixed(1) : 0
    };
  }

  /**
   * Clean up old images (optional utility method)
   * @param {number} maxAgeHours - Maximum age in hours
   * @returns {Promise<number>} Number of files deleted
   */
  async cleanupOldImages(maxAgeHours = 24) {
    try {
      const maxAge = Date.now() - (maxAgeHours * 60 * 60 * 1000);
      let deletedCount = 0;
      
      const cleanupDirectory = async (dirPath) => {
        const items = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const item of items) {
          const itemPath = path.join(dirPath, item.name);
          
          if (item.isDirectory()) {
            await cleanupDirectory(itemPath);
          } else if (item.isFile()) {
            const stats = await fs.stat(itemPath);
            if (stats.mtime.getTime() < maxAge) {
              await fs.unlink(itemPath);
              deletedCount++;
            }
          }
        }
      };
      
      await cleanupDirectory(this.uploadDir);
      console.log(`🧹 Cleaned up ${deletedCount} old images`);
      return deletedCount;
      
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
      return 0;
    }
  }

  /**
   * Apply watermark text to image at multiple positions
   * @param {Buffer} imageBuffer - Image buffer
   * @param {string} watermarkText - Text to use as watermark
   * @returns {Promise<Buffer>} Watermarked image buffer
   */
  async applyWatermark(imageBuffer, watermarkText) {
    try {
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      const { width, height } = metadata;

      // Calculate font size based on image dimensions (responsive sizing)
      const fontSize = Math.max(Math.floor(width / 25), 20);
      const padding = Math.floor(fontSize * 0.5);

      // Create semi-transparent watermark text SVG
      const watermarkSvg = Buffer.from(`
        <svg width="${width}" height="${height}">
          <style>
            .watermark { 
              fill: white; 
              font-size: ${fontSize}px; 
              font-family: 'Liberation Sans', 'DejaVu Sans', sans-serif; 
              font-weight: bold;
              opacity: 0.4;
              paint-order: stroke fill;
              stroke: rgba(0,0,0,0.3);
              stroke-width: 2px;
            }
          </style>
          <!-- Top Left -->
          <text x="${padding}" y="${fontSize + padding}" class="watermark">${this.escapeXml(watermarkText)}</text>
          
          <!-- Top Right -->
          <text x="${width - padding}" y="${fontSize + padding}" text-anchor="end" class="watermark">${this.escapeXml(watermarkText)}</text>
          
          <!-- Center -->
          <text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="watermark">${this.escapeXml(watermarkText)}</text>
          
          <!-- Bottom Left -->
          <text x="${padding}" y="${height - padding}" class="watermark">${this.escapeXml(watermarkText)}</text>
          
          <!-- Bottom Right -->
          <text x="${width - padding}" y="${height - padding}" text-anchor="end" class="watermark">${this.escapeXml(watermarkText)}</text>
        </svg>
      `);

      // Composite watermark onto image
      const watermarkedBuffer = await image
        .composite([{
          input: watermarkSvg,
          top: 0,
          left: 0
        }])
        .toBuffer();

      console.log(`✨ Watermark "${watermarkText}" applied to image`);
      return watermarkedBuffer;

    } catch (error) {
      console.error('⚠️ Watermark application failed:', error.message);
      // Return original image if watermarking fails
      return imageBuffer;
    }
  }

  /**
   * Escape XML special characters for SVG
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeXml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

module.exports = new VPSImageStorage();