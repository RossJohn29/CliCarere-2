// tesseractOCR.js
import Tesseract from 'tesseract.js';

/**
 * Enhanced auto-detection config for full-frame scanning
 */
const AUTO_DETECTION_CONFIG = {
  STABILITY_THRESHOLD: 400,
  CAPTURE_COOLDOWN: 4000,
  MIN_CONTOUR_AREA: 30000,
  ASPECT_RATIO_MIN: 1.5,
  ASPECT_RATIO_MAX: 1.7,
  EDGE_DENSITY_THRESHOLD: 0.12,
  BLUR_THRESHOLD: 120,
  CONFIDENCE_THRESHOLD: 0.70,
  STABLE_FRAMES_REQUIRED: 3,
  FRAME_INTERVAL: 250
};

/**
 * OCR configuration optimized for Philippine IDs
 */
const OCR_CONFIG = {
  lang: 'eng',
  oem: 3,
  psm: 6,
  tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz -.\',',
  load_system_dawg: '0',
  load_freq_dawg: '0',
  load_unambig_dawg: '0',
  load_punc_dawg: '0',
  load_number_dawg: '0',
  load_bigram_dawg: '0'
};

/**
 * Enhanced preprocessing techniques
 */
export const preprocessingTechniques = {
  grayscale: (imageData) => {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = gray;
    }
    return imageData;
  },

  binaryThreshold: (imageData, threshold = 128) => {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i];
      const binary = gray > threshold ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = binary;
    }
    return imageData;
  },

  adaptiveThreshold: (imageData, blockSize = 25, C = 12) => {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const output = new Uint8ClampedArray(data);
    
    const halfBlock = Math.floor(blockSize / 2);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        
        for (let dy = -halfBlock; dy <= halfBlock; dy++) {
          for (let dx = -halfBlock; dx <= halfBlock; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              const idx = (ny * width + nx) * 4;
              sum += data[idx];
              count++;
            }
          }
        }
        
        const avg = sum / count;
        const idx = (y * width + x) * 4;
        const binary = data[idx] > (avg - C) ? 255 : 0;
        output[idx] = output[idx + 1] = output[idx + 2] = binary;
      }
    }
    
    for (let i = 0; i < data.length; i++) {
      data[i] = output[i];
    }
    
    return imageData;
  },

  dilate: (imageData, iterations = 1) => {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    
    for (let iter = 0; iter < iterations; iter++) {
      const output = new Uint8ClampedArray(data);
      
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let maxVal = 0;
          
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const idx = ((y + dy) * width + (x + dx)) * 4;
              maxVal = Math.max(maxVal, data[idx]);
            }
          }
          
          const idx = (y * width + x) * 4;
          output[idx] = output[idx + 1] = output[idx + 2] = maxVal;
        }
      }
      
      for (let i = 0; i < data.length; i++) {
        data[i] = output[i];
      }
    }
    
    return imageData;
  },

  sharpen: (imageData) => {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const output = new Uint8ClampedArray(data);
    
    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sum = 0;
        let ki = 0;
        
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            sum += data[idx] * kernel[ki];
            ki++;
          }
        }
        
        const idx = (y * width + x) * 4;
        const value = Math.max(0, Math.min(255, sum));
        output[idx] = output[idx + 1] = output[idx + 2] = value;
      }
    }
    
    for (let i = 0; i < data.length; i++) {
      data[i] = output[i];
    }
    
    return imageData;
  },

  contrastEnhancement: (imageData, factor = 1.5) => {
    const data = imageData.data;
    const contrast = (factor - 1) * 128;
    
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.max(0, Math.min(255, factor * data[i] + contrast));
      data[i + 1] = Math.max(0, Math.min(255, factor * data[i + 1] + contrast));
      data[i + 2] = Math.max(0, Math.min(255, factor * data[i + 2] + contrast));
    }
    return imageData;
  },

  medianFilter: (imageData, radius = 1) => {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const output = new Uint8ClampedArray(data);
    
    for (let y = radius; y < height - radius; y++) {
      for (let x = radius; x < width - radius; x++) {
        const neighbors = [];
        
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            neighbors.push(data[idx]);
          }
        }
        
        neighbors.sort((a, b) => a - b);
        const median = neighbors[Math.floor(neighbors.length / 2)];
        
        const idx = (y * width + x) * 4;
        output[idx] = output[idx + 1] = output[idx + 2] = median;
      }
    }
    
    for (let i = 0; i < data.length; i++) {
      data[i] = output[i];
    }
    
    return imageData;
  }
};

