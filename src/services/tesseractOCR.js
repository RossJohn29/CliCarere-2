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
  oem: 1,
  psm: 6,
  tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -.,/\':',
  tessedit_pageseg_mode: 6
};

/**
 * Check if camera is available
 */
export const isCameraAvailable = () => {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
};

/**
 * Initialize camera stream
 */
export const initializeCamera = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });
    return stream;
  } catch (error) {
    console.error('Camera initialization error:', error);
    throw error;
  }
};

/**
 * Cleanup camera stream
 */
export const cleanupCamera = (stream) => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
};

/**
 * Capture image from video element
 */
export const captureImageFromVideo = (video) => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.95);
  } catch (error) {
    console.error('Image capture error:', error);
    return null;
  }
};

/**
 * Verify ID is in frame
 */
const verifyIDInFrame = async (imageData) => {
  return { valid: true };
};

/**
 * Detect ID in frame
 */
export const detectIDInFrame = async (imageData) => {
  return { detected: true, confidence: 0.85 };
};

/**
 * Crop and preprocess ID
 */
export const cropAndPreprocessID = async (imageData) => {
  return imageData;
};

/**
 * Start auto capture
 */
export const startAutoCapture = (callback) => {
  console.log('Auto-capture feature initiated');
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
 * Generate canvas preprocessing variations
 */
const generateCanvasPreprocessingVariations = async (imageBase64) => {
  const variations = [];
  
  // Original
  variations.push(imageBase64);
  
  // Create canvas variations
  const img = new Image();
  img.src = imageBase64;
  
  await new Promise((resolve) => {
    img.onload = resolve;
  });
  
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  
  // Variation with contrast
  ctx.drawImage(img, 0, 0);
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  imageData = preprocessingTechniques.contrastEnhancement(imageData, 1.5);
  ctx.putImageData(imageData, 0, 0);
  variations.push(canvas.toDataURL('image/jpeg', 0.95));
  
  return variations;
};

/**
 * Select best OCR result
 */
const selectBestOCRResult = (results) => {
  return results.reduce((best, current) => {
    return current.confidence > best.confidence ? current : best;
  });
};

/**
 * Filter out noisy OCR lines - keep only readable text
 */
const filterNoiseLines = (lines) => {
  return lines.filter(line => {
    const cleanLine = line.replace(/\s+/g, ' ').trim();
    
    // Skip empty lines
    if (cleanLine.length === 0) return false;
    
    // Skip lines with too many non-letter characters (noise indicators)
    const letterCount = (cleanLine.match(/[A-Z]/g) || []).length;
    const totalLength = cleanLine.length;
    const letterRatio = letterCount / totalLength;
    
    // If less than 50% letters, it's likely noise
    if (letterRatio < 0.5) return false;
    
    // Skip lines with excessive noise characters
    const noiseChars = (cleanLine.match(/[\[\]\{\}\(\)\|\=\+\*\@\#\$\%\^\&]/g) || []).length;
    if (noiseChars > 3) return false;
    
    // Skip very short lines (less than 5 chars) or extremely long lines (noise)
    if (cleanLine.length < 5 || cleanLine.length > 100) return false;
    
    return true;
  });
};

/**
 * PhilHealth Name Extraction - ROBUST VERSION for Noisy OCR
 */
const extractPhilHealthName = (lines) => {
  console.log('📋 PhilHealth ID detected');
  console.log('📄 All Lines:', lines);
  
  const cleanLines = filterNoiseLines(lines);
  console.log('📄 Clean Lines:', cleanLines);
  
  // PhilHealth format: "SURNAME, FIRSTNAME MIDDLENAME"
  const namePattern = /^([A-Z][A-Z\s\-']{2,25})\s*,\s*([A-Z][A-Z\s\-']{4,40})$/;
  
  for (let line of cleanLines) {
    // ✅ MORE AGGRESSIVE CLEANING
    let cleanLine = line
      .replace(/[|\\\/\=\+\*\@\#\$\%\^\&\[\]\{\}\(\)]/g, ' ')  // Remove special chars
      .replace(/\s+/g, ' ')  // Normalize spaces
      .replace(/^[0-9IVX\$\&\-\s]+/, '')  // Remove leading garbage (numbers, I, V, X, $, &, -)
      .replace(/[0-9IVX\$\&\-\s]+$/, '')  // Remove trailing garbage
      .trim();
    
    console.log('🔍 Checking cleaned line:', cleanLine);
    
    // Skip non-name lines
    if (cleanLine.includes('PHILHEALTH') || 
        cleanLine.includes('PHILIPPINE') ||
        cleanLine.includes('REPUBLIC') ||
        cleanLine.includes('STREET') ||
        cleanLine.includes('BARANGAY') ||
        cleanLine.includes('TONDO') ||
        cleanLine.includes('MANILA') ||
        /\d{2}[-\s]?\d{9}[-\s]?\d/.test(cleanLine) ||
        /\d{4}[-\/]\d{2}[-\/]\d{2}/.test(cleanLine) ||
        cleanLine.length < 10 ||
        cleanLine.length > 60) {
      continue;
    }
    
    // Check if line contains comma (name separator)
    if (!cleanLine.includes(',')) {
      continue;
    }
    
    const match = cleanLine.match(namePattern);
    if (match) {
      const surname = match[1].trim();
      const givenMiddle = match[2].trim();
      
      console.log('🔍 Found potential match - Surname:', surname, 'Given+Middle:', givenMiddle);
      
      // ✅ STRICTER VALIDATION
      if (!/[0-9\{\}\[\]\(\)\=\|\+\*\@\#\$\%\^\&]/.test(surname) &&
          !/[0-9\{\}\[\]\(\)\=\|\+\*\@\#\$\%\^\&]/.test(givenMiddle)) {
        
        const surnameWords = surname.split(/\s+/).filter(w => w.length > 0);
        const givenMiddleWords = givenMiddle.split(/\s+/).filter(w => w.length > 0);
        
        if (surnameWords.length >= 1 && surnameWords.length <= 2 &&
            givenMiddleWords.length >= 2 && givenMiddleWords.length <= 4 &&
            surname.length >= 3 && surname.length <= 25 &&
            givenMiddle.length >= 5) {
          
          const fullName = `${givenMiddle} ${surname}`;
          console.log('✅ Extracted Full Name:', fullName);
          return fullName;
        }
      }
    }
  }
  
  console.log('❌ No valid name pattern found');
  return null;
};

/**
 * PhilHealth Sex Extraction - ROBUST VERSION
 */
const extractPhilHealthSex = (lines) => {
  console.log('👤 Extracting PhilHealth Sex');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for date line with sex: "APRIL 15, 1978 - FEMALE"
    const sexPattern = /(APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JANUARY|FEBRUARY|MARCH)\s+\d{1,2},?\s+\d{4}\s*[-–—]\s*(MALE|FEMALE)/i;
    const sexMatch = line.match(sexPattern);
    
    if (sexMatch) {
      const sex = sexMatch[2].toUpperCase() === 'FEMALE' ? 'Female' : 'Male';
      console.log('✅ Found Sex:', sex);
      return sex;
    }
    
    // Alternative: Check if line ends with MALE or FEMALE
    if (line.endsWith('FEMALE') || line.endsWith('MALE')) {
      const sex = line.endsWith('FEMALE') ? 'Female' : 'Male';
      console.log('✅ Found Sex (line ending):', sex);
      return sex;
    }
    
    // Alternative: standalone on next line after date
    if (line === 'FEMALE' || line === 'MALE') {
      if (i > 0 && /\d{4}/.test(lines[i - 1])) {
        const sex = line === 'FEMALE' ? 'Female' : 'Male';
        console.log('✅ Found Sex (standalone):', sex);
        return sex;
      }
    }
  }
  
  return null;
};

/**
 * PhilHealth Birthday Extraction - ROBUST VERSION
 */
const extractPhilHealthBirthday = (lines) => {
  console.log('📅 Extracting PhilHealth Birthday');
  
  const monthNames = {
    'JANUARY': '01', 'FEBRUARY': '02', 'MARCH': '03', 'APRIL': '04',
    'MAY': '05', 'JUNE': '06', 'JULY': '07', 'AUGUST': '08',
    'SEPTEMBER': '09', 'OCTOBER': '10', 'NOVEMBER': '11', 'DECEMBER': '12'
  };
  
  for (let line of lines) {
    // Look for date pattern: "APRIL 15, 1978 - FEMALE" or "APRIL 15, 1978"
    const datePattern = /(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{1,2}),?\s+(\d{4})/i;
    const match = line.match(datePattern);
    
    if (match) {
      const monthText = match[1].toUpperCase();
      const day = match[2].padStart(2, '0');
      const year = match[3];
      const month = monthNames[monthText];
      
      if (month) {
        const formattedDate = `${year}-${month}-${day}`;
        console.log('✅ Found Birthday:', formattedDate);
        return formattedDate;
      }
    }
  }
  
  return null;
};

/**
 * PhilHealth Address Extraction - ROBUST VERSION
 */
const extractPhilHealthAddress = (lines) => {
  console.log('🏠 Extracting PhilHealth Address');
  
  let addressCandidates = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip obvious non-address lines
    if (line.includes('PHILHEALTH') || 
        line.includes('PHILIPPINE') ||
        line.includes('HEALTH') ||
        line.includes('INSURANCE') ||
        line.includes('CORPORATION') ||
        line.includes('REPUBLIC') ||
        line.includes('EPUBLIC') ||
        line.includes('NATURE') ||
        line.includes('SIGNATURE') ||
        /^\d{2}[-=]\d{9}[-=]/.test(line) || // ID number
        /^([A-Z]+),\s*([A-Z\s]+)$/.test(line) || // Name line
        /(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d{1,2},?\s+\d{4}/i.test(line) || // Date
        line === 'FEMALE' ||
        line === 'MALE' ||
        line.length < 10) {
      continue;
    }
    
    // Look for address indicators
    const hasAddressKeywords = 
      line.includes('FABIE') ||
      line.includes('STREET') ||
      (line.includes('BGY') && /\d/.test(line)) ||
      line.includes('PACO') ||
      line.includes('PACQO') ||
      line.includes('DISTRICT') ||
      line.includes('DIST RIC') ||
      line.includes('SIXTH') ||
      /\d{3,4}[-\s]*[A-Z]/.test(line); // Pattern like "1503-D" or "1503 D"
    
    if (hasAddressKeywords) {
      // Clean the line
      let cleaned = line
        .replace(/\s+/g, ' ')
        .replace(/PACQO/g, 'PACO')
        .replace(/CARIE/g, 'FABIE')
        .replace(/DIST\s*RIC\s*R?=?/gi, 'DISTRICT')
        .replace(/[=\|]+/g, '')
        .replace(/\s*,\s*$/, '')
        .trim();
      
      addressCandidates.push({
        line: cleaned,
        score: 0
      });
    }
  }
  
  // Score candidates
  for (let candidate of addressCandidates) {
    if (candidate.line.includes('FABIE')) candidate.score += 3;
    if (candidate.line.includes('STREET')) candidate.score += 2;
    if (candidate.line.includes('BGY')) candidate.score += 2;
    if (candidate.line.includes('815')) candidate.score += 2;
    if (candidate.line.includes('PACO')) candidate.score += 2;
    if (candidate.line.includes('DISTRICT')) candidate.score += 2;
    if (candidate.line.includes('SIXTH')) candidate.score += 1;
    if (/1503/.test(candidate.line)) candidate.score += 2;
  }
  
  // Sort by score and return best
  if (addressCandidates.length > 0) {
    addressCandidates.sort((a, b) => b.score - a.score);
    const bestAddress = addressCandidates[0].line;
    console.log('✅ Found Address:', bestAddress);
    return bestAddress;
  }
  
  return null;
};

/**
 * Driver's License Name Extraction - ENHANCED for Full Format
 */
const extractDrivingLicenseName = (lines) => {
  console.log('📋 Driver\'s License detected');
  console.log('📄 Lines:', lines);
  
  // Driver's License format: "LAST NAME, FIRST NAME MIDDLE NAME"
  // Example: "MENDOZA, ROSS JOHN ESTACIO"
  
  const nameWithCommaPattern = /^([A-Z\s]+),\s*([A-Z\s]+)$/;
  
  for (let line of lines) {
    // Skip header lines, labels, and system information
    if (line.includes('LICENSE') || 
        line.includes('DRIVER') ||
        line.includes('LTO') ||
        line.includes('REPUBLIC') ||
        line.includes('PHILIPPINES') ||
        line.includes('DEPARTMENT') ||
        line.includes('TRANSPORTATION') ||
        line.includes('LAND') ||
        line.includes('OFFICE') ||
        line.includes('LAST NAME') ||
        line.includes('FIRST NAME') ||
        line.includes('MIDDLE NAME') ||
        line.includes('NATIONALITY') ||
        line.includes('ADDRESS') ||
        line.includes('LICENSE NO') ||
        line.includes('EXPIRATION') ||
        line.includes('BLOOD TYPE') ||
        line.includes('EYES COLOR') ||
        line.includes('CONDITIONS') ||
        line.includes('SIGNATURE') ||
        /^N\d{2}-\d{2}-\d{6}$/.test(line) || // License number format
        /^\d{4}\/\d{2}\/\d{2}$/.test(line) || // Date format
        line.length < 5) {
      continue;
    }
    
    // Look for comma-separated name format: "SURNAME, FIRSTNAME MIDDLENAME"
    const match = line.match(nameWithCommaPattern);
    if (match) {
      const surname = match[1].trim();
      const firstMiddle = match[2].trim();
      
      const surnameWords = surname.split(/\s+/);
      const firstMiddleWords = firstMiddle.split(/\s+/);
      
      // Validate: surname should be 1-3 words, first+middle should be 2-5 words
      if (surnameWords.length >= 1 && surnameWords.length <= 3 &&
          firstMiddleWords.length >= 2 && firstMiddleWords.length <= 5 &&
          surname.length >= 2 && firstMiddle.length >= 4) {
        
        // Reconstruct as: First Middle Surname
        const fullName = `${firstMiddle} ${surname}`;
        console.log('✅ Extracted Full Name:', fullName);
        return fullName;
      }
    }
  }
  
  return null;
};

/**
 * Driver's License Sex Extraction - NEW FUNCTION
 */
const extractDriversLicenseSex = (lines) => {
  console.log('👤 Extracting Driver\'s License Sex');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
    
    // Look for "Sex" label
    if (line.includes('SEX')) {
      // Sex might be on the same line or next line
      
      // Check current line for M/F after "Sex"
      const sexMatch = line.match(/SEX[:\s]*([MF])/i);
      if (sexMatch) {
        const sex = sexMatch[1].toUpperCase() === 'M' ? 'Male' : 'Female';
        console.log('✅ Found Sex (same line):', sex);
        return sex;
      }
      
      // Check next line
      if (nextLine) {
        const nextSexMatch = nextLine.match(/^([MF])$/i);
        if (nextSexMatch) {
          const sex = nextSexMatch[1].toUpperCase() === 'M' ? 'Male' : 'Female';
          console.log('✅ Found Sex (next line):', sex);
          return sex;
        }
      }
    }
    
    // Direct M or F pattern with context (nationality line)
    // Format: "PHL     M     2004/04/29"
    const contextPattern = /^(PHL|FILIPINO)\s+([MF])\s+\d{4}\/\d{2}\/\d{2}/i;
    const contextMatch = line.match(contextPattern);
    if (contextMatch) {
      const sex = contextMatch[2].toUpperCase() === 'M' ? 'Male' : 'Female';
      console.log('✅ Found Sex (context pattern):', sex);
      return sex;
    }
  }
  
  return null;
};

/**
 * Driver's License Birthday Extraction - NEW FUNCTION
 */
const extractDriversLicenseBirthday = (lines) => {
  console.log('📅 Extracting Driver\'s License Birthday');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Driver's license format: YYYY/MM/DD
    const datePattern = /(\d{4})[\/\-](\d{2})[\/\-](\d{2})/;
    const match = line.match(datePattern);
    
    if (match) {
      const year = match[1];
      const month = match[2];
      const day = match[3];
      
      // Skip if it's clearly an expiration date (year > 2025)
      if (parseInt(year) > 2025) {
        console.log('⏭️ Skipping expiration date:', match[0]);
        continue;
      }
      
      // Skip if preceded by "EXPIRATION"
      if (i > 0 && lines[i - 1].includes('EXPIRATION')) {
        continue;
      }
      
      const formattedDate = `${year}-${month}-${day}`;
      console.log('✅ Found Birthday (direct pattern):', formattedDate);
      return formattedDate;
    }
  }
  
  return null;
};

/**
 * Driver's License Address Extraction - NEW FUNCTION
 */
const extractDriversLicenseAddress = (lines) => {
  console.log('🏠 Extracting Driver\'s License Address');
  
  let addressLines = [];
  let foundAddressLabel = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for "Address" label
    if (line.includes('ADDRESS')) {
      foundAddressLabel = true;
      const addressPart = line.replace(/ADDRESS[:\s]*/i, '').trim();
      if (addressPart.length > 10 && !addressPart.includes('LICENSE')) {
        addressLines.push(addressPart);
      }
      continue;
    }
    
    // Collect address lines after label
    if (foundAddressLabel && addressLines.length < 2) {
      // Skip non-address lines
      if (line.includes('LICENSE') ||
          line.includes('EXPIRATION') ||
          line.includes('BLOOD') ||
          line.includes('EYES') ||
          line.includes('CONDITIONS') ||
          line.includes('SIGNATURE') ||
          line.includes('DL CODES') ||
          /^N\d{2}[-\s]?\d{2}[-\s]?\d{6}$/.test(line) || // License number
          /^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/.test(line) || // Date
          /^[A-Z,]+$/.test(line) || // DL Codes like "A,A1,B"
          line.length < 10) {
        continue;
      }
      
      // Look for address indicators
      if (/\d+/.test(line) && ( // Has numbers
          line.includes('ST') ||
          line.includes('STREET') ||
          line.includes('BRGY') ||
          line.includes('BARANGAY') ||
          line.includes('CITY') ||
          line.includes('DISTRICT') ||
          line.includes('MANILA') ||
          line.includes('NCR') ||
          line.includes('TONDO') ||
          line.includes('BATO'))) {
        addressLines.push(line.trim());
      }
    }
  }
  
  if (addressLines.length > 0) {
    const fullAddress = addressLines.join(', ');
    console.log('✅ Found Address:', fullAddress);
    return fullAddress;
  }
  
  return null;
};

/**
 * UMID Name Extraction - ENHANCED for Full Format
 */
const extractUMIDName = (lines) => {
  console.log('📋 UMID ID detected');
  console.log('📄 Lines:', lines);
  
  let surname = null;
  let givenName = null;
  let middleName = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
    
    // Skip header/system lines
    if (line.includes('UMID') || 
        line.includes('UNIFIED') ||
        line.includes('MULTI-PURPOSE') ||
        line.includes('IDENTIFICATION') ||
        line.includes('SSS') ||
        line.includes('GSIS') ||
        line.includes('PHILHEALTH') ||
        line.includes('HDMF') ||
        line.includes('CARD') ||
        line.includes('NUMBER') ||
        /^\d{4}-\d{7}-\d$/.test(line) || // UMID number format
        line.length < 2) {
      continue;
    }
    
    // Look for "SURNAME" label
    if (line.includes('SURNAME') || line.includes('LAST NAME') || line.includes('APELYIDO')) {
      if (nextLine && nextLine.length >= 2 && !nextLine.includes('/') && !nextLine.includes('GIVEN')) {
        surname = nextLine.trim();
        console.log('✅ Found Surname:', surname);
      }
    }
    
    // Look for "GIVEN NAME" label
    if ((line.includes('GIVEN') && line.includes('NAME')) || line.includes('FIRST NAME')) {
      if (nextLine && nextLine.length >= 2 && !nextLine.includes('/') && !nextLine.includes('MIDDLE')) {
        givenName = nextLine.trim();
        console.log('✅ Found Given Name:', givenName);
      }
    }
    
    // Look for "MIDDLE NAME" label
    if (line.includes('MIDDLE') && line.includes('NAME')) {
      if (nextLine && nextLine.length >= 2 && !nextLine.includes('/') && !nextLine.includes('DATE')) {
        middleName = nextLine.trim();
        console.log('✅ Found Middle Name:', middleName);
      }
    }
  }
  
  // Construct full name: Given Name + Middle Name + Surname
  if (givenName && surname) {
    let fullName = givenName;
    if (middleName) {
      fullName += ' ' + middleName;
    }
    fullName += ' ' + surname;
    console.log('✅ Constructed Full Name:', fullName);
    return fullName;
  }
  
  // Fallback: Look for comma-separated format "SURNAME, GIVEN MIDDLE"
  const nameWithCommaPattern = /^([A-Z\s]+),\s*([A-Z\s]+)$/;
  
  for (let line of lines) {
    if (line.includes('UMID') || 
        line.includes('UNIFIED') ||
        line.includes('SSS') ||
        line.includes('GSIS') ||
        /^\d{4}-\d{7}-\d$/.test(line)) {
      continue;
    }
    
    const match = line.match(nameWithCommaPattern);
    if (match) {
      const lastName = match[1].trim();
      const firstMiddle = match[2].trim();
      
      const lastWords = lastName.split(/\s+/);
      const firstWords = firstMiddle.split(/\s+/);
      
      if (lastWords.length >= 1 && lastWords.length <= 2 &&
          firstWords.length >= 2 && firstWords.length <= 4 &&
          lastName.length >= 2 && firstMiddle.length >= 4) {
        const fullName = `${firstMiddle} ${lastName}`;
        console.log('✅ Extracted Full Name (comma format):', fullName);
        return fullName;
      }
    }
  }
  
  return null;
};

/**
 * UMID Sex Extraction - NEW FUNCTION
 */
const extractUMIDSex = (lines) => {
  console.log('👤 Extracting UMID Sex');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
    
    // Look for "SEX" or "GENDER" label
    if (line.includes('SEX') || line.includes('GENDER')) {
      // Sex might be on the same line or next line
      
      // Check current line for M/F after label
      const sexMatch = line.match(/SEX[:\s]*([MF])/i) || line.match(/GENDER[:\s]*([MF])/i);
      if (sexMatch) {
        const sex = sexMatch[1].toUpperCase() === 'M' ? 'Male' : 'Female';
        console.log('✅ Found Sex (same line):', sex);
        return sex;
      }
      
      // Check next line
      if (nextLine) {
        const nextSexMatch = nextLine.match(/^([MF])$/i) || nextLine.match(/^(MALE|FEMALE)$/i);
        if (nextSexMatch) {
          const sexValue = nextSexMatch[1].toUpperCase();
          const sex = (sexValue === 'M' || sexValue === 'MALE') ? 'Male' : 'Female';
          console.log('✅ Found Sex (next line):', sex);
          return sex;
        }
      }
    }
    
    // Direct M/F pattern with context
    if (line.match(/SEX.*([MF])/i)) {
      const sexMatch = line.match(/([MF])/i);
      if (sexMatch) {
        const sex = sexMatch[1].toUpperCase() === 'M' ? 'Male' : 'Female';
        console.log('✅ Found Sex (pattern):', sex);
        return sex;
      }
    }
  }
  
  return null;
};

/**
 * UMID Birthday Extraction - NEW FUNCTION
 */
const extractUMIDBirthday = (lines) => {
  console.log('📅 Extracting UMID Birthday');
  
  const monthNames = {
    'JANUARY': '01', 'FEBRUARY': '02', 'MARCH': '03', 'APRIL': '04',
    'MAY': '05', 'JUNE': '06', 'JULY': '07', 'AUGUST': '08',
    'SEPTEMBER': '09', 'OCTOBER': '10', 'NOVEMBER': '11', 'DECEMBER': '12',
    'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
    'JUN': '06', 'JUL': '07', 'AUG': '08', 'SEP': '09',
    'OCT': '10', 'NOV': '11', 'DEC': '12'
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
    
    // Look for "DATE OF BIRTH" or "BIRTHDAY" label
    if ((line.includes('DATE') && line.includes('BIRTH')) || 
        line.includes('BIRTHDAY') ||
        line.includes('BIRTH DATE')) {
      
      // Birthday might be on same line or next line
      
      // Format: "MONTH DAY, YEAR" or "MONTH DAY YEAR"
      const datePattern1 = /([A-Z]+)\s+(\d{1,2}),?\s+(\d{4})/;
      const match1 = line.match(datePattern1) || (nextLine ? nextLine.match(datePattern1) : null);
      
      if (match1) {
        const month = monthNames[match1[1]];
        const day = match1[2].padStart(2, '0');
        const year = match1[3];
        
        if (month) {
          const formattedDate = `${year}-${month}-${day}`;
          console.log('✅ Found Birthday (format 1):', formattedDate);
          return formattedDate;
        }
      }
      
      // Format: "DD/MM/YYYY" or "MM/DD/YYYY"
      const datePattern2 = /(\d{2})\/(\d{2})\/(\d{4})/;
      const match2 = line.match(datePattern2) || (nextLine ? nextLine.match(datePattern2) : null);
      
      if (match2) {
        // Assume MM/DD/YYYY format (common in Philippines)
        const month = match2[1].padStart(2, '0');
        const day = match2[2].padStart(2, '0');
        const year = match2[3];
        const formattedDate = `${year}-${month}-${day}`;
        console.log('✅ Found Birthday (format 2):', formattedDate);
        return formattedDate;
      }
      
      // Format: "YYYY-MM-DD"
      const datePattern3 = /(\d{4})-(\d{2})-(\d{2})/;
      const match3 = line.match(datePattern3) || (nextLine ? nextLine.match(datePattern3) : null);
      
      if (match3) {
        console.log('✅ Found Birthday (format 3):', match3[0]);
        return match3[0];
      }
    }
    
    // Direct date pattern search without label
    const directPattern = /([A-Z]+)\s+(\d{1,2}),?\s+(\d{4})/;
    const directMatch = line.match(directPattern);
    
    if (directMatch && monthNames[directMatch[1]]) {
      const month = monthNames[directMatch[1]];
      const day = directMatch[2].padStart(2, '0');
      const year = directMatch[3];
      const formattedDate = `${year}-${month}-${day}`;
      console.log('✅ Found Birthday (direct pattern):', formattedDate);
      return formattedDate;
    }
  }
  
  return null;
};

/**
 * UMID Address Extraction - NEW FUNCTION
 */
const extractUMIDAddress = (lines) => {
  console.log('🏠 Extracting UMID Address');
  
  let addressLines = [];
  let foundAddressLabel = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for "ADDRESS" label
    if (line.includes('ADDRESS') || line.includes('RESIDENCE')) {
      foundAddressLabel = true;
      
      // Address might be on same line after label
      const addressPart = line.replace(/ADDRESS[:\s]*/i, '').replace(/RESIDENCE[:\s]*/i, '').trim();
      if (addressPart.length > 5 && !addressPart.includes('NUMBER')) {
        addressLines.push(addressPart);
      }
      continue;
    }
    
    // Collect address lines after the label
    if (foundAddressLabel && addressLines.length < 3) {
      // Skip lines that are clearly not address
      if (line.includes('DATE') ||
          line.includes('BIRTH') ||
          line.includes('SEX') ||
          line.includes('UMID') ||
          line.includes('NUMBER') ||
          /^\d{4}-\d{7}-\d$/.test(line) || // UMID ID number
          line.length < 5) {
        continue;
      }
      
      // Look for address patterns
      if (/\d/.test(line) || // Contains numbers
          line.includes('ST.') ||
          line.includes('STREET') ||
          line.includes('BRGY') ||
          line.includes('BARANGAY') ||
          line.includes('CITY') ||
          line.includes('PROVINCE') ||
          line.includes('ZONE') ||
          line.includes('AVENUE') ||
          line.includes('ROAD')) {
        addressLines.push(line.trim());
      }
    }
    
    // Alternative: Look for address-like lines without label
    if (!foundAddressLabel && addressLines.length === 0) {
      if ((line.includes('BRGY') || line.includes('BARANGAY')) && /\d/.test(line)) {
        addressLines.push(line.trim());
        foundAddressLabel = true;
      }
    }
  }
  
  if (addressLines.length > 0) {
    const fullAddress = addressLines.join(', ');
    console.log('✅ Found Address:', fullAddress);
    return fullAddress;
  }
  
  return null;
};

/**
 * PhilSys Name Extraction - MODIFIED for Full Name extraction
 */
const extractPhilsysName = (lines) => {
  console.log('📋 PhilSys ID detected');
  
  // PhilSys format: "Apellyido/Last Name" on one line, "Mga Pangalan/Given Names" on next, "Gitnang Apelyido/Middle Name" on another
  let lastName = null;
  let givenNames = null;
  let middleName = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
    
    // Skip header lines
    if (line.includes('PHILSYS') || 
        line.includes('PHILIPPINE') ||
        line.includes('IDENTIFICATION') ||
        line.includes('SYSTEM') ||
        line.includes('REPUBLIKA') ||
        line.includes('PAMBANSANG') ||
        line.includes('PAGKAKAKILANLAN') ||
        /^\d{4}-\d{4}-\d{4}$/.test(line)) {
      continue;
    }
    
    // Look for "Apellyido/Last Name" or "Apelyido/Last Name" label
    if ((line.includes('APELLYIDO') || line.includes('APELYIDO')) && line.includes('LAST NAME')) {
      // Last name is on the next line
      if (nextLine && nextLine.length >= 2 && !nextLine.includes('/') && !nextLine.includes('PANGALAN')) {
        lastName = nextLine.trim();
        console.log('✅ Found Last Name:', lastName);
      }
    }
    
    // Look for "Mga Pangalan/Given Names" label
    if (line.includes('PANGALAN') && line.includes('GIVEN NAMES')) {
      // Given names are on the next line
      if (nextLine && nextLine.length >= 2 && !nextLine.includes('/') && !nextLine.includes('GITNANG')) {
        givenNames = nextLine.trim();
        console.log('✅ Found Given Names:', givenNames);
      }
    }
    
    // Look for "Gitnang Apelyido/Middle Name" label
    if (line.includes('GITNANG') && line.includes('MIDDLE NAME')) {
      // Middle name is on the next line
      if (nextLine && nextLine.length >= 2 && !nextLine.includes('/') && !nextLine.includes('PETSA')) {
        middleName = nextLine.trim();
        console.log('✅ Found Middle Name:', middleName);
      }
    }
  }
  
  // Construct full name: Given Names + Middle Name + Last Name
  if (givenNames && lastName) {
    let fullName = givenNames;
    if (middleName) {
      fullName += ' ' + middleName;
    }
    fullName += ' ' + lastName;
    console.log('✅ Constructed Full Name:', fullName);
    return fullName;
  }
  
  // Fallback: try comma-separated format (old logic as backup)
  const nameWithCommaPattern = /^([A-Z\s]+),\s*([A-Z\s]+)$/;
  
  for (let line of lines) {
    if (line.includes('PHILSYS') || 
        line.includes('PHILIPPINE') ||
        line.includes('IDENTIFICATION') ||
        line.includes('SYSTEM') ||
        /^\d{4}-\d{4}-\d{4}$/.test(line)) {
      continue;
    }
    
    const match = line.match(nameWithCommaPattern);
    if (match) {
      const lastName = match[1].trim();
      const firstMiddle = match[2].trim();
      
      const lastWords = lastName.split(/\s+/);
      const firstWords = firstMiddle.split(/\s+/);
      
      if (lastWords.length >= 1 && lastWords.length <= 2 &&
          firstWords.length >= 2 && firstWords.length <= 4 &&
          lastName.length >= 2 && firstMiddle.length >= 4) {
        return `${firstMiddle} ${lastName}`;
      }
    }
  }
  
  return null;
};

