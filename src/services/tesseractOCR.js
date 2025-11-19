// tesseractOCR.js
import Tesseract from 'tesseract.js';

/**
 * Main OCR processing function
 * @param {string} imageData - Base64 image data from canvas
 * @returns {Promise<Object>} - OCR result with extracted name
 */
export const processIDWithOCR = async (imageData) => {
  try {
    const { data: { text } } = await Tesseract.recognize(imageData, 'eng', {
      logger: m => console.log('OCR Progress:', m)
    });
    
    console.log('OCR Raw Text Result:', text);
    
    const extractedName = extractNameFromID(text);
    
    return {
      success: !!extractedName,
      name: extractedName,
      rawText: text,
      message: extractedName 
        ? 'Name extracted successfully!' 
        : 'Could not extract name from ID. Please try again or enter manually.'
    };
    
  } catch (error) {
    console.error('OCR processing error:', error);
    return {
      success: false,
      name: null,
      rawText: '',
      message: 'Failed to process ID image. Please try again.',
      error: error.message
    };
  }
};

/**
 * Auto-detection configuration
 */
const AUTO_DETECTION_CONFIG = {
  STABILITY_THRESHOLD: 500, // ms - how long ID must be stable
  CAPTURE_COOLDOWN: 4000, // ms - time between captures
  MIN_CONTOUR_AREA: 15000, // minimum area for valid ID
  ASPECT_RATIO_MIN: 1.3, // minimum width/height ratio
  ASPECT_RATIO_MAX: 2.0, // maximum width/height ratio
  EDGE_DENSITY_THRESHOLD: 0.15, // minimum edge density
  BLUR_THRESHOLD: 100, // Laplacian variance threshold for blur detection
};

/**
 * Detect if frame contains an ID card
 * @param {HTMLVideoElement} video - Video element
 * @param {HTMLCanvasElement} canvas - Canvas for processing
 * @returns {Object|null} - Detection result with bounding box or null
 */
export const detectIDInFrame = (video, canvas) => {
  if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }

  const ctx = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  // Draw current frame
  ctx.drawImage(video, 0, 0);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Convert to grayscale
  const grayData = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    grayData[i / 4] = gray;
  }
  
  // Edge detection using Sobel operator
  const edges = applySobelEdgeDetection(grayData, canvas.width, canvas.height);
  
  // Find contours (simplified rectangular detection)
  const rectangles = findRectangularContours(edges, canvas.width, canvas.height);
  
  // Filter for ID-card-like rectangles
  for (const rect of rectangles) {
    const aspectRatio = rect.width / rect.height;
    const area = rect.width * rect.height;
    
    if (
      area > AUTO_DETECTION_CONFIG.MIN_CONTOUR_AREA &&
      aspectRatio >= AUTO_DETECTION_CONFIG.ASPECT_RATIO_MIN &&
      aspectRatio <= AUTO_DETECTION_CONFIG.ASPECT_RATIO_MAX
    ) {
      // Check edge density within rectangle
      const edgeDensity = calculateEdgeDensity(edges, rect, canvas.width);
      
      if (edgeDensity > AUTO_DETECTION_CONFIG.EDGE_DENSITY_THRESHOLD) {
        // Check if image is sharp enough
        const sharpness = calculateSharpness(grayData, rect, canvas.width);
        
        if (sharpness > AUTO_DETECTION_CONFIG.BLUR_THRESHOLD) {
          return {
            detected: true,
            boundingBox: rect,
            confidence: edgeDensity,
            sharpness: sharpness
          };
        }
      }
    }
  }
  
  return null;
};

/**
 * Apply Sobel edge detection
 */
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

/**
 * Find rectangular contours in edge-detected image
 */
const findRectangularContours = (edges, width, height) => {
  const rectangles = [];
  const visited = new Uint8ClampedArray(width * height);
  
  // Simplified contour detection - scan for edge clusters
  const stepSize = 20; // Coarse grid for performance
  
  for (let y = 0; y < height - 100; y += stepSize) {
    for (let x = 0; x < width - 100; x += stepSize) {
      if (visited[y * width + x]) continue;
      
      // Check if this region has enough edges
      let edgeCount = 0;
      for (let dy = 0; dy < 100; dy += 5) {
        for (let dx = 0; dx < 100; dx += 5) {
          const idx = (y + dy) * width + (x + dx);
          if (edges[idx] === 255) edgeCount++;
        }
      }
      
      // If significant edges found, try to find bounding rectangle
      if (edgeCount > 50) {
        const rect = findBoundingRectangle(edges, x, y, width, height, visited);
        if (rect && rect.width > 150 && rect.height > 80) {
          rectangles.push(rect);
        }
      }
    }
  }
  
  return rectangles;
};