/**
 * Enhanced OCR with Canvas preprocessing and multi-pass strategy
 */
export const processIDWithOCREnhanced = async (imageData, retryCount = 0) => {
  try {
    console.log(`🔍 OCR Attempt ${retryCount + 1}`);
    
    // Verify ID is fully in frame before processing
    const frameCheck = await verifyIDInFrame(imageData);
    if (!frameCheck.valid) {
      return {
        success: false,
        name: null,
        rawText: '',
        confidence: 0,
        shouldRetry: false,
        message: 'ID not fully visible in frame. Please center the ID and try again.'
      };
    }
    
    // Multi-pass OCR with 3 Canvas-based preprocessing variations
    const variations = await generateCanvasPreprocessingVariations(imageData);
    const ocrResults = [];
    
    for (let i = 0; i < variations.length; i++) {
      console.log(`📸 Processing variation ${i + 1}/${variations.length}`);
      
      const { data: { text, confidence } } = await Tesseract.recognize(
        variations[i], 
        OCR_CONFIG.lang,
        {
          logger: m => {
            if (m.status === 'recognizing text') {
              console.log(`Variation ${i + 1} Progress:`, Math.round(m.progress * 100) + '%');
            }
          },
          ...OCR_CONFIG
        }
      );
      
      ocrResults.push({
        text,
        confidence,
        variationIndex: i
      });
      
      console.log(`📄 Variation ${i + 1} Raw Text:`, text);
      console.log(`📊 Variation ${i + 1} Confidence:`, confidence);
    }
    
    // Select best result using scoring algorithm
    const bestResult = selectBestOCRResult(ocrResults);
    console.log(`✅ Selected variation ${bestResult.variationIndex + 1} as best result`);
    
    const extractedName = extractNameFromID(bestResult.text);
    
    // ALWAYS return result, even with low confidence
    if (extractedName) {
      return {
        success: true,
        name: extractedName,
        rawText: bestResult.text,
        confidence: bestResult.confidence,
        shouldRetry: false,
        message: `Name extracted! (${Math.round(bestResult.confidence)}% confidence)`
      };
    }
    
    // If no name found, return raw text from best variation
    return {
      success: false,
      name: null,
      rawText: bestResult.text,
      confidence: bestResult.confidence,
      shouldRetry: false,
      message: 'Could not extract name. Please verify the ID is clearly visible or enter manually.'
    };
    
  } catch (error) {
    console.error('❌ OCR Error:', error);
    return {
      success: false,
      name: null,
      rawText: '',
      shouldRetry: false,
      message: 'OCR processing failed. Please try again.',
      error: error.message
    };
  }
};

/**
 * Generate 3 preprocessing variations using Canvas API
 */