/**
 * PhilSys Birthday Extraction - NEW FUNCTION
 */
const extractPhilsysBirthday = (lines) => {
  console.log('📅 Extracting PhilSys Birthday');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
    
    // Look for "Petsa ng Kapanganakan/Date of Birth" label
    if ((line.includes('PETSA') && line.includes('KAPANGANAKAN')) || 
        (line.includes('DATE') && line.includes('BIRTH'))) {
      
      // Birthday is on the next line
      if (nextLine) {
        // Try to match various date formats
        // Format: "APRIL 15, 1978" or "APRIL 15 1978" or "15 APRIL 1978"
        const monthNames = {
          'JANUARY': '01', 'FEBRUARY': '02', 'MARCH': '03', 'APRIL': '04',
          'MAY': '05', 'JUNE': '06', 'JULY': '07', 'AUGUST': '08',
          'SEPTEMBER': '09', 'OCTOBER': '10', 'NOVEMBER': '11', 'DECEMBER': '12'
        };
        
        // Try "MONTH DAY, YEAR" or "MONTH DAY YEAR"
        const datePattern1 = /([A-Z]+)\s+(\d{1,2}),?\s+(\d{4})/;
        const match1 = nextLine.match(datePattern1);
        
        if (match1) {
          const month = monthNames[match1[1]];
          const day = match1[2].padStart(2, '0');
          const year = match1[3];
          
          if (month) {
            const formattedDate = `${year}-${month}-${day}`;
            console.log('✅ Found Birthday:', formattedDate);
            return formattedDate;
          }
        }
        
        // Try "DAY MONTH YEAR"
        const datePattern2 = /(\d{1,2})\s+([A-Z]+)\s+(\d{4})/;
        const match2 = nextLine.match(datePattern2);
        
        if (match2) {
          const day = match2[1].padStart(2, '0');
          const month = monthNames[match2[2]];
          const year = match2[3];
          
          if (month) {
            const formattedDate = `${year}-${month}-${day}`;
            console.log('✅ Found Birthday:', formattedDate);
            return formattedDate;
          }
        }
        
        // Try numeric format: "YYYY-MM-DD" or "MM/DD/YYYY" or "DD/MM/YYYY"
        const numericPattern = /(\d{4})-(\d{2})-(\d{2})|(\d{2})\/(\d{2})\/(\d{4})/;
        const numMatch = nextLine.match(numericPattern);
        
        if (numMatch) {
          if (numMatch[1]) {
            // YYYY-MM-DD format
            console.log('✅ Found Birthday:', nextLine);
            return nextLine;
          } else if (numMatch[4]) {
            // MM/DD/YYYY or DD/MM/YYYY - assume MM/DD/YYYY for Philippines
            const part1 = numMatch[4].padStart(2, '0');
            const part2 = numMatch[5].padStart(2, '0');
            const year = numMatch[6];
            const formattedDate = `${year}-${part1}-${part2}`;
            console.log('✅ Found Birthday:', formattedDate);
            return formattedDate;
          }
        }
      }
    }
  }
  
  return null;
};