/**
 * Find bounding rectangle for edge cluster
 */
const findBoundingRectangle = (edges, startX, startY, width, height, visited) => {
  let minX = startX, maxX = startX;
  let minY = startY, maxY = startY;
  
  // Expand search region
  const searchSize = 300;
  for (let y = Math.max(0, startY - 50); y < Math.min(height, startY + searchSize); y++) {
    for (let x = Math.max(0, startX - 50); x < Math.min(width, startX + searchSize); x++) {
      if (edges[y * width + x] === 255) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        visited[y * width + x] = 1;
      }
    }
  }
  
  // Add padding
  const padding = 10;
  return {
    x: Math.max(0, minX - padding),
    y: Math.max(0, minY - padding),
    width: Math.min(width - minX, maxX - minX + 2 * padding),
    height: Math.min(height - minY, maxY - minY + 2 * padding)
  };
};

/**
 * Calculate edge density within rectangle
 */
const calculateEdgeDensity = (edges, rect, width) => {
  let edgePixels = 0;
  const totalPixels = rect.width * rect.height;
  
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      if (edges[y * width + x] === 255) {
        edgePixels++;
      }
    }
  }
  
  return edgePixels / totalPixels;
};

/**
 * Calculate image sharpness (Laplacian variance)
 */
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
          sum += grayData[idx] * laplacian[kernelIdx];
        }
      }
      variance += sum * sum;
      count++;
    }
  }
  
  return count > 0 ? variance / count : 0;
};

/**
 * Crop and preprocess image for OCR
 * @param {HTMLVideoElement} video - Video element
 * @param {Object} boundingBox - Detected bounding box
 * @returns {string} - Base64 image data
 */
export const cropAndPreprocessID = (video, boundingBox) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Set canvas to cropped region
  canvas.width = boundingBox.width;
  canvas.height = boundingBox.height;
  
  // Draw cropped region
  ctx.drawImage(
    video,
    boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height,
    0, 0, boundingBox.width, boundingBox.height
  );
  
  // Get image data for preprocessing
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  // Step 1: Grayscale
  imageData = preprocessingTechniques.grayscale(imageData);
  
  // Step 2: Binary Threshold
  imageData = preprocessingTechniques.binaryThreshold(imageData, 140);
  
  // Step 3: Dilate
  imageData = preprocessingTechniques.dilate(imageData);
  
  ctx.putImageData(imageData, 0, 0);
  
  return canvas.toDataURL('image/jpeg', 0.95);
};

/**
 * Auto-capture with stability check
 * @param {HTMLVideoElement} video - Video element
 * @param {Function} onCapture - Callback when capture is ready
 * @param {Function} onDetection - Callback when ID is detected (for UI feedback)
 * @returns {Object} - Control object with stop() method
 */
