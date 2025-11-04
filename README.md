# Image Scraper API

A Node.js/Express API that searches for images using DuckDuckGo, filters out Wikipedia results, and stores the images in Firebase Storage. Returns live URLs of the uploaded images.

## Features

- 🔍 **DuckDuckGo Image Search**: Searches for images using DuckDuckGo search engine
- 🚫 **Wikipedia Filter**: Automatically filters out Wikipedia and Wikimedia images
- ☁️ **Firebase Storage**: Uploads images to Firebase Storage for permanent hosting
- 🖼️ **Image Processing**: Optimizes images using Sharp (resize, compress, convert to JPEG)
- 🔗 **Live URLs**: Returns publicly accessible URLs for uploaded images
- ⚡ **Fast & Reliable**: Concurrent processing with proper error handling
- 📊 **Detailed Responses**: Comprehensive API responses with processing statistics

## Prerequisites

- Node.js 18+ 
- Firebase project with Storage enabled
- Firebase service account credentials

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
cd imagescrapper
npm install
```

### 2. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use existing one
3. Enable Firebase Storage
4. Go to Project Settings > Service Accounts
5. Click "Generate new private key" to download the service account JSON file

### 3. Environment Configuration

1. Copy the example environment file:
```bash
copy .env.example .env
```

2. Open the downloaded Firebase service account JSON file and extract these values to your `.env` file:

```env
FIREBASE_PRIVATE_KEY_ID=your_private_key_id_here
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_private_key_here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your_service_account_email@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your_client_id_here
FIREBASE_CLIENT_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/your_service_account_email%40your-project.iam.gserviceaccount.com

PORT=3000
```

### 4. Firebase Storage Rules

Make sure your Firebase Storage rules allow public read access:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

## Running the Server

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on `http://localhost:3000`

## API Endpoints

### 1. Search and Upload Images

**POST** `/api/search-images`

Search for images and upload them to Firebase Storage.

**Request Body:**
```json
{
  "keyword": "sunset",
  "count": 3
}
```

**Parameters:**
- `keyword` (string, required): Search term for images
- `count` (number, optional): Number of images to fetch (1-10, default: 3)

**Response:**
```json
{
  "success": true,
  "keyword": "sunset",
  "requested_count": 3,
  "found_count": 3,
  "uploaded_count": 3,
  "processing_time_ms": 5420,
  "images": [
    {
      "url": "https://storage.googleapis.com/your-bucket/images/sunset/1703123456789_abc123_1.jpg",
      "title": "Beautiful Sunset"
    },
    {
      "url": "https://storage.googleapis.com/your-bucket/images/sunset/1703123456790_def456_2.jpg", 
      "title": "Ocean Sunset"
    },
    {
      "url": "https://storage.googleapis.com/your-bucket/images/sunset/1703123456791_ghi789_3.jpg",
      "title": "Mountain Sunset"
    }
  ],
  "timestamp": "2023-12-21T10:30:45.123Z"
}
```

### 2. Health Check

**GET** `/health`

Check if the API is running.

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2023-12-21T10:30:45.123Z",
  "service": "Image Scraper API"
}
```

### 3. API Documentation

**GET** `/api/docs`

Get detailed API documentation.

## Usage Examples

### Using cURL

```bash
# Search for sunset images
curl -X POST http://localhost:3000/api/search-images \
  -H "Content-Type: application/json" \
  -d '{"keyword": "sunset", "count": 3}'

# Health check
curl http://localhost:3000/health
```

### Using JavaScript/Fetch

```javascript
// Search for images
const response = await fetch('http://localhost:3000/api/search-images', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    keyword: 'nature',
    count: 2
  })
});

const data = await response.json();
console.log('Uploaded images:', data.images);
```

### Using Python

```python
import requests

# Search for images
response = requests.post('http://localhost:3000/api/search-images', 
  json={
    'keyword': 'mountains',
    'count': 3
  }
)

data = response.json()
if data['success']:
    for image in data['images']:
        print(f"Image URL: {image['url']}")
```

## Error Handling

The API returns detailed error responses:

```json
{
  "success": false,
  "error": "No images found for the given keyword",
  "code": "NO_IMAGES_FOUND",
  "keyword": "nonexistentterm",
  "timestamp": "2023-12-21T10:30:45.123Z"
}
```

**Common Error Codes:**
- `INVALID_KEYWORD`: Invalid or missing keyword
- `KEYWORD_TOO_SHORT`: Keyword less than 2 characters
- `NO_IMAGES_FOUND`: No images found for keyword
- `UPLOAD_FAILED`: Failed to upload images to Firebase
- `REQUEST_TIMEOUT`: Request took too long
- `NETWORK_ERROR`: Network connectivity issues
- `STORAGE_ERROR`: Firebase Storage issues

## Project Structure

```
imagescrapper/
├── config/
│   └── firebase.js          # Firebase configuration
├── services/
│   ├── imageScraper.js      # DuckDuckGo image scraping
│   └── firebaseStorage.js   # Firebase Storage operations
├── index.js                 # Main Express server
├── package.json
├── .env.example
└── README.md
```

## Features in Detail

### Image Processing
- Automatic image optimization using Sharp
- Resize large images (max 1920px width)
- Convert to JPEG format for consistency
- Compress images to reduce storage costs

### Error Resilience
- Multiple fallback search methods
- Concurrent image processing with individual error handling
- Comprehensive logging for debugging
- Graceful degradation when some images fail

### Security
- Input validation and sanitization
- File size limits (10MB max per image)
- Timeout protection (30 seconds per image)
- CORS enabled for cross-origin requests

## Troubleshooting

### Common Issues

1. **Firebase Authentication Error**
   - Verify your `.env` file has correct Firebase credentials
   - Ensure the service account has Storage Admin permissions

2. **No Images Found**
   - Try different keywords
   - Check if DuckDuckGo is accessible from your network
   - Some keywords may have limited results

3. **Upload Failures**
   - Check Firebase Storage rules
   - Verify your Firebase project has Storage enabled
   - Ensure sufficient storage quota

4. **Slow Performance**
   - Reduce the `count` parameter
   - Check your internet connection
   - Some images may be large and take time to process

## License

ISC License

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions, please create an issue in the repository.