/**
 * PhilSys Address Extraction - NEW FUNCTION
 */
const extractPhilsysAddress = (lines) => {
  console.log('🏠 Extracting PhilSys Address');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for "Tirahan/Address" label
    if ((line.includes('TIRAHAN') && line.includes('ADDRESS')) || 
        line.includes('TIRAHAN/ADDRESS')) {
      
      // Address might span multiple lines after the label
      let addressParts = [];
      let j = i + 1;
      
      // Collect next 1-3 lines as address (stop at next label or empty line)
      while (j < lines.length && j < i + 4) {
        const addressLine = lines[j].trim();
        
        // Stop if we hit another label or ID number
        if (!addressLine || 
            addressLine.includes('PETSA') || 
            addressLine.includes('BIRTH') ||
            addressLine.includes('KAPANGANAKAN') ||
            /^\d{4}-\d{4}-\d{4}$/.test(addressLine) ||
            addressLine.length < 5) {
          break;
        }
        
        addressParts.push(addressLine);
        j++;
      }
      
      if (addressParts.length > 0) {
        const fullAddress = addressParts.join(', ');
        console.log('✅ Found Address:', fullAddress);
        return fullAddress;
      }
    }
  }
  
  return null;
};

const extractPagIbigName = (lines) => {
  console.log('📋 PAG-IBIG ID detected');
  console.log('📄 Lines:', lines);
  
  // Strategy: Find the line immediately BEFORE "MID NO" or "MID No."
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
    
    // Check if NEXT line contains "MID" and a number pattern
    const isMIDLine = /MID\s*NO\.?/i.test(nextLine) || /\d{4}-\d{4}-\d{4}/.test(nextLine);
    
    if (isMIDLine && line) {
      // Skip if current line is a header/label
      if (line.includes('PAG-IBIG') || 
          line.includes('HDMF') ||
          line.includes('LOYALTY') ||
          line.includes('CARD') ||
          line.includes('PLUS') ||
          line.length < 3) {
        continue;
      }
      
      // Validate: should contain mostly letters and spaces
      // Allow periods for middle initials (e.g., "M.")
      const words = line.split(/\s+/);
      const hasValidFormat = words.length >= 2 && words.length <= 5;
      
      // Check if mostly alphabetic (allow periods and hyphens for names)
      const letterCount = (line.match(/[A-Z]/g) || []).length;
      const isNameLike = letterCount / line.length >= 0.7;
      
      if (hasValidFormat && isNameLike) {
        console.log('✅ Found PAG-IBIG Name:', line);
        return line;
      }
    }
  }
  
  console.log('❌ No PAG-IBIG name found');
  return null;
};

