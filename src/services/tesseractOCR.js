import Tesseract from 'tesseract.js';

/**
 * Enhanced auto-detection config for full-frame scanning
 */
const AUTO_DETECTION_CONFIG = {
  STABILITY_THRESHOLD: 400, // ms - reduced for faster response
  CAPTURE_COOLDOWN: 4000, // ms - prevent rapid re-captures
  MIN_CONTOUR_AREA: 30000, // Larger minimum for 720p
  ASPECT_RATIO_MIN: 1.5, // Standard ID card ratio
  ASPECT_RATIO_MAX: 1.7,
  EDGE_DENSITY_THRESHOLD: 0.12,
  BLUR_THRESHOLD: 120,
  CONFIDENCE_THRESHOLD: 0.70, // Lowered slightly
  STABLE_FRAMES_REQUIRED: 3, // Reduced for faster capture
  FRAME_INTERVAL: 250 // ms between detection checks
};

/**
 * OCR configuration optimized for Philippine IDs
 */
const OCR_CONFIG = {
  lang: 'eng',
  oem: 1, // LSTM engine
  psm: 6, // Assume uniform block of text
  tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz0-9-,.',
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
      const gray = data[i]; // Already grayscale
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
  }
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

// ... (Keep existing helper functions: applySobelEdgeDetection, findRectangularContours, etc.)
// I'll include the essential ones:

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
  const stepSize = 15; // Smaller step for better detection
  
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
      
      // Keep only recent detections
      detectionHistory = detectionHistory.filter(d => now - d.time < 1500);
      
      // Visual feedback (no overlay needed - just callback)
      if (onDetection) {
        onDetection(detection);
      }
      
      // Check for stable frames
      if (detectionHistory.length >= AUTO_DETECTION_CONFIG.STABLE_FRAMES_REQUIRED) {
        const recentDetections = detectionHistory.slice(-AUTO_DETECTION_CONFIG.STABLE_FRAMES_REQUIRED);
        const isStable = checkStability(recentDetections);
        
        if (isStable) {
          isCapturing = true;
          lastCaptureTime = now;
          
          // Find best detection
          const bestDetection = recentDetections.reduce((best, current) => 
            current.confidence > best.confidence ? current : best
          );
          
          // Capture and preprocess
          const processedImage = cropAndPreprocessID(video, bestDetection.boundingBox);
          
          detectionHistory = [];
          
          // Trigger capture callback
          onCapture(processedImage, bestDetection);
          
          // Cooldown period
          setTimeout(() => {
            isCapturing = false;
          }, AUTO_DETECTION_CONFIG.CAPTURE_COOLDOWN);
        }
      }
    } else {
      // Reset if no detection for too long
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
    
    // More lenient position check
    if (Math.abs(current.x - first.x) > 50 || Math.abs(current.y - first.y) > 50) {
      return false;
    }
    
    // More lenient size check
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
  
  // Add padding
  const padding = 10;
  const x = Math.max(0, boundingBox.x - padding);
  const y = Math.max(0, boundingBox.y - padding);
  const width = Math.min(video.videoWidth - x, boundingBox.width + 2 * padding);
  const height = Math.min(video.videoHeight - y, boundingBox.height + 2 * padding);
  
  canvas.width = width;
  canvas.height = height;
  
  ctx.drawImage(video, x, y, width, height, 0, 0, width, height);
  
  // Apply Mode #9 pipeline: grayscale → binary → dilate
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  imageData = preprocessingTechniques.grayscale(imageData);
  imageData = preprocessingTechniques.binaryThreshold(imageData, 140); // Slightly higher threshold
  imageData = preprocessingTechniques.dilate(imageData, 1);
  
  ctx.putImageData(imageData, 0, 0);
  
  return canvas.toDataURL('image/jpeg', 0.95);
};

/**
 * Enhanced OCR with retry strategies
 */
export const processIDWithOCREnhanced = async (imageData, retryCount = 0) => {
  try {
    console.log(`🔍 OCR Attempt ${retryCount + 1}`);
    
    // First attempt with default preprocessing
    const { data: { text, confidence } } = await Tesseract.recognize(imageData, OCR_CONFIG.lang, {
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log('OCR Progress:', Math.round(m.progress * 100) + '%');
        }
      },
      ...OCR_CONFIG
    });
    
    console.log('📄 OCR Raw Text:', text);
    console.log('📊 Confidence:', confidence);
    
    const extractedName = extractNameFromID(text);
    
    // ALWAYS return result, even with low confidence
    if (extractedName) {
      return {
        success: true,
        name: extractedName,
        rawText: text,
        confidence: confidence,
        shouldRetry: false,
        message: `Name extracted! (${Math.round(confidence)}% confidence)`
      };
    }
    
    // Retry with alternative preprocessing if no name found and retries available
    if (retryCount < 1) {
      console.log('⚠️ No name found, trying alternative preprocessing...');
      
      // Alternative: sharpen + adaptive threshold
      const altImage = await applyAlternativePreprocessing(imageData);
      return processIDWithOCREnhanced(altImage, retryCount + 1);
    }
    
    // Final fallback: return raw text
    return {
      success: false,
      name: null,
      rawText: text,
      confidence: confidence,
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
 * Alternative preprocessing for retry
 */
const applyAlternativePreprocessing = async (imageDataUrl) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      imageData = preprocessingTechniques.grayscale(imageData);
      imageData = preprocessingTechniques.sharpen(imageData);
      imageData = preprocessingTechniques.adaptiveThreshold(imageData, 30, 15);
      imageData = preprocessingTechniques.contrastEnhancement(imageData, 1.3);
      
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.src = imageDataUrl;
  });
};