export const startAutoCapture = (video, onCapture, onDetection) => {
  if (!video || !isCameraAvailable()) {
    return { stop: () => {} };
  }
  
  const detectionCanvas = document.createElement('canvas');
  let detectionHistory = [];
  let isCapturing = false;
  let lastCaptureTime = 0;
  let detectionInterval = null;
  
  const checkForID = () => {
    const now = Date.now();
    
    // Cooldown check
    if (now - lastCaptureTime < AUTO_DETECTION_CONFIG.CAPTURE_COOLDOWN) {
      return;
    }
    
    if (isCapturing) {
      return;
    }
    
    // Detect ID in current frame
    const detection = detectIDInFrame(video, detectionCanvas);
    
    if (detection && detection.detected) {
      // Add to history
      detectionHistory.push({
        time: now,
        boundingBox: detection.boundingBox,
        confidence: detection.confidence,
        sharpness: detection.sharpness
      });
      
      // Keep only recent detections
      detectionHistory = detectionHistory.filter(d => now - d.time < 1000);
      
      // Notify UI of detection (optional visual feedback)
      if (onDetection) {
        onDetection(detection);
      }
      
      // Check stability - need consistent detections
      if (detectionHistory.length >= 3) {
        const recentDetections = detectionHistory.slice(-3);
        const isStable = checkStability(recentDetections);
        
        if (isStable) {
          // Trigger auto-capture
          isCapturing = true;
          lastCaptureTime = now;
          
          // Use the best detection from recent history
          const bestDetection = recentDetections.reduce((best, current) => 
            current.sharpness > best.sharpness ? current : best
          );
          
          // Crop and preprocess
          const processedImage = cropAndPreprocessID(video, bestDetection.boundingBox);
          
          // Clear history
          detectionHistory = [];
          
          // Execute capture callback
          onCapture(processedImage, bestDetection);
          
          // Reset capturing flag after cooldown
          setTimeout(() => {
            isCapturing = false;
          }, AUTO_DETECTION_CONFIG.CAPTURE_COOLDOWN);
        }
      }
    } else {
      // No detection - clear history if gap is too long
      if (detectionHistory.length > 0 && now - detectionHistory[detectionHistory.length - 1].time > 300) {
        detectionHistory = [];
      }
    }
  };
  
  // Start detection loop
  detectionInterval = setInterval(checkForID, 200); // Check every 200ms
  
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

/**
 * Check if detections are stable
 */
const checkStability = (detections) => {
  if (detections.length < 2) return false;
  
  // Check if bounding boxes are similar
  const first = detections[0].boundingBox;
  
  for (let i = 1; i < detections.length; i++) {
    const current = detections[i].boundingBox;
    
    // Check position stability (within 30 pixels)
    if (Math.abs(current.x - first.x) > 30 || Math.abs(current.y - first.y) > 30) {
      return false;
    }
    
    // Check size stability (within 10%)
    if (Math.abs(current.width - first.width) > first.width * 0.1 || 
        Math.abs(current.height - first.height) > first.height * 0.1) {
      return false;
    }
  }
  
  // Check time span
  const timeSpan = detections[detections.length - 1].time - detections[0].time;
  return timeSpan >= AUTO_DETECTION_CONFIG.STABILITY_THRESHOLD;
};

/**
 * Enhanced OCR processing with retry logic
 * @param {string} imageData - Base64 image data
 * @param {number} retryCount - Current retry attempt
 * @returns {Promise<Object>} - OCR result
 */
export const processIDWithOCREnhanced = async (imageData, retryCount = 0) => {
  try {
    const { data: { text, confidence } } = await Tesseract.recognize(imageData, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log('OCR Progress:', Math.round(m.progress * 100) + '%');
        }
      }
    });
    
    console.log('OCR Raw Text Result:', text);
    console.log('OCR Confidence:', confidence);
    
    const extractedName = extractNameFromID(text);
    
    // MODIFIED: Always return result regardless of confidence
    return {
      success: !!extractedName,
      name: extractedName,
      rawText: text,
      confidence: confidence,
      shouldRetry: false,
      message: extractedName 
        ? `Name extracted successfully! (Confidence: ${Math.round(confidence)}%)` 
        : 'Could not extract name from ID. Please try again or enter manually.'
    };
    
  } catch (error) {
    console.error('OCR processing error:', error);
    return {
      success: false,
      name: null,
      rawText: '',
      shouldRetry: retryCount < 2,
      retryCount: retryCount + 1,
      message: 'Failed to process ID image. Please try again.',
      error: error.message
    };
  }
};

/**
 * Extract name from OCR text - Enhanced for PLM ID, PhilHealth, and Philippine Driving License ID accuracy
 * @param {string} text - Raw OCR text
 * @returns {string|null} - Extracted name or null
 */