const generateCanvasPreprocessingVariations = async (imageDataUrl) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const variations = [];
      
      // Variation 1: Standard enhancement (grayscale + normalize + sharpen)
      const canvas1 = document.createElement('canvas');
      const ctx1 = canvas1.getContext('2d', { willReadFrequently: true });
      canvas1.width = Math.min(img.width * 1.3, 1300);
      canvas1.height = (canvas1.width / img.width) * img.height;
      ctx1.drawImage(img, 0, 0, canvas1.width, canvas1.height);
      
      let imageData1 = ctx1.getImageData(0, 0, canvas1.width, canvas1.height);
      imageData1 = preprocessingTechniques.grayscale(imageData1);
      imageData1 = preprocessingTechniques.contrastEnhancement(imageData1, 1.2);
      imageData1 = preprocessingTechniques.sharpen(imageData1);
      imageData1 = preprocessingTechniques.medianFilter(imageData1, 2);
      ctx1.putImageData(imageData1, 0, 0);
      variations.push(canvas1.toDataURL('image/jpeg', 0.95));
      
      // Variation 2: High contrast + aggressive sharpening
      const canvas2 = document.createElement('canvas');
      const ctx2 = canvas2.getContext('2d', { willReadFrequently: true });
      canvas2.width = Math.min(img.width * 1.4, 1400);
      canvas2.height = (canvas2.width / img.width) * img.height;
      ctx2.drawImage(img, 0, 0, canvas2.width, canvas2.height);
      
      let imageData2 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height);
      imageData2 = preprocessingTechniques.grayscale(imageData2);
      imageData2 = preprocessingTechniques.contrastEnhancement(imageData2, 1.5);
      imageData2 = preprocessingTechniques.sharpen(imageData2);
      imageData2 = preprocessingTechniques.sharpen(imageData2); // Double sharpen
      imageData2 = preprocessingTechniques.medianFilter(imageData2, 1);
      ctx2.putImageData(imageData2, 0, 0);
      variations.push(canvas2.toDataURL('image/jpeg', 0.95));
      
      // Variation 3: Binary threshold for clean text
      const canvas3 = document.createElement('canvas');
      const ctx3 = canvas3.getContext('2d', { willReadFrequently: true });
      canvas3.width = Math.min(img.width * 1.2, 1200);
      canvas3.height = (canvas3.width / img.width) * img.height;
      ctx3.drawImage(img, 0, 0, canvas3.width, canvas3.height);
      
      let imageData3 = ctx3.getImageData(0, 0, canvas3.width, canvas3.height);
      imageData3 = preprocessingTechniques.grayscale(imageData3);
      imageData3 = preprocessingTechniques.contrastEnhancement(imageData3, 1.3);
      imageData3 = preprocessingTechniques.sharpen(imageData3);
      imageData3 = preprocessingTechniques.binaryThreshold(imageData3, 155);
      ctx3.putImageData(imageData3, 0, 0);
      variations.push(canvas3.toDataURL('image/jpeg', 0.95));
      
      console.log('✅ Generated 3 Canvas preprocessing variations');
      resolve(variations);
    };
    
    img.onerror = () => {
      console.error('❌ Failed to load image for preprocessing');
      resolve([imageDataUrl, imageDataUrl, imageDataUrl]);
    };
    
    img.src = imageDataUrl;
  });
};

/**
 * Select best OCR result based on multiple criteria
 */
const selectBestOCRResult = (ocrResults) => {
  if (ocrResults.length === 0) {
    return { text: '', confidence: 0, variationIndex: 0 };
  }
  
  let bestResult = null;
  let bestScore = -1;
  
  for (let i = 0; i < ocrResults.length; i++) {
    const result = ocrResults[i];
    const text = result.text;
    
    // Calculate scoring factors
    const confidenceScore = result.confidence / 100;
    
    // Length consistency (prefer 20-50 chars for typical full names)
    const lengthScore = Math.max(0, 1 - Math.abs(text.length - 35) / 50);
    
    // Alphabetical percentage (prefer high letter-to-total ratio)
    const letterCount = (text.match(/[A-Za-z]/g) || []).length;
    const alphaScore = letterCount / Math.max(text.length, 1);
    
    // Clean character ratio (penalize excessive special chars)
    const cleanChars = (text.match(/[A-Za-z\s,.-]/g) || []).length;
    const cleanScore = cleanChars / Math.max(text.length, 1);
    
    // Line count (prefer 8-20 lines for structured ID text)
    const lineCount = text.split('\n').filter(l => l.trim().length > 0).length;
    const lineScore = lineCount >= 8 && lineCount <= 25 ? 1 : 0.5;
    
    // Weighted composite score
    const compositeScore = (
      confidenceScore * 0.30 +
      lengthScore * 0.15 +
      alphaScore * 0.25 +
      cleanScore * 0.20 +
      lineScore * 0.10
    );
    
    console.log(`🔍 Variation ${i + 1} Score:`, {
      confidence: confidenceScore.toFixed(2),
      length: lengthScore.toFixed(2),
      alpha: alphaScore.toFixed(2),
      clean: cleanScore.toFixed(2),
      lines: lineScore.toFixed(2),
      composite: compositeScore.toFixed(2)
    });
    
    if (compositeScore > bestScore) {
      bestScore = compositeScore;
      bestResult = result;
    }
  }
  
  return bestResult || ocrResults[0];
};