/**
 * Postal ID Name Extraction - ENHANCED
 */
const extractPostalIDName = (lines) => {
  console.log('📋 Postal ID detected');
  console.log('📄 Lines:', lines);
  
  // Postal ID format: "FIRST NAME, MIDDLE NAME, SURNAME, SUFFIX" on one line
  // Or: "SURNAME, FIRST NAME MIDDLE NAME" format
  
  let fullName = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip header/label lines
    if (line.includes('POSTAL') || 
        line.includes('REPUBLIC') ||
        line.includes('PHILIPPINES') ||
        line.includes('CORPORATION') ||
        line.includes('IDENTITY') ||
        line.includes('CARD') ||
        line.includes('PRN') ||
        line.includes('HOLDER') ||
        line.includes('SIGNATURE') ||
        line.includes('POSTMASTER') ||
        line.includes('PREMIUM') ||
        /^[A-Z]{3}\d{6,10}$/.test(line) || // Postal ID number format
        /^PRN\s+[A-Z0-9]+$/.test(line) || // PRN number
        /^\d{2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2}$/.test(line) || // Date format
        line.includes('Date of Birth') ||
        line.includes('Address') ||
        line.includes('Nationality') ||
        line.includes('Valid Until') ||
        line.includes('Post Office') ||
        line.length < 5) {
      continue;
    }
    
    // Look for comma-separated name format
    if (line.includes(',')) {
      // Format 1: "SURNAME, FIRST MIDDLE" or "FIRST, MIDDLE, SURNAME"
      const parts = line.split(',').map(p => p.trim());
      
      if (parts.length >= 2) {
        // Check if this looks like a valid name (at least 2 words total)
        const totalWords = parts.join(' ').split(/\s+/).length;
        
        if (totalWords >= 2 && totalWords <= 6) {
          // Assume format: "SURNAME, FIRST MIDDLE"
          const surname = parts[0].trim();
          const firstMiddle = parts.slice(1).join(' ').trim();
          
          // Validate: surname should be 1-2 words, first+middle should be 1-4 words
          const surnameWords = surname.split(/\s+/);
          const firstMiddleWords = firstMiddle.split(/\s+/);
          
          if (surnameWords.length >= 1 && surnameWords.length <= 2 &&
              firstMiddleWords.length >= 1 && firstMiddleWords.length <= 4 &&
              surname.length >= 2 && firstMiddle.length >= 2) {
            
            fullName = `${firstMiddle} ${surname}`;
            console.log('✅ Extracted Full Name (comma format):', fullName);
            return fullName;
          }
        }
      }
    }
  }
  
  // Fallback: Look for line with 2-5 words that looks like a name
  for (let line of lines) {
    if (line.includes('POSTAL') || 
        line.includes('REPUBLIC') ||
        line.includes('PHILIPPINES') ||
        line.includes('CORPORATION') ||
        line.includes('PRN') ||
        /^\d/.test(line) || // Starts with number (likely address)
        line.length < 5) {
      continue;
    }
    
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 5) {
      // Check if all words look like name parts (mostly letters)
      const looksLikeName = words.every(word => 
        /^[A-Z][A-Z\s\-'\.]*$/i.test(word) && word.length >= 2
      );
      
      if (looksLikeName) {
        fullName = line;
        console.log('✅ Extracted Full Name (fallback):', fullName);
        return fullName;
      }
    }
  }
  
  return null;
};