export const extractNameFromID = (text) => {
  const lines = text.split('\n').map(line => line.trim().toUpperCase()).filter(line => line.length > 0);
  
  console.log('OCR Processing Lines:', lines);

  // Try PhilHealth ID first
  const philhealthName = extractPhilHealthName(lines);
  if (philhealthName) {
    console.log('✅ PhilHealth ID name extracted:', philhealthName);
    return philhealthName;
  }

  console.log('Trying Driving License ID format...');
  const drivingLicenseName = extractDrivingLicenseName(lines);
  if (drivingLicenseName) {
    console.log('✅ Driving License ID name extracted:', drivingLicenseName);
    return drivingLicenseName;
  }

  console.log('Trying generic name patterns...');
  const genericName = extractGenericName(lines);
  if (genericName) {
    console.log('✅ Generic name pattern found:', genericName);
    return genericName;
  }
  
  console.log('❌ No valid name found in OCR text');
  return null;
};

/**
 * Extract name from Philippine Driving License ID format
 * @param {string[]} lines - Array of OCR text lines
 * @returns {string|null} - Extracted driving license name or null
 */
export const extractDrivingLicenseName = (lines) => {
  // Check if this is a Driving License ID
  const isDrivingLicense = lines.some(line => 
    line.includes('DRIVER') || 
    line.includes('LICENSE') ||
    line.includes('LAND TRANSPORTATION') ||
    line.includes('LTO') ||
    (line.includes('REPUBLIC') && lines.some(l => l.includes('DRIVER')))
  );
  
  if (!isDrivingLicense) {
    return null;
  }
  
  console.log('Driving License ID detected, processing lines...');
  
  // Driving License name pattern: LASTNAME, FIRSTNAME MIDDLENAME
  const namePattern = /([A-Z\s]+),\s*([A-Z\s]+)/;
  
  for (let line of lines) {
    // Skip header and system lines
    if (line.includes('REPUBLIC') || line.includes('PHILIPPINES') || 
        line.includes('DEPARTMENT') || line.includes('TRANSPORTATION') ||
        line.includes('LAND TRANSPORTATION') || line.includes('OFFICE') ||
        line.includes('DRIVER') || line.includes('LICENSE') ||
        line.includes('LTO') || line.includes('RESTRICTION') ||
        line.includes('VALID') || line.includes('UNTIL') ||
        line.includes('EXPIRES') || line.includes('ISSUED') ||
        line.includes('CONDITION') || line.includes('CODE') ||
        /^\d{2}-\d{2}-\d{7}$/.test(line.replace(/\s/g, '')) || // License number pattern
        /^\d{4}$/.test(line)) { // Year
      continue;
    }
    
    const nameMatch = line.match(namePattern);
    if (nameMatch) {
      const lastName = nameMatch[1].trim();
      const firstMiddle = nameMatch[2].trim();
      
      // Validate the name components
      const lastNameWords = lastName.split(/\s+/);
      const firstMiddleWords = firstMiddle.split(/\s+/);
      
      // Last name should be 1-2 words, first+middle should be 1-3 words
      if (lastNameWords.length >= 1 && lastNameWords.length <= 2 &&
          firstMiddleWords.length >= 1 && firstMiddleWords.length <= 3 &&
          lastName.length >= 2 && firstMiddle.length >= 2) {
        
        // Return in format: FIRSTNAME MIDDLENAME LASTNAME
        return `${firstMiddle} ${lastName}`;
      }
    }
  }
  
  return null;
};

/**
 * Extract name from Philippine Government ID format (DEPRECATED - use extractDrivingLicenseName)
 * @param {string[]} lines - Array of OCR text lines
 * @returns {string|null} - Extracted government ID name or null
 */
export const extractGovernmentIDName = (lines) => {
  // Redirect to driving license extraction
  return extractDrivingLicenseName(lines);
};

/**
 * Extract name using generic patterns (fallback method)
 * @param {string[]} lines - Array of OCR text lines
 * @returns {string|null} - Extracted generic name or null
 */
export const extractGenericName = (lines) => {
  for (let line of lines) {
    if (line.length > 8 && line.length < 60 && 
        /^[A-Z\s\.]+$/.test(line) && 
        !line.includes('MALE') && !line.includes('FEMALE') &&
        !line.includes('PHL') && !line.includes('NCR') &&
        !line.includes('PAMANTASAN') && !line.includes('LUNGSOD') &&
        !line.includes('REPUBLIC') && !line.includes('PHILIPPINES')) {
      
      const words = line.split(/\s+/).filter(word => word.length > 1);
      if (words.length >= 2 && words.length <= 5) {
        return line.trim();
      }
    }
  }
  
  return null;
};