/**
 * Verify ID is fully inside camera frame (Canvas-based)
 */
const verifyIDInFrame = async (imageDataUrl) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const grayData = new Uint8ClampedArray(canvas.width * canvas.height);
      
      // Convert to grayscale
      for (let i = 0; i < imageData.data.length; i += 4) {
        const gray = 0.299 * imageData.data[i] + 
                     0.587 * imageData.data[i + 1] + 
                     0.114 * imageData.data[i + 2];
        grayData[i / 4] = gray;
      }
      
      // Apply Sobel edge detection
      const edges = applySobelEdgeDetection(grayData, canvas.width, canvas.height);
      
      // Check for edges near frame borders (5% margin)
      const margin = Math.floor(Math.min(canvas.width, canvas.height) * 0.05);
      const borderEdges = checkBorderEdges(edges, canvas.width, canvas.height, margin);
      
      // If significant edges detected at borders, ID might be cut off
      if (borderEdges > 0.15) {
        console.log('⚠️ ID appears to extend beyond frame borders');
        resolve({ valid: false });
      } else {
        resolve({ valid: true });
      }
    };
    
    img.onerror = () => {
      console.error('❌ Frame verification failed');
      resolve({ valid: true }); // Default to valid if check fails
    };
    
    img.src = imageDataUrl;
  });
};

/**
 * Check for edges near image borders
 */
const checkBorderEdges = (edges, width, height, margin) => {
  let borderPixels = 0;
  let edgePixels = 0;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const isBorder = x < margin || x >= width - margin || 
                       y < margin || y >= height - margin;
      
      if (isBorder) {
        borderPixels++;
        if (edges[idx] > 128) {
          edgePixels++;
        }
      }
    }
  }
  
  return edgePixels / Math.max(borderPixels, 1);
};

/**
 * Full-frame ID detection (no bounding box overlay)
 */
export const detectIDInFrame = (video, canvas) => {
  if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Convert to grayscale
  const grayData = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    grayData[i / 4] = gray;
  }
  
  const edges = applySobelEdgeDetection(grayData, canvas.width, canvas.height);
  const rectangles = findRectangularContours(edges, canvas.width, canvas.height);
  
  if (rectangles.length === 0) {
    return null;
  }
  
  // Find best candidate (largest, most centered)
  let bestRect = null;
  let bestScore = 0;
  
  for (const rect of rectangles) {
    const aspectRatio = rect.width / rect.height;
    const area = rect.width * rect.height;
    
    if (
      area > AUTO_DETECTION_CONFIG.MIN_CONTOUR_AREA &&
      aspectRatio >= AUTO_DETECTION_CONFIG.ASPECT_RATIO_MIN &&
      aspectRatio <= AUTO_DETECTION_CONFIG.ASPECT_RATIO_MAX
    ) {
      const edgeDensity = calculateEdgeDensity(edges, rect, canvas.width);
      const sharpness = calculateSharpness(grayData, rect, canvas.width);
      
      if (edgeDensity > AUTO_DETECTION_CONFIG.EDGE_DENSITY_THRESHOLD &&
          sharpness > AUTO_DETECTION_CONFIG.BLUR_THRESHOLD) {
        
        // Calculate centering score
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;
        const frameCenterX = canvas.width / 2;
        const frameCenterY = canvas.height / 2;
        
        const distanceFromCenter = Math.sqrt(
          Math.pow(centerX - frameCenterX, 2) + 
          Math.pow(centerY - frameCenterY, 2)
        );
        
        const maxDistance = Math.sqrt(
          Math.pow(canvas.width / 2, 2) + 
          Math.pow(canvas.height / 2, 2)
        );
        
        const centeringScore = 1 - (distanceFromCenter / maxDistance);
        const areaScore = Math.min(1, area / (canvas.width * canvas.height * 0.6));
        
        const confidence = (
          edgeDensity * 0.3 + 
          (sharpness / 300) * 0.3 + 
          centeringScore * 0.2 + 
          areaScore * 0.2
        );
        
        if (confidence > bestScore) {
          bestScore = confidence;
          bestRect = {
            detected: true,
            boundingBox: rect,
            confidence: confidence,
            sharpness: sharpness,
            edgeDensity: edgeDensity
          };
        }
      }
    }
  }
  
  return bestScore > AUTO_DETECTION_CONFIG.CONFIDENCE_THRESHOLD ? bestRect : null;
};

