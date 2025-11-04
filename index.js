const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const ImageScraper = require('./services/imageScraper');
const vpsImageStorage = require('./services/vpsImageStorage');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Production environment detection
const isProduction = process.env.NODE_ENV === 'production';
const BASE_URL = process.env.VPS_BASE_URL || 'http://localhost:3001';

// Initialize services
const imageScraper = new ImageScraper();

// Middleware
app.use(cors({
  origin: isProduction 
    ? ['https://scraper.troxen.cloud', 'https://troxen.cloud'] 
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security middleware for production
if (isProduction) {
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
}

// Static file serving for uploaded images
const uploadDir = process.env.VPS_UPLOAD_DIR || './uploads/images';
const uploadPath = path.resolve(uploadDir);

console.log(`📁 Serving static files from: ${uploadPath}`);
console.log(`🌐 Images will be accessible at: ${BASE_URL}/images/`);

app.use('/images', express.static(uploadPath, {
  maxAge: isProduction ? '7d' : '1d', // Longer cache in production
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    // Set CORS headers for images
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, HEAD');
    res.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
    // Set cache headers for different file types
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      res.set('Content-Type', 'image/jpeg');
    } else if (path.endsWith('.png')) {
      res.set('Content-Type', 'image/png');
    } else if (path.endsWith('.gif')) {
      res.set('Content-Type', 'image/gif');
    } else if (path.endsWith('.webp')) {
      res.set('Content-Type', 'image/webp');
    }
  }
}));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Image Scraper API'
  });
});

// Main image search and upload endpoint
app.post('/api/search-images', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { keyword, count = 3 } = req.body;
    
    // Validation
    if (!keyword || typeof keyword !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Keyword is required and must be a string',
        code: 'INVALID_KEYWORD'
      });
    }

    if (keyword.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Keyword must be at least 2 characters long',
        code: 'KEYWORD_TOO_SHORT'
      });
    }

    const imageCount = Math.min(Math.max(parseInt(count) || 3, 1), 10); // Limit between 1-10
    
    console.log(`\n🔍 Starting image search for keyword: "${keyword}" (${imageCount} images)`);
    
    // Step 1: Search for images using DuckDuckGo
    console.log('📡 Searching for images...');
    const imageData = await imageScraper.searchImages(keyword, imageCount);
    
    if (!imageData || imageData.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No images found for the given keyword',
        code: 'NO_IMAGES_FOUND',
        keyword: keyword
      });
    }

    console.log(`✅ Found ${imageData.length} images to process`);
    
    // Step 2: Process and store images on VPS
    console.log('🔄 Processing and storing images on VPS...');
    const uploadResults = await vpsImageStorage.processMultipleImages(imageData, keyword);
    
    if (uploadResults.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to process any images on VPS',
        code: 'UPLOAD_FAILED',
        keyword: keyword
      });
    }

    const processingTime = Date.now() - startTime;
    
    // Success response
    res.json({
      success: true,
      keyword: keyword,
      requested_count: imageCount,
      found_count: imageData.length,
      uploaded_count: uploadResults.length,
      processing_time_ms: processingTime,
      images: uploadResults.map(result => ({
        url: result.url,
        title: result.title || 'Untitled'
      })),
      timestamp: new Date().toISOString()
    });

    console.log(`✨ Successfully completed request in ${processingTime}ms`);
    console.log(`📊 Stats: Found ${imageData.length}, Uploaded ${uploadResults.length}\n`);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    console.error('❌ Error processing request:', error.message);
    
    // Determine error type and status code
    let statusCode = 500;
    let errorCode = 'INTERNAL_ERROR';
    
    if (error.message.includes('timeout') || error.message.includes('ECONNABORTED')) {
      statusCode = 408;
      errorCode = 'REQUEST_TIMEOUT';
    } else if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
      statusCode = 503;
      errorCode = 'NETWORK_ERROR';
    } else if (error.message.includes('API') || error.message.includes('processing')) {
      statusCode = 503;
      errorCode = 'STORAGE_ERROR';
    }

    res.status(statusCode).json({
      success: false,
      error: error.message,
      code: errorCode,
      processing_time_ms: processingTime,
      timestamp: new Date().toISOString()
    });
  }
});

// Get images by keyword (list previously uploaded images)
app.get('/api/images/:keyword', async (req, res) => {
  try {
    const { keyword } = req.params;
    
    if (!keyword) {
      return res.status(400).json({
        success: false,
        error: 'Keyword parameter is required',
        code: 'MISSING_KEYWORD'
      });
    }

    // This would require implementing a database or Firebase Firestore to track uploaded images
    // For now, return a placeholder response
    res.json({
      success: true,
      message: 'Feature not implemented yet',
      note: 'To implement this feature, we would need to store metadata about uploaded images in a database',
      keyword: keyword
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    title: 'Image Scraper API Documentation',
    version: '1.0.0',
    description: 'API for searching and storing images from DuckDuckGo in Firebase Storage',
    endpoints: {
      'POST /api/search-images': {
        description: 'Search for images and upload to Firebase Storage',
        body: {
          keyword: 'string (required) - Search keyword',
          count: 'number (optional) - Number of images to fetch (1-10, default: 3)'
        },
        response: {
          success: 'boolean',
          keyword: 'string',
          images: 'array of image objects with url and title',
          processing_time_ms: 'number'
        }
      },
      'GET /api/images/:keyword': {
        description: 'Get previously uploaded images for a keyword (not implemented)',
        params: {
          keyword: 'string - Search keyword'
        }
      },
      'GET /health': {
        description: 'Health check endpoint',
        response: {
          status: 'string',
          timestamp: 'string'
        }
      }
    },
    examples: {
      search_request: {
        method: 'POST',
        url: '/api/search-images',
        body: {
          keyword: 'sunset',
          count: 3
        }
      }
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    available_endpoints: [
      'POST /api/search-images',
      'GET /api/images/:keyword',
      'GET /api/docs',
      'GET /health'
    ]
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Image Scraper API Server running on port ${PORT}`);
  console.log(`📖 API Documentation: http://localhost:${PORT}/api/docs`);
  console.log(`❤️ Health Check: http://localhost:${PORT}/health`);
  console.log(`\n🔧 Make sure to set up your .env file with Firebase credentials!`);
  console.log(`📁 Copy .env.example to .env and fill in your Firebase service account details\n`);
});

module.exports = app;