/**
 * Extract name from PhilHealth ID format
 * @param {string[]} lines - Array of OCR text lines
 * @returns {string|null} - Extracted PhilHealth name or null
 */
export const extractPhilHealthName = (lines) => {
  // Check if this is a PhilHealth ID
  const isPhilHealth = lines.some(line => 
    line.includes('PHILHEALTH') || 
    line.includes('PHIL HEALTH') ||
    line.includes('REPUBLIC OF THE PHILIPPINES') && 
    lines.some(l => l.includes('HEALTH'))
  );
  
  if (!isPhilHealth) {
    return null;
  }
  
  console.log('PhilHealth ID detected, processing lines...');
  
  // PhilHealth PIN pattern: XX-XXXXXXXXX-X (2 digits, dash, 9 digits, dash, 1 digit)
  const pinPattern = /^\d{2}-\d{9}-\d$/;
  
  // Look for the name which typically appears after the PIN
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip lines that are clearly not names
    if (line.includes('REPUBLIC') || 
        line.includes('PHILIPPINES') || 
        line.includes('PHILHEALTH') ||
        line.includes('PHIL HEALTH') ||
        line.includes('INSURANCE') ||
        line.includes('CORPORATION') ||
        line.includes('MALE') || 
        line.includes('FEMALE') ||
        line.includes('APRIL') || line.includes('MAY') || line.includes('JUNE') ||
        line.includes('JANUARY') || line.includes('FEBRUARY') || line.includes('MARCH') ||
        line.includes('JULY') || line.includes('AUGUST') || line.includes('SEPTEMBER') ||
        line.includes('OCTOBER') || line.includes('NOVEMBER') || line.includes('DECEMBER') ||
        /^\d{4}$/.test(line) || // Skip year
        pinPattern.test(line)) { // Skip PIN number
      continue;
    }
    
    // PhilHealth name format: LASTNAME, FIRSTNAME MIDDLENAME
    const nameWithCommaPattern = /^([A-Z\s]+),\s*([A-Z\s]+)$/;
    const match = line.match(nameWithCommaPattern);
    
    if (match) {
      const lastName = match[1].trim();
      const firstMiddle = match[2].trim();
      
      // Validate the name components
      const lastNameWords = lastName.split(/\s+/);
      const firstMiddleWords = firstMiddle.split(/\s+/);
      
      // Last name should be 1-2 words, first+middle should be 2-3 words
      if (lastNameWords.length >= 1 && lastNameWords.length <= 2 &&
          firstMiddleWords.length >= 2 && firstMiddleWords.length <= 3 &&
          lastName.length >= 2 && firstMiddle.length >= 3) {
        
        // Return in format: FIRSTNAME MIDDLENAME LASTNAME
        const extractedName = `${firstMiddle} ${lastName}`;
        console.log('PhilHealth name found:', extractedName);
        return extractedName;
      }
    }
    
    // Alternative: Look for name pattern without comma (fallback)
    if (isPhilHealthName(line)) {
      const cleanedName = cleanPhilHealthName(line);
      if (cleanedName) {
        console.log('PhilHealth name found (no comma):', cleanedName);
        return cleanedName;
      }
    }
  }
  
  return null;
};

/**
 * Check if a line contains a valid PhilHealth name
 * @param {string} line - Text line to validate
 * @returns {boolean} - True if valid PhilHealth name
 */
export const isPhilHealthName = (line) => {
  if (!line || line.length < 10 || line.length > 60) {
    return false;
  }

  // Should contain only letters, spaces, and possibly comma
  if (!/^[A-Z\s,]+$/.test(line)) {
    return false;
  }
  
  const words = line.replace(',', '').split(/\s+/).filter(word => word.length > 0);
  
  // Should have 3-5 words (firstname, middlename, lastname)
  if (words.length < 3 || words.length > 5) {
    return false;
  }
  
  // Each word should be at least 2 characters
  const hasValidWordLengths = words.every(word => word.length >= 2);
  
  // Exclude institutional terms
  const institutionalTerms = ['REPUBLIC', 'PHILIPPINES', 'PHILHEALTH', 
                              'HEALTH', 'INSURANCE', 'CORPORATION',
                              'DEPARTMENT', 'GOVERNMENT', 'NATIONAL'];
  
  const hasInstitutionalTerms = words.some(word => 
    institutionalTerms.some(term => word.includes(term))
  );
  
  return hasValidWordLengths && !hasInstitutionalTerms;
};