const applySobelEdgeDetection = (grayData, width, height) => {
  const edges = new Uint8ClampedArray(width * height);
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * width + (x + kx);
          const kernelIdx = (ky + 1) * 3 + (kx + 1);
          gx += grayData[idx] * sobelX[kernelIdx];
          gy += grayData[idx] * sobelY[kernelIdx];
        }
      }
      
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edges[y * width + x] = magnitude > 128 ? 255 : 0;
    }
  }
  
  return edges;
};

const findRectangularContours = (edges, width, height) => {
  const rectangles = [];
  const visited = new Uint8ClampedArray(width * height);
  const stepSize = 15;
  
  for (let y = 0; y < height - 100; y += stepSize) {
    for (let x = 0; x < width - 180; x += stepSize) {
      if (visited[y * width + x]) continue;
      
      let edgeCount = 0;
      for (let dy = 0; dy < 100; dy += 5) {
        for (let dx = 0; dx < 100; dx += 5) {
          if (y + dy < height && x + dx < width) {
            const idx = (y + dy) * width + (x + dx);
            if (edges[idx] === 255) edgeCount++;
          }
        }
      }
      
      if (edgeCount > 40) {
        const rect = findBoundingRectangle(edges, x, y, width, height, visited);
        if (rect && rect.width > 200 && rect.height > 120) {
          rectangles.push(rect);
        }
      }
    }
  }
  
  return rectangles;
};

const findBoundingRectangle = (edges, startX, startY, width, height, visited) => {
  let minX = startX, maxX = startX;
  let minY = startY, maxY = startY;
  
  const searchSize = 500;
  for (let y = Math.max(0, startY - 40); y < Math.min(height, startY + searchSize); y++) {
    for (let x = Math.max(0, startX - 40); x < Math.min(width, startX + searchSize); x++) {
      if (edges[y * width + x] === 255) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        visited[y * width + x] = 1;
      }
    }
  }
  
  const padding = 15;
  return {
    x: Math.max(0, minX - padding),
    y: Math.max(0, minY - padding),
    width: Math.min(width - minX, maxX - minX + 2 * padding),
    height: Math.min(height - minY, maxY - minY + 2 * padding)
  };
};

const calculateEdgeDensity = (edges, rect, width) => {
  let edgePixels = 0;
  const totalPixels = rect.width * rect.height;
  
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      if (y * width + x < edges.length && edges[y * width + x] === 255) {
        edgePixels++;
      }
    }
  }
  
  return edgePixels / totalPixels;
};

const calculateSharpness = (grayData, rect, width) => {
  const laplacian = [0, 1, 0, 1, -4, 1, 0, 1, 0];
  let variance = 0;
  let count = 0;
  
  for (let y = rect.y + 1; y < rect.y + rect.height - 1; y++) {
    for (let x = rect.x + 1; x < rect.x + rect.width - 1; x++) {
      let sum = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * width + (x + kx);
          const kernelIdx = (ky + 1) * 3 + (kx + 1);
          if (idx < grayData.length) {
            sum += grayData[idx] * laplacian[kernelIdx];
          }
        }
      }
      variance += sum * sum;
      count++;
    }
  }
  
  return count > 0 ? variance / count : 0;
};

/**
 * Auto-capture with full-frame detection
 */