/**
 * Enhanced name extraction for Philippine IDs
 */
export const extractNameFromID = (text) => {
  const lines = text.split('\n').map(line => line.trim().toUpperCase()).filter(line => line.length > 0);
  
  console.log('🔍 Processing lines:', lines);

  // Try PhilHealth first
  const philhealthName = extractPhilHealthName(lines);
  if (philhealthName) {
    console.log('✅ PhilHealth name:', philhealthName);
    return philhealthName;
  }

  // Try Driver's License
  const drivingLicenseName = extractDrivingLicenseName(lines);
  if (drivingLicenseName) {
    console.log('✅ Driver License name:', drivingLicenseName);
    return drivingLicenseName;
  }

  // Fallback generic pattern
  const genericName = extractGenericName(lines);
  if (genericName) {
    console.log('✅ Generic name:', genericName);
    return genericName;
  }
  
  console.log('❌ No name found');
  return null;
};

/**
 * PhilHealth name extraction (based on your sample)
 */
export const extractPhilHealthName = (lines) => {
  const isPhilHealth = lines.some(line => 
    line.includes('PHILHEALTH') || 
    line.includes('PHIL HEALTH') ||
    (line.includes('REPUBLIC') && lines.some(l => l.includes('HEALTH')))
  );
  
  if (!isPhilHealth) return null;
  
  console.log('📋 PhilHealth ID detected');
  
  // Look for "LASTNAME, FIRSTNAME MIDDLENAME" pattern
  const nameWithCommaPattern = /^([A-Z\s]+),\s*([A-Z\s]+)$/;
  
  for (let line of lines) {
    // Skip header lines
    if (line.includes('REPUBLIC') || line.includes('PHILIPPINES') || 
        line.includes('PHILHEALTH') || line.includes('INSURANCE') ||
        line.includes('MALE') || line.includes('FEMALE') ||
        /^\d{2}-\d{9}-\d$/.test(line)) {
      continue;
    }
    
    const match = line.match(nameWithCommaPattern);
    if (match) {
      const lastName = match[1].trim();
      const firstMiddle = match[2].trim();
      
      const lastWords = lastName.split(/\s+/);
      const firstWords = firstMiddle.split(/\s+/);
      
      if (lastWords.length >= 1 && lastWords.length <= 2 &&
          firstWords.length >= 1 && firstWords.length <= 3 &&
          lastName.length >= 2 && firstMiddle.length >= 2) {
        
        // Return as "FIRSTNAME MIDDLENAME LASTNAME"
        return `${firstMiddle} ${lastName}`;
      }
    }
  }
  
  return null;
};

/**
 * Driver's License name extraction (based on your sample)
 * Format: "MENDOZA, ROSS JOHN ESTACIO"
 */
export const extractDrivingLicenseName = (lines) => {
  const isDrivingLicense = lines.some(line => 
    line.includes('DRIVER') || line.includes('LICENSE') ||
    line.includes('LAND TRANSPORTATION') || line.includes('LTO')
  );
  
  if (!isDrivingLicense) return null;
  
  console.log('🚗 Driver License detected');
  
  const namePattern = /^([A-Z\s]+),\s*([A-Z\s]+)$/;
  
  for (let line of lines) {
    // Skip headers
    if (line.includes('REPUBLIC') || line.includes('PHILIPPINES') ||
        line.includes('DEPARTMENT') || line.includes('TRANSPORTATION') ||
        line.includes('DRIVER') || line.includes('LICENSE') ||
        /^\d{2}-\d{2}-\d{6}$/.test(line.replace(/\s/g, ''))) {
      continue;
    }
    
    const match = line.match(namePattern);
    if (match) {
      const lastName = match[1].trim();
      const firstMiddle = match[2].trim();
      
      const lastWords = lastName.split(/\s+/);
      const firstWords = firstMiddle.split(/\s+/);
      
      if (lastWords.length >= 1 && lastWords.length <= 2 &&
          firstWords.length >= 1 && firstWords.length <= 4) {
        
        return `${firstMiddle} ${lastName}`;
      }
    }
  }
  
  return null;
};

/**
 * Generic name extraction fallback
 */
export const extractGenericName = (lines) => {
  for (let line of lines) {
    if (line.length > 8 && line.length < 60 && 
        /^[A-Z\s,\.]+$/.test(line) && 
        !line.includes('REPUBLIC') && !line.includes('PHILIPPINES')) {
      
      const words = line.replace(',', '').split(/\s+/).filter(w => w.length > 1);
      if (words.length >= 2 && words.length <= 5) {
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