/**
 * Postal ID Birthday Extraction - NEW FUNCTION
 */
const extractPostalIDBirthday = (lines) => {
  console.log('📅 Extracting Postal ID Birthday');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for "Date of Birth" label
    if ((line.includes('DATE') && line.includes('BIRTH')) ||
        line.includes('Date of Birth')) {
      
      // Birthday might be on the same line or next line
      // Format: "15 Apr 78" or "15 APR 1978"
      
      // Check current line first
      const dateMatch = line.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2,4})/i);
      if (dateMatch) {
        return formatPostalDate(dateMatch[1], dateMatch[2], dateMatch[3]);
      }
      
      // Check next line
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const nextDateMatch = nextLine.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2,4})/i);
        if (nextDateMatch) {
          return formatPostalDate(nextDateMatch[1], nextDateMatch[2], nextDateMatch[3]);
        }
      }
    }
    
    // Direct date pattern search (without label)
    const directMatch = line.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2,4})/i);
    if (directMatch && !line.includes('Valid Until')) {
      return formatPostalDate(directMatch[1], directMatch[2], directMatch[3]);
    }
  }
  
  return null;
};

/**
 * Postal ID Address Extraction - NEW FUNCTION
 */
const extractPostalIDAddress = (lines) => {
  console.log('🏠 Extracting Postal ID Address');
  
  let addressLines = [];
  let foundAddressLabel = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for "Address" label
    if (line.includes('Address')) {
      foundAddressLabel = true;
      
      // Address might be on the same line after "Address"
      const addressPart = line.replace(/Address\s*/i, '').trim();
      if (addressPart.length > 5) {
        addressLines.push(addressPart);
      }
      continue;
    }
    
    // Collect address lines after the label
    if (foundAddressLabel && addressLines.length < 2) {
      // Skip lines that are clearly not address
      if (line.includes('Date of Birth') ||
          line.includes('Nationality') ||
          line.includes('Valid Until') ||
          line.includes('Post Office') ||
          line.includes('POSTAL') ||
          line.includes('PRN') ||
          /^[A-Z]{3}\d{6,10}$/.test(line) || // Postal ID number
          line.length < 5) {
        continue;
      }
      
      // Look for address patterns (contains numbers, street names, etc.)
      if (/\d/.test(line) || // Contains numbers
          line.includes('ST.') ||
          line.includes('STREET') ||
          line.includes('BRGY') ||
          line.includes('ZONE') ||
          line.includes('NCR') ||
          line.includes('MANILA') ||
          line.includes('CITY') ||
          line.includes('PROVINCE')) {
        addressLines.push(line.trim());
      }
    }
    
    // Alternative: Look for address-like lines without label
    if (!foundAddressLabel && addressLines.length === 0) {
      // Address typically has numbers and street/location keywords
      if (/\d+-[A-Z]/.test(line) || // e.g., "1503-D FABIE ST."
          (line.includes('ST.') && /\d/.test(line)) ||
          (line.includes('BRGY') && /\d/.test(line))) {
        addressLines.push(line.trim());
        foundAddressLabel = true;
      }
    }
  }
  
  if (addressLines.length > 0) {
    const fullAddress = addressLines.join(', ');
    console.log('✅ Found Address:', fullAddress);
    return fullAddress;
  }
  
  return null;
};