export const startAutoCapture = (video, onCapture, onDetection) => {
  if (!video || !isCameraAvailable()) {
    return { stop: () => {} };
  }
  
  const detectionCanvas = document.createElement('canvas');
  detectionCanvas.getContext('2d', { willReadFrequently: true });
  let detectionHistory = [];
  let isCapturing = false;
  let lastCaptureTime = 0;
  let detectionInterval = null;
  
  const checkForID = () => {
    const now = Date.now();
    
    if (now - lastCaptureTime < AUTO_DETECTION_CONFIG.CAPTURE_COOLDOWN) {
      return;
    }
    
    if (isCapturing) {
      return;
    }
    
    const detection = detectIDInFrame(video, detectionCanvas);
    
    if (detection && detection.detected) {
      detectionHistory.push({
        time: now,
        boundingBox: detection.boundingBox,
        confidence: detection.confidence,
        sharpness: detection.sharpness
      });
      
      detectionHistory = detectionHistory.filter(d => now - d.time < 1500);
      
      if (onDetection) {
        onDetection(detection);
      }
      
      if (detectionHistory.length >= AUTO_DETECTION_CONFIG.STABLE_FRAMES_REQUIRED) {
        const recentDetections = detectionHistory.slice(-AUTO_DETECTION_CONFIG.STABLE_FRAMES_REQUIRED);
        const isStable = checkStability(recentDetections);
        
        if (isStable) {
          isCapturing = true;
          lastCaptureTime = now;
          
          const bestDetection = recentDetections.reduce((best, current) => 
            current.confidence > best.confidence ? current : best
          );
          
          const processedImage = cropAndPreprocessID(video, bestDetection.boundingBox);
          
          detectionHistory = [];
          
          onCapture(processedImage, bestDetection);
          
          setTimeout(() => {
            isCapturing = false;
          }, AUTO_DETECTION_CONFIG.CAPTURE_COOLDOWN);
        }
      }
    } else {
      if (detectionHistory.length > 0 && now - detectionHistory[detectionHistory.length - 1].time > 800) {
        detectionHistory = [];
      }
    }
  };
  
  detectionInterval = setInterval(checkForID, AUTO_DETECTION_CONFIG.FRAME_INTERVAL);
  
  return {
    stop: () => {
      if (detectionInterval) {
        clearInterval(detectionInterval);
        detectionInterval = null;
      }
      detectionHistory = [];
      isCapturing = false;
    }
  };
};

const checkStability = (detections) => {
  if (detections.length < 2) return false;
  
  const first = detections[0].boundingBox;
  
  for (let i = 1; i < detections.length; i++) {
    const current = detections[i].boundingBox;
    
    if (Math.abs(current.x - first.x) > 50 || Math.abs(current.y - first.y) > 50) {
      return false;
    }
    
    if (Math.abs(current.width - first.width) > first.width * 0.15 || 
        Math.abs(current.height - first.height) > first.height * 0.15) {
      return false;
    }
  }
  
  const timeSpan = detections[detections.length - 1].time - detections[0].time;
  return timeSpan >= AUTO_DETECTION_CONFIG.STABILITY_THRESHOLD;
};

/**
 * Crop and preprocess (Mode #9 pipeline)
 */
export const cropAndPreprocessID = (video, boundingBox) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  const videoAspect = video.videoWidth / video.videoHeight;
  let sourceWidth = video.videoWidth;
  let sourceHeight = video.videoHeight;
  let sourceX = 0;
  let sourceY = 0;
  
  if (boundingBox) {
    const padding = 10;
    sourceX = Math.max(0, boundingBox.x - padding);
    sourceY = Math.max(0, boundingBox.y - padding);
    sourceWidth = Math.min(video.videoWidth - sourceX, boundingBox.width + 2 * padding);
    sourceHeight = Math.min(video.videoHeight - sourceY, boundingBox.height + 2 * padding);
  }
  
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  
  ctx.drawImage(
    video,
    sourceX, sourceY, sourceWidth, sourceHeight,
    0, 0, canvas.width, canvas.height
  );
  
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  imageData = preprocessingTechniques.grayscale(imageData);
  imageData = preprocessingTechniques.binaryThreshold(imageData, 140);
  imageData = preprocessingTechniques.dilate(imageData, 1);
  
  ctx.putImageData(imageData, 0, 0);
  
  return canvas.toDataURL('image/jpeg', 0.95);
};

/**
 * Enhanced name extraction for Philippine IDs
 */
export const extractNameFromID = (text) => {
  const lines = text.split('\n').map(line => line.trim().toUpperCase()).filter(line => line.length > 0);
  
  console.log('🔍 Processing lines:', lines);

  const philhealthName = extractPhilHealthName(lines);
  if (philhealthName) {
    console.log('✅ PhilHealth name:', philhealthName);
    return philhealthName;
  }

  const drivingLicenseName = extractDrivingLicenseName(lines);
  if (drivingLicenseName) {
    console.log('✅ Driver License name:', drivingLicenseName);
    return drivingLicenseName;
  }

  const genericName = extractGenericName(lines);
  if (genericName) {
    console.log('✅ Generic name:', genericName);
    return genericName;
  }
  
  console.log('❌ No name found');
  return null;
};