/**
 * Clean and format the PhilHealth name
 * @param {string} nameString - Raw name string from OCR
 * @returns {string|null} - Cleaned PhilHealth name
 */
export const cleanPhilHealthName = (nameString) => {
  if (!nameString) return null;
  
  // If name has comma format: LASTNAME, FIRSTNAME MIDDLENAME
  if (nameString.includes(',')) {
    const parts = nameString.split(',').map(p => p.trim());
    if (parts.length === 2) {
      // Return as: FIRSTNAME MIDDLENAME LASTNAME
      return `${parts[1]} ${parts[0]}`;
    }
  }
  
  // Otherwise return as is, cleaned
  return nameString.trim()
    .replace(/\s+/g, ' ')
    .replace(/,\s*/g, ' ');
};

/**
 * Utility function to check if camera is available
 * @returns {boolean} - True if camera API is available
 */
export const isCameraAvailable = () => {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
};

/**
 * Initialize camera stream for ID scanning
 * @returns {Promise<MediaStream>} - Camera stream
 */
export const initializeCamera = async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Camera API not supported in this browser or requires HTTPS');
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
    let errorMessage = '';
    
    if (err.name === 'NotAllowedError') {
      errorMessage = 'Camera permission denied. Please allow camera access and try again.';
    } else if (err.name === 'NotFoundError') {
      errorMessage = 'No camera found on this device.';
    } else if (err.name === 'NotSupportedError') {
      errorMessage = 'Camera not supported on this device or browser.';
    } else {
      errorMessage = 'Camera access failed. Please try again or enter information manually.';
    }
    
    throw new Error(errorMessage);
  }
};

/**
 * Cleanup camera stream
 * @param {MediaStream} stream - Camera stream to cleanup
 */
export const cleanupCamera = (stream) => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
};

/**
 * Capture image from video element
 * @param {HTMLVideoElement} videoElement - Video element to capture from
 * @returns {string} - Base64 image data
 */
export const captureImageFromVideo = (videoElement) => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  context.drawImage(videoElement, 0, 0);
  
  return canvas.toDataURL('image/jpeg', 0.8);
};


// ==================== TESTING EXPORTS ====================
// Expose internal functions for OCR accuracy testing
// Add this entire section at the end of tesseractOCR.js

/**
 * Advanced preprocessing techniques for testing
 */