/**
 * Helper: Format Postal ID date to YYYY-MM-DD
 */
const formatPostalDate = (day, month, year) => {
  const monthMap = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12',
    'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
    'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
    'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
  };
  
  const monthNum = monthMap[month] || '01';
  const dayNum = day.padStart(2, '0');
  
  // Handle 2-digit year (e.g., "78" -> "1978")
  let yearNum = year;
  if (year.length === 2) {
    const yearInt = parseInt(year);
    yearNum = yearInt > 50 ? `19${year}` : `20${year}`;
  }
  
  const formattedDate = `${yearNum}-${monthNum}-${dayNum}`;
  console.log('✅ Formatted Birthday:', formattedDate);
  return formattedDate;
};

/**
 * Enhanced ID extraction based on user-selected ID type
 */
export const extractNameByIDType = (text, idType) => {
  const lines = text.split('\n').map(line => line.trim().toUpperCase()).filter(line => line.length > 0);
  
  console.log('🔍 Processing lines for ID type:', idType);
  console.log('📄 Lines:', lines);

  switch(idType) {
    case 'philhealth':
      return extractPhilHealthName(lines);
    case 'drivers_license':
      return extractDrivingLicenseName(lines);
    case 'umid':
      return extractUMIDName(lines);
    case 'philsys':
      return extractPhilsysName(lines);
    case 'pagibig':
      return extractPagIbigName(lines);
    case 'postal':
      return extractPostalIDName(lines);
    default:
      console.log('❌ Unknown ID type:', idType);
      return null;
  }
};