export const extractPhilHealthName = (lines) => {
  const isPhilHealth = lines.some(line => 
    line.includes('PHILHEALTH') || 
    line.includes('PHIL HEALTH') ||
    line.includes('PHILIPPINE HEALTH') ||
    line.includes('INSURANCE CORPORATION') ||
    (line.includes('REPUBLIC') && lines.some(l => l.includes('HEALTH')))
  );
  
  if (!isPhilHealth) return null;
  
  console.log('📋 PhilHealth ID detected');
  
  // Pattern 1: "MENDOZA, ROSS JOHN ESTACIO" (comma-separated)
  const nameWithCommaPattern = /^([A-Z\s]+),\s*([A-Z\s]+)$/;
  
  // Pattern 2: PhilHealth ID number pattern (to skip)
  const idNumberPattern = /^\d{2}-\d{9}-\d$/;
  
  for (let line of lines) {
    // Skip header lines and ID numbers
    if (line.includes('REPUBLIC') || 
        line.includes('PHILIPPINES') ||
        line.includes('PHILIPPINE') ||
        line.includes('PHILHEALTH') || 
        line.includes('INSURANCE') ||
        line.includes('CORPORATION') ||
        line.includes('HEALTH') ||
        line.includes('MALE') || 
        line.includes('FEMALE') ||
        line.includes('STREET') ||
        line.includes('BARANGAY') ||
        line.includes('CITY') ||
        line.includes('METRO') ||
        line.includes('MANILA') ||
        idNumberPattern.test(line) ||
        /^\d{4}-\d{2}-\d{2}$/.test(line)) { // Date pattern
      continue;
    }
    
    const match = line.match(nameWithCommaPattern);
    if (match) {
      const lastName = match[1].trim();
      const firstMiddle = match[2].trim();
      
      const lastWords = lastName.split(/\s+/);
      const firstWords = firstMiddle.split(/\s+/);
      
      // Validate: last name (1-2 words), first+middle (2-4 words)
      if (lastWords.length >= 1 && lastWords.length <= 2 &&
          firstWords.length >= 2 && firstWords.length <= 4 &&
          lastName.length >= 2 && firstMiddle.length >= 4) {
        
        // Return as "FIRST MIDDLE LAST" format
        return `${firstMiddle} ${lastName}`;
      }
    }
  }
  
  return null;
};

export const extractDrivingLicenseName = (lines) => {
  const isDrivingLicense = lines.some(line => 
    line.includes('DRIVER') || 
    line.includes('LICENSE') ||
    line.includes('LAND TRANSPORTATION') || 
    line.includes('LTO') ||
    line.includes('TRANSPORTATION OFFICE')
  );
  
  if (!isDrivingLicense) return null;
  
  console.log('🚗 Driver License detected');
  
  // Pattern: "MENDOZA, ROSS JOHN ESTACIO"
  const namePattern = /^([A-Z\s]+),\s*([A-Z\s]+)$/;
  
  // License number pattern to skip
  const licenseNumberPattern = /^N\d{2}-\d{2}-\d{6}$/;
  
  for (let line of lines) {
    // Skip headers and known non-name lines
    if (line.includes('REPUBLIC') || 
        line.includes('PHILIPPINES') ||
        line.includes('DEPARTMENT') || 
        line.includes('TRANSPORTATION') ||
        line.includes('DRIVER') || 
        line.includes('LICENSE') ||
        line.includes('OFFICE') ||
        line.includes('BIAK') ||
        line.includes('BATO') ||
        line.includes('STREET') ||
        line.includes('TONDO') ||
        line.includes('BARANGAY') ||
        line.includes('MANILA') ||
        line.includes('CITY') ||
        line.includes('NCR') ||
        line.includes('DISTRICT') ||
        line.includes('BLOOD') ||
        line.includes('TYPE') ||
        line.includes('EYES') ||
        line.includes('COLOR') ||
        line.includes('BLACK') ||
        line.includes('CODES') ||
        line.includes('CONDITIONS') ||
        line.includes('SIGNATURE') ||
        line.includes('LICENSEE') ||
        line.includes('ASSISTANT') ||
        line.includes('SECRETARY') ||
        licenseNumberPattern.test(line) ||
        /^\d{4}\/\d{2}\/\d{2}$/.test(line) || // Date format
        /^\d{2}\/\d{2}\/\d{4}$/.test(line)) { // Alternative date
      continue;
    }
    
    const match = line.match(namePattern);
    if (match) {
      const lastName = match[1].trim();
      const firstMiddle = match[2].trim();
      
      const lastWords = lastName.split(/\s+/);
      const firstWords = firstMiddle.split(/\s+/);
      
      // Validate: last name (1-2 words), first+middle (2-4 words)
      if (lastWords.length >= 1 && lastWords.length <= 2 &&
          firstWords.length >= 2 && firstWords.length <= 4 &&
          lastName.length >= 2 && firstMiddle.length >= 4) {
        
        // Return as "FIRST MIDDLE LAST" format
        return `${firstMiddle} ${lastName}`;
      }
    }
  }
  
  return null;
};