export const preprocessingTechniques = {
  // Basic grayscale conversion
  grayscale: (imageData) => {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = gray;
    }
    return imageData;
  },

  // Contrast enhancement
  contrastEnhancement: (imageData, factor = 1.5) => {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.max(0, Math.min(255, (data[i] - 128) * factor + 128));
      data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] - 128) * factor + 128));
      data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] - 128) * factor + 128));
    }
    return imageData;
  },

  // Binary thresholding
  binaryThreshold: (imageData, threshold = 140) => {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const binary = gray > threshold ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = binary;
    }
    return imageData;
  },

  // Adaptive thresholding
  adaptiveThreshold: (imageData, blockSize = 15) => {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const output = new Uint8ClampedArray(data);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        
        for (let dy = -blockSize; dy <= blockSize; dy++) {
          for (let dx = -blockSize; dx <= blockSize; dx++) {
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
        const gray = data[idx];
        const binary = gray > avg - 10 ? 255 : 0;
        output[idx] = output[idx + 1] = output[idx + 2] = binary;
      }
    }
    
    for (let i = 0; i < data.length; i++) {
      data[i] = output[i];
    }
    
    return imageData;
  },

  // Gaussian blur (noise reduction)
  gaussianBlur: (imageData, radius = 1) => {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const output = new Uint8ClampedArray(data);
    
    const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    const kernelSum = 16;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let r = 0, g = 0, b = 0;
        let ki = 0;
        
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            r += data[idx] * kernel[ki];
            g += data[idx + 1] * kernel[ki];
            b += data[idx + 2] * kernel[ki];
            ki++;
          }
        }
        
        const idx = (y * width + x) * 4;
        output[idx] = r / kernelSum;
        output[idx + 1] = g / kernelSum;
        output[idx + 2] = b / kernelSum;
      }
    }
    
    for (let i = 0; i < data.length; i++) {
      data[i] = output[i];
    }
    
    return imageData;
  },

  // Sharpen filter
  sharpen: (imageData) => {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const output = new Uint8ClampedArray(data);
    
    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let r = 0, g = 0, b = 0;
        let ki = 0;
        
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            r += data[idx] * kernel[ki];
            g += data[idx + 1] * kernel[ki];
            b += data[idx + 2] * kernel[ki];
            ki++;
          }
        }
        
        const idx = (y * width + x) * 4;
        output[idx] = Math.max(0, Math.min(255, r));
        output[idx + 1] = Math.max(0, Math.min(255, g));
        output[idx + 2] = Math.max(0, Math.min(255, b));
      }
    }
    
    for (let i = 0; i < data.length; i++) {
      data[i] = output[i];
    }
    
    return imageData;
  },

  // Morphological dilation
  dilate: (imageData) => {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
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
    
    return imageData;
  },

  // Morphological erosion
  erode: (imageData) => {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const output = new Uint8ClampedArray(data);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let minVal = 255;
        
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            minVal = Math.min(minVal, data[idx]);
          }
        }
        
        const idx = (y * width + x) * 4;
        output[idx] = output[idx + 1] = output[idx + 2] = minVal;
      }
    }
    
    for (let i = 0; i < data.length; i++) {
      data[i] = output[i];
    }
    
    return imageData;
  },

  // Invert colors
  invert: (imageData) => {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
    return imageData;
  }
};

/**
 * Run Tesseract OCR with custom options
 */
export const runTesseractOCR = async (imageData, options = {}) => {
  try {
    const { data: { text, confidence } } = await Tesseract.recognize(imageData, 'eng', {
      logger: options.logger || (m => {
        if (m.status === 'recognizing text') {
          console.log('OCR Progress:', Math.round(m.progress * 100) + '%');
        }
      })
    });
    
    return { text, confidence };
  } catch (error) {
    throw new Error(`Tesseract OCR failed: ${error.message}`);
  }
};

/**
 * Advanced image preprocessing with multiple techniques
 */
export const preprocessImageAdvanced = (imageDataUrl, techniques = []) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Apply selected preprocessing techniques in order
      for (const technique of techniques) {
        if (preprocessingTechniques[technique]) {
          imageData = preprocessingTechniques[technique](imageData);
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageDataUrl;
  });
};

/**
 * Rotate image by specified angle
 */
export const rotateImage = (imageDataUrl, angleDegrees) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const angleRad = (angleDegrees * Math.PI) / 180;
      const cos = Math.abs(Math.cos(angleRad));
      const sin = Math.abs(Math.sin(angleRad));
      
      canvas.width = img.width * cos + img.height * sin;
      canvas.height = img.width * sin + img.height * cos;
      
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(angleRad);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageDataUrl;
  });
};

/**
 * Adjust brightness and contrast
 */
export const adjustImageLighting = (imageDataUrl, brightness = 0, contrast = 1) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(0, Math.min(255, contrast * data[i] + brightness));
        data[i + 1] = Math.max(0, Math.min(255, contrast * data[i + 1] + brightness));
        data[i + 2] = Math.max(0, Math.min(255, contrast * data[i + 2] + brightness));
      }
      
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageDataUrl;
  });
};

/**
 * Export all name extraction functions for testing
 */
export const testNameExtraction = {
  extractPhilHealthName,
  extractDrivingLicenseName,
  extractGovernmentIDName,
  extractGenericName,
  isPhilHealthName,
  cleanPhilHealthName
};

export default {
  processIDWithOCR,
  processIDWithOCREnhanced,
  extractNameFromID,
  runTesseractOCR,
  preprocessImageAdvanced,
  preprocessingTechniques,
  rotateImage,
  adjustImageLighting,
  testNameExtraction,
  isCameraAvailable,
  initializeCamera,
  cleanupCamera,
  captureImageFromVideo,
  detectIDInFrame,
  cropAndPreprocessID,
  startAutoCapture
};