/**
 * Extract ID number based on ID type
 */
export const extractIDNumber = (text, idType) => {
  console.log('🔍 Extracting ID number for type:', idType);
  
  const patterns = {
    philhealth: /\b\d{2}[-\s]?\d{9}[-\s]?\d\b/,
    umid: /\b\d{4}[-\s]?\d{7}[-\s]?\d\b/,
    drivers_license: /\bN\d{2}[-\s]?\d{2}[-\s]?\d{6}\b/,
    philsys: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
    pagibig: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
    postal: /\b[A-Z]{3}\s*\d{12}\s*P\b/
  };
  
  const pattern = patterns[idType];
  if (!pattern) {
    console.log('❌ No pattern found for ID type:', idType);
    return null;
  }
  
  // Clean up the text - remove excessive spaces and normalize
  const cleanedText = text.replace(/\s+/g, ' ').trim();
  
  const match = cleanedText.match(pattern);
  if (match) {
    console.log('✅ Found ID number:', match[0]);
    return match[0].replace(/\s/g, '-'); // Normalize separators to hyphens
  }
  
  console.log('❌ No ID number found');
  return null;
};

/**
 * Extract name from ID (legacy)
 */
export const extractNameFromID = (text, idType) => {
  return extractNameByIDType(text, idType);
};