export const extractGenericName = (lines) => {
  // Pattern: "LASTNAME, FIRSTNAME MIDDLENAME"
  const nameWithCommaPattern = /^([A-Z\s]+),\s*([A-Z\s]+)$/;
  
  for (let line of lines) {
    // Skip obvious non-name lines
    if (line.includes('REPUBLIC') || 
        line.includes('PHILIPPINES') ||
        line.includes('DEPARTMENT') ||
        line.includes('TRANSPORTATION') ||
        line.includes('HEALTH') ||
        line.includes('INSURANCE') ||
        line.includes('PHILHEALTH') ||
        line.includes('DRIVER') ||
        line.includes('LICENSE') ||
        line.includes('OFFICE') ||
        line.includes('STREET') ||
        line.includes('BARANGAY') ||
        line.includes('CITY') ||
        line.includes('MANILA') ||
        line.includes('MALE') ||
        line.includes('FEMALE') ||
        /^\d/.test(line)) { // Skip lines starting with numbers
      continue;
    }
    
    // Try comma-separated format first
    const commaMatch = line.match(nameWithCommaPattern);
    if (commaMatch) {
      const lastName = commaMatch[1].trim();
      const firstMiddle = commaMatch[2].trim();
      
      const lastWords = lastName.split(/\s+/);
      const firstWords = firstMiddle.split(/\s+/);
      
      if (lastWords.length >= 1 && lastWords.length <= 2 &&
          firstWords.length >= 2 && firstWords.length <= 4) {
        return `${firstMiddle} ${lastName}`;
      }
    }
    
    // Fallback: simple name validation
    if (line.length > 10 && line.length < 60 && 
        /^[A-Z\s,\.]+$/.test(line)) {
      
      const words = line.replace(/[,\.]/g, '').split(/\s+/).filter(w => w.length > 1);
      if (words.length >= 3 && words.length <= 5) {
        return line.trim();
      }
    }
  }
  
  return null;
};

// Camera utilities
export const isCameraAvailable = () => {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
};

export const initializeCamera = async () => {
  if (!isCameraAvailable()) {
    throw new Error('Camera not supported');
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      } 
    });
    return stream;
  } catch (err) {
    let errorMessage = 'Camera access failed';
    
    if (err.name === 'NotAllowedError') {
      errorMessage = 'Camera permission denied';
    } else if (err.name === 'NotFoundError') {
      errorMessage = 'No camera found';
    }
    
    throw new Error(errorMessage);
  }
};

export const cleanupCamera = (stream) => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
};

export const captureImageFromVideo = (videoElement) => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  context.drawImage(videoElement, 0, 0);
  
  return canvas.toDataURL('image/jpeg', 0.9);
};

// Export legacy alias
export const processIDWithOCR = processIDWithOCREnhanced;

export default {
  processIDWithOCR,
  processIDWithOCREnhanced,
  extractNameFromID,
  preprocessingTechniques,
  isCameraAvailable,
  initializeCamera,
  cleanupCamera,
  captureImageFromVideo,
  detectIDInFrame,
  cropAndPreprocessID,
  startAutoCapture
};