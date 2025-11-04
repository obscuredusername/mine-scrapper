const axios = require('axios');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { ref, uploadBytes, getDownloadURL, deleteObject } = require('firebase/storage');
const { storage, firebaseInitialized } = require('../config/firebase');

class FirebaseStorageService {
  constructor() {
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
  }

  /**
   * Download image from URL and upload to Firebase Storage
   * @param {string} imageUrl - URL of the image to download
   * @param {string} keyword - Search keyword for folder organization
   * @param {number} index - Image index for naming
   * @returns {Promise<string>} Public URL of uploaded image
   */
  async downloadAndUpload(imageUrl, keyword, index) {
    try {
      console.log(`Downloading image ${index + 1}: ${imageUrl}`);
      
      // Download image
      const imageBuffer = await this.downloadImage(imageUrl);
      
      // Process and optimize image
      const processedBuffer = await this.processImage(imageBuffer);
      
      // Generate unique filename
      const filename = this.generateFilename(keyword, index);
      
      // Upload to Firebase Storage
      const publicUrl = await this.uploadToFirebase(processedBuffer, filename);
      
      console.log(`Successfully uploaded image ${index + 1}: ${publicUrl}`);
      return publicUrl;
      
    } catch (error) {
      console.error(`Failed to process image ${index + 1}:`, error.message);
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
        timeout: 30000, // 30 seconds timeout
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'image/*,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        },
        maxContentLength: 10 * 1024 * 1024, // 10MB max
        maxBodyLength: 10 * 1024 * 1024
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
   * @returns {Promise<Buffer>} Processed image buffer
   */
  async processImage(imageBuffer) {
    try {
      // Get image metadata
      const metadata = await sharp(imageBuffer).metadata();
      console.log(`Processing image: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

      // Process image: resize if too large, convert to JPEG, optimize
      let processedImage = sharp(imageBuffer);

      // Resize if image is too large (max 1920px width)
      if (metadata.width > 1920) {
        processedImage = processedImage.resize(1920, null, {
          withoutEnlargement: true,
          fit: 'inside'
        });
      }

      // Convert to JPEG with optimization
      const processedBuffer = await processedImage
        .jpeg({
          quality: 85,
          progressive: true,
          mozjpeg: true
        })
        .toBuffer();

      console.log(`Image processed: ${imageBuffer.length} bytes -> ${processedBuffer.length} bytes`);
      return processedBuffer;

    } catch (error) {
      console.error('Image processing failed:', error.message);
      // If processing fails, return original buffer
      return imageBuffer;
    }
  }

  /**
   * Upload image buffer to Firebase Storage
   * @param {Buffer} imageBuffer - Processed image buffer
   * @param {string} filename - Filename for the uploaded image
   * @returns {Promise<string>} Public URL of uploaded image
   */
  async uploadToFirebase(imageBuffer, filename) {
    if (!firebaseInitialized || !storage) {
      throw new Error('Firebase Storage is not properly configured. Please check your .env file and Firebase credentials.');
    }
    
    try {
      // Create a reference to the file location
      const imageRef = ref(storage, filename);
      
      // Upload the file
      const metadata = {
        contentType: 'image/jpeg',
        customMetadata: {
          uploadedAt: new Date().toISOString(),
          source: 'image-scraper-api'
        }
      };

      const snapshot = await uploadBytes(imageRef, imageBuffer, metadata);
      
      // Get the download URL
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      return downloadURL;
      
    } catch (error) {
      throw new Error(`Firebase upload failed: ${error.message}`);
    }
  }

  /**
   * Generate unique filename for the image
   * @param {string} keyword - Search keyword
   * @param {number} index - Image index
   * @returns {string} Generated filename
   */
  generateFilename(keyword, index) {
    const timestamp = Date.now();
    const uuid = uuidv4().split('-')[0]; // Use first part of UUID
    const sanitizedKeyword = keyword.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    
    return `images/${sanitizedKeyword}/${timestamp}_${uuid}_${index + 1}.jpg`;
  }

  /**
   * Process multiple images concurrently
   * @param {Array} imageData - Array of image objects with URLs
   * @param {string} keyword - Search keyword
   * @returns {Promise<Array>} Array of public URLs
   */
  async processMultipleImages(imageData, keyword) {
    const uploadPromises = imageData.map(async (image, index) => {
      try {
        const publicUrl = await this.downloadAndUpload(image.url, keyword, index);
        return {
          success: true,
          url: publicUrl,
          originalUrl: image.url,
          title: image.title
        };
      } catch (error) {
        console.error(`Failed to process image ${index + 1}:`, error.message);
        return {
          success: false,
          error: error.message,
          originalUrl: image.url
        };
      }
    });

    const results = await Promise.allSettled(uploadPromises);
    
    // Filter successful uploads
    const successfulUploads = results
      .filter(result => result.status === 'fulfilled' && result.value.success)
      .map(result => result.value);

    console.log(`Successfully processed ${successfulUploads.length} out of ${imageData.length} images`);
    
    return successfulUploads;
  }

  /**
   * Delete image from Firebase Storage
   * @param {string} filename - Filename to delete
   * @returns {Promise<boolean>} Success status
   */
  async deleteImage(filename) {
    try {
      const imageRef = ref(storage, filename);
      await deleteObject(imageRef);
      console.log(`Deleted image: ${filename}`);
      return true;
    } catch (error) {
      console.error(`Failed to delete image ${filename}:`, error.message);
      return false;
    }
  }
}

module.exports = new FirebaseStorageService();