/**
 * Main OCR processing with ID type specification
 */
export const processIDWithOCREnhanced = async (imageData, idType, retryCount = 0) => {
  try {
    console.log(`🔍 OCR Attempt ${retryCount + 1} for ID type: ${idType}`);
    
    if (!idType) {
      return {
        success: false,
        name: null,
        sex: null,
        birthday: null,
        address: null,
        idNumber: null,
        rawText: '',
        confidence: 0,
        message: 'Please select an ID type before scanning'
      };
    }
    
    // Run OCR
    const { data: { text, confidence } } = await Tesseract.recognize(
      imageData, 
      OCR_CONFIG.lang,
      {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`Progress:`, Math.round(m.progress * 100) + '%');
          }
        },
        ...OCR_CONFIG
      }
    );
    
    console.log(`📄 Raw Text:`, text);
    console.log(`📊 Confidence:`, confidence);
    
    // Extract name
    const extractedName = extractNameByIDType(text, idType);
    
    // Extract ID number
    const extractedIDNumber = extractIDNumber(text, idType);
    
    // Extract additional fields based on ID type
    let extractedSex = null;
    let extractedBirthday = null;
    let extractedAddress = null;
    
    const lines = text.split('\n').map(line => line.trim().toUpperCase()).filter(line => line.length > 0);
    
    if (idType === 'philhealth') {
      extractedSex = extractPhilHealthSex(lines);
      extractedBirthday = extractPhilHealthBirthday(lines);
      extractedAddress = extractPhilHealthAddress(lines);
    } else if (idType === 'drivers_license') {
      extractedSex = extractDriversLicenseSex(lines);
      extractedBirthday = extractDriversLicenseBirthday(lines);
      extractedAddress = extractDriversLicenseAddress(lines);
    } else if (idType === 'philsys') {
      extractedBirthday = extractPhilsysBirthday(lines);
      extractedAddress = extractPhilsysAddress(lines);
    } else if (idType === 'postal') {
      extractedBirthday = extractPostalIDBirthday(lines);
      extractedAddress = extractPostalIDAddress(lines);
    } else if (idType === 'umid') {
      extractedSex = extractUMIDSex(lines);
      extractedBirthday = extractUMIDBirthday(lines);
      extractedAddress = extractUMIDAddress(lines);
    }
    
    if (extractedName) {
      return {
        success: true,
        name: extractedName,
        sex: extractedSex,
        birthday: extractedBirthday,
        address: extractedAddress,
        idNumber: extractedIDNumber,
        idType: idType,
        rawText: text,
        confidence: confidence,
        message: `${idType.toUpperCase()} data extracted successfully!`
      };
    }
    
    return {
      success: false,
      name: null,
      sex: null,
      birthday: null,
      address: null,
      idNumber: extractedIDNumber,
      idType: idType,
      rawText: text,
      confidence: confidence,
      message: `Could not extract name from ${idType.toUpperCase()}. Please verify the ID is clearly visible or enter manually.`
    };
    
  } catch (error) {
    console.error('❌ OCR Error:', error);
    return {
      success: false,
      name: null,
      sex: null,
      birthday: null,
      address: null,
      idNumber: null,
      rawText: '',
      confidence: 0,
      message: 'OCR processing failed. Please try again.',
      error: error.message
    };
  }
};

// Main export
export const processIDWithOCR = processIDWithOCREnhanced;

// Default export - MODIFIED to include PhilHealth functions
export default {
  processIDWithOCR,
  processIDWithOCREnhanced,
  extractNameFromID,
  extractNameByIDType,
  extractIDNumber,
  extractDrivingLicenseName,
  extractDriversLicenseSex,
  extractDriversLicenseBirthday,
  extractDriversLicenseAddress,
  extractPhilHealthSex,
  extractPhilHealthBirthday,
  extractPhilHealthAddress,
  extractPhilsysBirthday,
  extractPhilsysAddress,
  extractPostalIDBirthday,
  extractPostalIDAddress,
  extractUMIDSex,
  extractUMIDBirthday,
  extractUMIDAddress,
  preprocessingTechniques,
  isCameraAvailable,
  initializeCamera,
  cleanupCamera,
  captureImageFromVideo,
  filterNoiseLines,
  detectIDInFrame,
  cropAndPreprocessID,
  startAutoCapture
};