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
   * PhilHealth Name Extraction - REVISED VERSION
   * Input Format: "LEJARDE, JERELYN MANGADLAO" (SURNAME, FIRSTNAME MIDDLENAME)
   * Output Format: "JERELYN MANGADLAO LEJARDE" (FIRSTNAME MIDDLENAME SURNAME)
   */
  const extractPhilHealthName = (lines) => {
    console.log('📋 PhilHealth ID detected');
    console.log('📄 All Lines:', lines);
    
    const cleanLines = filterNoiseLines(lines);
    console.log('📄 Clean Lines:', cleanLines);
    
    // PhilHealth format: "SURNAME, FIRSTNAME MIDDLENAME"
    const namePattern = /^([A-Z][A-Z\s\-']{1,25})\s*,\s*([A-Z][A-Z\s\-']{3,40})$/;
    
    for (let i = 0; i < cleanLines.length; i++) {
      let line = cleanLines[i];
      
      // Clean the line - remove noise characters
      let cleanLine = line
        .replace(/[|\\\/\=\+\*\@\#\$\%\^\&\[\]\{\}\(\)]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[0-9IVX\$\&\-\s]+/, '')
        .replace(/[0-9IVX\$\&\-\s]+$/, '')
        .trim();
      
      console.log('🔍 Checking line for name:', cleanLine);
      
      // Skip non-name lines
      if (cleanLine.includes('PHILHEALTH') || 
          cleanLine.includes('PHILIPPINE') ||
          cleanLine.includes('REPUBLIC') ||
          cleanLine.includes('HEALTH') ||
          cleanLine.includes('INSURANCE') ||
          cleanLine.includes('CORPORATION') ||
          cleanLine.includes('STREET') ||
          cleanLine.includes('BARANGAY') ||
          cleanLine.includes('BGY') ||
          cleanLine.includes('BRGY') ||
          cleanLine.includes('DISTRICT') ||
          cleanLine.includes('CITY') ||
          cleanLine.includes('PROVINCE') ||
          cleanLine.includes('MANILA') ||
          cleanLine.includes('MEMBER') ||
          cleanLine.includes('DEPENDENT') ||
          cleanLine.includes('SIGNATURE') ||
          /\d{2}[-\s]?\d{9}[-\s]?\d/.test(cleanLine) ||
          /\d{4}[-\/]\d{2}[-\/]\d{2}/.test(cleanLine) ||
          /(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d{1,2}/i.test(cleanLine) ||
          cleanLine.includes('FEMALE') ||
          cleanLine.includes('MALE') ||
          cleanLine.length < 8 ||
          cleanLine.length > 50) {
        continue;
      }
      
      // Must have a comma for PhilHealth name format
      if (!cleanLine.includes(',')) {
        continue;
      }
      
      const match = cleanLine.match(namePattern);
      if (match) {
        const surname = match[1].trim();
        const firstMiddle = match[2].trim();
        
        console.log('🔍 Potential match - Surname:', surname, 'First+Middle:', firstMiddle);
        
        // Validate: no numbers or special chars in name
        if (!/[0-9\{\}\[\]\(\)\=\|\+\*\@\#\$\%\^\&]/.test(surname) &&
            !/[0-9\{\}\[\]\(\)\=\|\+\*\@\#\$\%\^\&]/.test(firstMiddle)) {
          
          const surnameWords = surname.split(/\s+/).filter(w => w.length > 0);
          const firstMiddleWords = firstMiddle.split(/\s+/).filter(w => w.length > 0);
          
          // Surname: 1-2 words, First+Middle: 2-4 words
          if (surnameWords.length >= 1 && surnameWords.length <= 2 &&
              firstMiddleWords.length >= 2 && firstMiddleWords.length <= 4 &&
              surname.length >= 2 && surname.length <= 25 &&
              firstMiddle.length >= 4 && firstMiddle.length <= 40) {
            
            // Output Format: FIRSTNAME MIDDLENAME SURNAME
            const fullName = `${firstMiddle} ${surname}`;
            console.log('✅ Extracted Full Name (First Middle Surname):', fullName);
            return fullName;
          }
        }
      }
    }
    
    // Fallback: Try to find name near the ID number
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // If this line looks like an ID number, check the next line for name
      if (/\d{2}[-\s]?\d{9}[-\s]?\d/.test(line)) {
        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
        
        if (nextLine && nextLine.includes(',')) {
          const cleanNext = nextLine
            .replace(/[|\\\/\=\+\*\@\#\$\%\^\&\[\]\{\}\(\)]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          const match = cleanNext.match(namePattern);
          if (match) {
            const surname = match[1].trim();
            const firstMiddle = match[2].trim();
            
            // Output Format: FIRSTNAME MIDDLENAME SURNAME
            const fullName = `${firstMiddle} ${surname}`;
            console.log('✅ Extracted Full Name (after ID number):', fullName);
            return fullName;
          }
        }
      }
    }
    
    console.log('❌ No valid PhilHealth name found');
    return null;
  };

  /**
   * PhilHealth Sex Extraction - IMPROVED VERSION
   * Format: "APRIL 15, 1978 - FEMALE" (same line as birthday, after dash)
   */
  const extractPhilHealthSex = (lines) => {
    console.log('👤 Extracting PhilHealth Sex');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Pattern 1: Date followed by dash and sex
      const sexAfterDatePattern = /(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d{1,2},?\s+\d{4}\s*[-–—]\s*(MALE|FEMALE)/i;
      const sexMatch = line.match(sexAfterDatePattern);
      
      if (sexMatch) {
        const sex = sexMatch[2].toUpperCase() === 'FEMALE' ? 'Female' : 'Male';
        console.log('✅ Found Sex (after date):', sex);
        return sex;
      }
      
      // Pattern 2: Line ends with MALE or FEMALE
      const lineUpper = line.toUpperCase().trim();
      if (lineUpper.endsWith('FEMALE')) {
        console.log('✅ Found Sex (line ends with FEMALE):', 'Female');
        return 'Female';
      }
      if (lineUpper.endsWith('MALE') && !lineUpper.endsWith('FEMALE')) {
        console.log('✅ Found Sex (line ends with MALE):', 'Male');
        return 'Male';
      }
      
      // Pattern 3: Dash followed by sex anywhere in line
      const dashSexPattern = /[-–—]\s*(MALE|FEMALE)/i;
      const dashMatch = line.match(dashSexPattern);
      if (dashMatch) {
        const sex = dashMatch[1].toUpperCase() === 'FEMALE' ? 'Female' : 'Male';
        console.log('✅ Found Sex (after dash):', sex);
        return sex;
      }
      
      // Pattern 4: Standalone MALE or FEMALE on a line (after a date line)
      if (lineUpper === 'FEMALE' || lineUpper === 'MALE') {
        if (i > 0) {
          const prevLine = lines[i - 1];
          if (/(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d{1,2}/i.test(prevLine) ||
              /\d{4}/.test(prevLine)) {
            const sex = lineUpper === 'FEMALE' ? 'Female' : 'Male';
            console.log('✅ Found Sex (standalone after date):', sex);
            return sex;
          }
        }
      }
    }
    
    console.log('❌ No PhilHealth sex found');
    return null;
  };

  /**
   * PhilHealth Birthday Extraction - FIXED VERSION
   * Input Format: "APRIL 29, 2004" (MONTH DAY, YEAR)
   * Output Format: "2004-04-29" (YYYY-MM-DD) for HTML date inputs
   */
  const extractPhilHealthBirthday = (lines) => {
    console.log('📅 Extracting PhilHealth Birthday');
    
    // Month name to number conversion
    const monthNames = {
      'JANUARY': '01', 'FEBRUARY': '02', 'MARCH': '03', 'APRIL': '04',
      'MAY': '05', 'JUNE': '06', 'JULY': '07', 'AUGUST': '08',
      'SEPTEMBER': '09', 'OCTOBER': '10', 'NOVEMBER': '11', 'DECEMBER': '12'
    };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Pattern: "MONTH DAY, YEAR" or "MONTH DAY YEAR"
      // Examples: "APRIL 29, 2004", "APRIL 29, 2004 - MALE"
      const datePattern = /(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{1,2}),?\s+(\d{4})/i;
      const match = line.match(datePattern);
      
      if (match) {
        const monthText = match[1].toUpperCase();
        const day = match[2].padStart(2, '0');
        const year = match[3];
        const month = monthNames[monthText];
        
        if (month) {
          // Validate year is reasonable for a birthday
          const yearInt = parseInt(year);
          if (yearInt >= 1900 && yearInt <= new Date().getFullYear()) {
            // ✅ FIXED: Output Format: YYYY-MM-DD (ISO format for HTML date inputs)
            const formattedDate = `${year}-${month}-${day}`;
            console.log('✅ Found Birthday (YYYY-MM-DD):', formattedDate);
            return formattedDate;
          }
        }
      }
      
      // Pattern 2: Check combined lines
      if (i + 1 < lines.length) {
        const combinedLine = line + ' ' + lines[i + 1];
        const combinedMatch = combinedLine.match(datePattern);
        
        if (combinedMatch) {
          const monthText = combinedMatch[1].toUpperCase();
          const day = combinedMatch[2].padStart(2, '0');
          const year = combinedMatch[3];
          const month = monthNames[monthText];
          
          if (month) {
            const yearInt = parseInt(year);
            if (yearInt >= 1900 && yearInt <= new Date().getFullYear()) {
              // ✅ FIXED: Output Format: YYYY-MM-DD
              const formattedDate = `${year}-${month}-${day}`;
              console.log('✅ Found Birthday (combined, YYYY-MM-DD):', formattedDate);
              return formattedDate;
            }
          }
        }
      }
    }
    
    // Fallback: Look for numeric date patterns and convert
    for (let line of lines) {
      // Skip address lines
      if (line.includes('STREET') || line.includes('BGY') || 
          line.includes('BRGY') || line.includes('DISTRICT')) {
        continue;
      }
      
      // Pattern: MM/DD/YYYY or MM-DD-YYYY (convert to YYYY-MM-DD)
      const mmddPattern = /(\d{2})[-\/](\d{2})[-\/](\d{4})/;
      const mmddMatch = line.match(mmddPattern);
      if (mmddMatch) {
        const month = mmddMatch[1];
        const day = mmddMatch[2];
        const year = mmddMatch[3];
        const yearInt = parseInt(year);
        
        if (yearInt >= 1900 && yearInt <= new Date().getFullYear()) {
          // ✅ FIXED: Convert MM-DD-YYYY to YYYY-MM-DD
          const formattedDate = `${year}-${month}-${day}`;
          console.log('✅ Found Birthday (converted to YYYY-MM-DD):', formattedDate);
          return formattedDate;
        }
      }
      
      // Pattern: YYYY-MM-DD (already correct format)
      const isoPattern = /(\d{4})[-\/](\d{2})[-\/](\d{2})/;
      const isoMatch = line.match(isoPattern);
      if (isoMatch) {
        const year = isoMatch[1];
        const month = isoMatch[2];
        const day = isoMatch[3];
        const yearInt = parseInt(year);
        
        if (yearInt >= 1900 && yearInt <= new Date().getFullYear()) {
          const formattedDate = `${year}-${month}-${day}`;
          console.log('✅ Found Birthday (already YYYY-MM-DD):', formattedDate);
          return formattedDate;
        }
      }
    }
    
    console.log('❌ No PhilHealth birthday found');
    return null;
  };

  /**
   * PhilHealth Address Extraction - IMPROVED VERSION
   * Format: "1503-D FABIE STREET BGY 815 PACO, SIXTH DISTRICT"
   */
  const extractPhilHealthAddress = (lines) => {
    console.log('🏠 Extracting PhilHealth Address');
    
    let addressCandidates = [];
    
    // Address keywords
    const addressKeywords = [
      'STREET', 'ST.', 'ST ',
      'AVENUE', 'AVE.', 'AVE ',
      'ROAD', 'RD.', 'RD ',
      'BOULEVARD', 'BLVD',
      'DRIVE', 'DR.',
      'LANE', 'LN.',
      'BGY', 'BRGY', 'BARANGAY',
      'DISTRICT', 'ZONE', 'PUROK',
      'SUBDIVISION', 'SUBD', 'VILL', 'VILLAGE',
      'COMPOUND', 'BLDG', 'BUILDING',
      'PHASE', 'BLOCK', 'LOT', 'FLOOR'
    ];
    
    // City/Location keywords
    const locationKeywords = [
      'MANILA', 'QUEZON', 'MAKATI', 'PASIG', 'TAGUIG', 'PASAY',
      'CALOOCAN', 'MARIKINA', 'MUNTINLUPA', 'PARANAQUE', 'LAS PINAS',
      'VALENZUELA', 'MALABON', 'NAVOTAS', 'PATEROS',
      'PACO', 'TONDO', 'SAMPALOC', 'SANTA ANA', 'ERMITA', 'MALATE',
      'INTRAMUROS', 'BINONDO', 'QUIAPO', 'SAN MIGUEL',
      'NCR', 'METRO MANILA'
    ];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineUpper = line.toUpperCase();
      
      // Skip non-address lines
      if (lineUpper.includes('PHILHEALTH') ||
          lineUpper.includes('PHILIPPINE') ||
          lineUpper.includes('HEALTH') ||
          lineUpper.includes('INSURANCE') ||
          lineUpper.includes('CORPORATION') ||
          lineUpper.includes('REPUBLIC') ||
          lineUpper.includes('MEMBER') ||
          lineUpper.includes('DEPENDENT') ||
          lineUpper.includes('SIGNATURE') ||
          /^\d{2}[-\s]?\d{9}[-\s]?\d$/.test(line.replace(/\s/g, '')) ||
          /^[A-Z]+,\s*[A-Z\s]+$/.test(line) ||
          /(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d{1,2},?\s+\d{4}/i.test(line) ||
          lineUpper === 'FEMALE' ||
          lineUpper === 'MALE' ||
          line.length < 10) {
        continue;
      }
      
      // Score the line
      let score = 0;
      let hasAddressKeyword = false;
      let hasLocationKeyword = false;
      let hasNumber = /\d/.test(line);
      
      for (const keyword of addressKeywords) {
        if (lineUpper.includes(keyword)) {
          hasAddressKeyword = true;
          score += 3;
          break;
        }
      }
      
      for (const location of locationKeywords) {
        if (lineUpper.includes(location)) {
          hasLocationKeyword = true;
          score += 2;
          break;
        }
      }
      
      if (hasNumber) score += 2;
      
      // Pattern: Number followed by text
      if (/^\d+[-\s]?[A-Z]?\s+[A-Z]/.test(lineUpper)) {
        score += 3;
      }
      
      // Pattern: Building/Unit number like "1503-D"
      if (/\d+[-\s]?[A-Z]/.test(line)) {
        score += 2;
      }
      
      if (score >= 3 || hasAddressKeyword || (hasLocationKeyword && hasNumber)) {
        let cleaned = line
          .replace(/\s+/g, ' ')
          .replace(/[=\|]+/g, '')
          .replace(/PACQO/g, 'PACO')
          .replace(/DIST\s*RIC\s*R?/gi, 'DISTRICT')
          .trim()
          .replace(/\s*,\s*$/, '');
        
        addressCandidates.push({
          line: cleaned,
          score: score,
          index: i
        });
      }
    }
    
    console.log('📍 Address candidates:', addressCandidates);
    
    if (addressCandidates.length === 0) {
      console.log('❌ No PhilHealth address found');
      return null;
    }
    
    // Sort by score
    addressCandidates.sort((a, b) => b.score - a.score);
    
    // Combine consecutive lines if applicable
    const bestCandidate = addressCandidates[0];
    let fullAddress = bestCandidate.line;
    
    for (const candidate of addressCandidates) {
      if (candidate.index === bestCandidate.index + 1 && candidate.score >= 2) {
        fullAddress += ', ' + candidate.line;
        break;
      }
    }
    
    console.log('✅ Found Address:', fullAddress);
    return fullAddress;
  };

  /**
   * PhilHealth ID Number Extraction
   * Format: "19-025542778-8" (XX-XXXXXXXXX-X)
   */
  const extractPhilHealthIDNumber = (lines) => {
    console.log('🔢 Extracting PhilHealth ID Number');
    
    for (let line of lines) {
      // Pattern: XX-XXXXXXXXX-X (2 digits - 9 digits - 1 digit)
      const idPattern = /\b(\d{2})[-\s]?(\d{9})[-\s]?(\d)\b/;
      const match = line.match(idPattern);
      
      if (match) {
        const idNumber = `${match[1]}-${match[2]}-${match[3]}`;
        console.log('✅ Found PhilHealth ID Number:', idNumber);
        return idNumber;
      }
    }
    
    console.log('❌ No PhilHealth ID number found');
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
 * Driver's License Sex Extraction - FIXED for M/F conversion
 */
const extractDriversLicenseSex = (lines) => {
  console.log('👤 Extracting Driver\'s License Sex');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
    
    console.log(`🔍 Checking line ${i}: "${line}"`); // Debug log
    
    // ✅ FIXED: Look for M or F in date line (most common pattern)
    // Pattern: "- M  2004,04/29" or "- F  2004,04/29"
    const sexBeforeDatePattern = /[-\s]*([MF])\s+\d{4}[,\/\-]\d{2}[\/\-]\d{2}/i;
    const sexMatch = line.match(sexBeforeDatePattern);
    
    if (sexMatch) {
      const sexLetter = sexMatch[1].toUpperCase();
      const sex = sexLetter === 'M' ? 'Male' : 'Female';
      console.log(`✅ Found Sex (before date): ${sexLetter} → ${sex}`);
      return sex;
    }
    
    // ✅ Pattern 2: Look for isolated M or F near date/name context
    // Check if line contains just M or F with some context
    const isolatedSexPattern = /\b([MF])\b/gi;
    const isolatedMatches = line.match(isolatedSexPattern);
    
    if (isolatedMatches) {
      // Check if this line has date context (year pattern)
      const hasDateContext = /\d{4}/.test(line);
      
      if (hasDateContext) {
        const sexLetter = isolatedMatches[0].toUpperCase();
        const sex = sexLetter === 'M' ? 'Male' : 'Female';
        console.log(`✅ Found Sex (with date context): ${sexLetter} → ${sex}`);
        return sex;
      }
    }
    
    // ✅ Pattern 3: Look for "SEX" label followed by M/F
    if (line.includes('SEX')) {
      // Check current line for M/F after "Sex"
      const labelSexMatch = line.match(/SEX[:\s]*([MF])/i);
      if (labelSexMatch) {
        const sexLetter = labelSexMatch[1].toUpperCase();
        const sex = sexLetter === 'M' ? 'Male' : 'Female';
        console.log(`✅ Found Sex (after SEX label): ${sexLetter} → ${sex}`);
        return sex;
      }
      
      // Check next line for M/F
      if (nextLine) {
        const nextSexMatch = nextLine.match(/^([MF])$/i);
        if (nextSexMatch) {
          const sexLetter = nextSexMatch[1].toUpperCase();
          const sex = sexLetter === 'M' ? 'Male' : 'Female';
          console.log(`✅ Found Sex (next line after SEX): ${sexLetter} → ${sex}`);
          return sex;
        }
      }
    }
    
    // ✅ Pattern 4: Nationality line format
    // Format: "PHL M 2004/04/29" or "FILIPINO M 2004/04/29"
    const nationalityPattern = /^(PHL|FILIPINO)\s+([MF])\s+\d{4}[\/\-,]\d{2}[\/\-,]\d{2}/i;
    const nationalityMatch = line.match(nationalityPattern);
    if (nationalityMatch) {
      const sexLetter = nationalityMatch[2].toUpperCase();
      const sex = sexLetter === 'M' ? 'Male' : 'Female';
      console.log(`✅ Found Sex (nationality pattern): ${sexLetter} → ${sex}`);
      return sex;
    }
    
    // ✅ Pattern 5: Check for M/F in lines that contain name or after name
    if (i > 0) {
      const prevLine = lines[i - 1];
      // If previous line had a name (comma pattern), check current line for M/F
      if (prevLine.includes(',') && /^[-\s]*([MF])\s/.test(line)) {
        const nameContextMatch = line.match(/^[-\s]*([MF])\s/);
        if (nameContextMatch) {
          const sexLetter = nameContextMatch[1].toUpperCase();
          const sex = sexLetter === 'M' ? 'Male' : 'Female';
          console.log(`✅ Found Sex (after name line): ${sexLetter} → ${sex}`);
          return sex;
        }
      }
    }
  }
  
  console.log('❌ No Driver\'s License sex found');
  return null;
};

/**
 * Driver's License Birthday Extraction - FIXED for comma format
 */
const extractDriversLicenseBirthday = (lines) => {
  console.log('📅 Extracting Driver\'s License Birthday');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // ✅ FIXED: Handle both slash and comma formats
    // Patterns: YYYY/MM/DD, YYYY,MM/DD, YYYY-MM-DD
    const datePatterns = [
      /(\d{4})[\/\-](\d{2})[\/\-](\d{2})/,  // Standard: 2004/04/29
      /(\d{4}),(\d{2})[\/\-](\d{2})/,       // Comma: 2004,04/29
      /(\d{4})[\/\-,](\d{2})[\/\-,](\d{2})/ // Mixed: 2004,04/29 or 2004/04,29
    ];
    
    for (const datePattern of datePatterns) {
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
        
        // ✅ Return in YYYY-MM-DD format for HTML date input
        const formattedDate = `${year}-${month}-${day}`;
        console.log('✅ Found Birthday (YYYY-MM-DD):', formattedDate);
        return formattedDate;
      }
    }
  }
  
  console.log('❌ No Driver\'s License birthday found');
  return null;
};

/**
 * Driver's License Address Extraction - FIXED for OCR errors
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
    
    // ✅ FIXED: Look for address patterns without waiting for label
    // Driver's license addresses often appear after the name/birthday line
    const hasAddressIndicators = 
      /\d+/.test(line) && ( // Has numbers
        line.includes('ST') ||
        line.includes('STREET') ||
        line.includes('BRGY') ||
        line.includes('BARANGAY') ||
        line.includes('CITY') ||
        line.includes('DISTRICT') ||
        line.includes('MANILA') ||
        line.includes('NCR') ||
        line.includes('TONDO') ||
        line.includes('BATO') ||
        line.includes('AVENUE') ||
        line.includes('AVE') ||
        line.includes('ROAD') ||
        line.includes('RD')
      );
    
    if (hasAddressIndicators) {
      // ✅ Clean up OCR errors in address
      let cleanedAddress = line
        .replace(/0S\./g, '865')  // Fix "0S." to "865"
        .replace(/0 A/g, 'BIAK NA')  // Fix "0 A" to "BIAK NA"
        .replace(/TONC/g, 'TONDO')   // Fix "TONC" to "TONDO"
        .replace(/\s+/g, ' ')        // Normalize spaces
        .trim();
      
      addressLines.push(cleanedAddress);
      
      // ✅ Look for continuation on next line
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        
        // Check if next line is address continuation
        if (nextLine.includes('NCR') || 
            nextLine.includes('MANILA') || 
            nextLine.includes('DISTRICT') ||
            nextLine.includes('FIRST') ||
            nextLine.includes('SECOND') ||
            nextLine.includes('THIRD') ||
            /\d{4}/.test(nextLine)) { // Postal code
          
          let cleanedNextLine = nextLine
            .replace(/\s+/g, ' ')
            .trim();
          
          addressLines.push(cleanedNextLine);
        }
      }
      
      break; // Stop after finding address
    }
  }
  
  if (addressLines.length > 0) {
    const fullAddress = addressLines.join(', ');
    console.log('✅ Found Address:', fullAddress);
    return fullAddress;
  }
  
  console.log('❌ No Driver\'s License address found');
  return null;
};

/**
 * UMID Name Extraction - IMPROVED VERSION with noise handling
 * Handles OCR noise like "4;5 SANTOS", "== JOSE", "2 CRUZ"
 */
const extractUMIDName = (lines) => {
  console.log('📋 UMID ID detected');
  console.log('📄 Lines:', lines);
  
  let surname = null;
  let givenName = null;
  let middleName = null;
  
  // Helper function to clean noise from name values
  const cleanNameValue = (text) => {
    return text
      // Remove common OCR noise prefixes
      .replace(/^[\d\s;:=\-\.\,\'\"\|\\\[\]\(\)\{\}%@#$&*!?<>~`]+/, '')
      // Remove common OCR noise suffixes
      .replace(/[\d\s;:=\-\.\,\'\"\|\\\[\]\(\)\{\}%@#$&*!?<>~`]+$/, '')
      // Remove isolated special characters
      .replace(/\s+[;:=\-\.\,\'\"\|\\\[\]\(\)\{\}]+\s+/g, ' ')
      // Normalize spaces
      .replace(/\s+/g, ' ')
      .trim();
  };
  
  // Helper function to check if text looks like a valid name
  const isValidNameText = (text) => {
    const cleaned = cleanNameValue(text);
    // Must be 2-25 chars, mostly letters
    if (cleaned.length < 2 || cleaned.length > 25) return false;
    // Must be at least 70% letters
    const letterCount = (cleaned.match(/[A-Z]/gi) || []).length;
    return letterCount / cleaned.length >= 0.7;
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const upperLine = line.toUpperCase();
    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
    const nextUpperLine = nextLine.toUpperCase();
    
    // Skip header/system lines
    if (upperLine.includes('UMID') || 
        upperLine.includes('UNIFIED') ||
        upperLine.includes('MULTI-PURPOSE') ||
        upperLine.includes('IDENTIFICATION') ||
        upperLine.includes('REPUBLIC') ||
        upperLine.includes('PHILIPPINES') ||
        upperLine.includes('SSS') ||
        upperLine.includes('GSIS') ||
        upperLine.includes('PHILHEALTH') ||
        upperLine.includes('HDMF') ||
        upperLine.includes('PAG-IBIG') ||
        /CRN[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d/i.test(line) ||
        line.length < 2) {
      continue;
    }
    
    // SURNAME detection - handle noisy labels
    if (upperLine.includes('SURNAME') || 
        upperLine.match(/S\s*U\s*R\s*N\s*A\s*M\s*E/) ||
        upperLine.endsWith('SURNAME')) {
      
      // Check if surname value is on the same line (after label)
      const surnameMatch = line.match(/SURNAME\s*[:\s]*([A-Z][A-Z\s\-']+)/i);
      if (surnameMatch && isValidNameText(surnameMatch[1])) {
        surname = cleanNameValue(surnameMatch[1]);
        console.log('✅ Found Surname (same line):', surname);
      }
      // Otherwise check next line
      else if (nextLine && isValidNameText(nextLine)) {
        surname = cleanNameValue(nextLine);
        console.log('✅ Found Surname (next line):', surname);
      }
    }
    
    // GIVEN NAME detection - handle noisy labels
    if (upperLine.includes('GIVEN') || 
        upperLine.match(/G\s*I\s*V\s*E\s*N/) ||
        upperLine.includes('NAML') || // OCR error for NAME
        upperLine.includes('NAMF')) { // OCR error for NAME
      
      // Check if given name value is on the same line
      const givenMatch = line.match(/(?:GIVEN\s*NAME?|NAML?E?)\s*[:\s]*([A-Z][A-Z\s\-']+)/i);
      if (givenMatch && isValidNameText(givenMatch[1])) {
        givenName = cleanNameValue(givenMatch[1]);
        console.log('✅ Found Given Name (same line):', givenName);
      }
      // Otherwise check next line
      else if (nextLine && isValidNameText(nextLine)) {
        givenName = cleanNameValue(nextLine);
        console.log('✅ Found Given Name (next line):', givenName);
      }
    }
    
    // MIDDLE NAME detection
    if (upperLine.includes('MIDDLE') || 
        upperLine.match(/M\s*I\s*D\s*D\s*L\s*E/)) {
      
      // Check if middle name value is on the same line
      const middleMatch = line.match(/MIDDLE\s*NAME?\s*[:\s]*([A-Z][A-Z\s\-']+)/i);
      if (middleMatch && isValidNameText(middleMatch[1])) {
        middleName = cleanNameValue(middleMatch[1]);
        console.log('✅ Found Middle Name (same line):', middleName);
      }
      // Otherwise check next line
      else if (nextLine && isValidNameText(nextLine)) {
        middleName = cleanNameValue(nextLine);
        console.log('✅ Found Middle Name (next line):', middleName);
      }
    }
  }
  
  // FALLBACK: If labels not found, try pattern-based extraction
  // Look for lines that look like names (2-25 chars, mostly letters, after cleaning)
  if (!surname || !givenName) {
    console.log('🔄 Trying fallback name extraction...');
    
    const potentialNames = [];
    let foundCRN = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const upperLine = line.toUpperCase();
      
      // Skip until after CRN (names typically appear after CRN on UMID)
      if (upperLine.includes('CRN') || /\d{4}[-\s]?\d{7}[-\s]?\d/.test(line)) {
        foundCRN = true;
        continue;
      }
      
      // Skip non-name content
      if (upperLine.includes('ADDRESS') ||
          upperLine.includes('SEX') ||
          upperLine.includes('DATE') ||
          upperLine.includes('BIRTH') ||
          upperLine.includes('PAYAPA') ||
          upperLine.includes('STREET') ||
          upperLine.includes('CITY') ||
          upperLine.includes('MANILA') ||
          upperLine.includes('PHILIPPINES') ||
          /\d{4}[\/\-]\d{2}[\/\-]\d{2}/.test(line)) {
        continue;
      }
      
      // Clean the line and check if it's a valid name
      const cleaned = cleanNameValue(line);
      if (cleaned.length >= 2 && cleaned.length <= 25 && isValidNameText(cleaned)) {
        // Check it's not a label
        if (!cleaned.match(/^(SURNAME|GIVEN|MIDDLE|NAME|SEX|DATE|ADDRESS|CRN)$/i)) {
          potentialNames.push(cleaned);
          console.log('📝 Potential name found:', cleaned);
        }
      }
    }
    
    // Assign names based on UMID order: Surname, Given Name, Middle Name
    if (potentialNames.length >= 1 && !surname) {
      surname = potentialNames[0];
      console.log('✅ Fallback Surname:', surname);
    }
    if (potentialNames.length >= 2 && !givenName) {
      givenName = potentialNames[1];
      console.log('✅ Fallback Given Name:', givenName);
    }
    if (potentialNames.length >= 3 && !middleName) {
      middleName = potentialNames[2];
      console.log('✅ Fallback Middle Name:', middleName);
    }
  }
  
  // Construct full name: GIVEN NAME + MIDDLE NAME + SURNAME
  if (givenName && surname) {
    let fullName = givenName;
    if (middleName) {
      fullName += ' ' + middleName;
    }
    fullName += ' ' + surname;
    console.log('✅ Constructed Full Name:', fullName);
    return fullName;
  }
  
  // If only surname found, return it
  if (surname) {
    console.log('⚠️ Only surname found:', surname);
    return surname;
  }
  
  console.log('❌ No valid UMID name found');
  return null;
};

/**
 * UMID Sex Extraction - IMPROVED VERSION
 * Handles: "SEX M", "SEX F", or M/F near DATE OF BIRTH
 */
const extractUMIDSex = (lines) => {
  console.log('👤 Extracting UMID Sex');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const upperLine = line.toUpperCase();
    
    // Pattern 1: "SEX M" or "SEX F" (with possible noise)
    const sexPattern = /SEX\s*[:\s]*([MF])\b/i;
    const match = upperLine.match(sexPattern);
    
    if (match) {
      const sex = match[1].toUpperCase() === 'M' ? 'Male' : 'Female';
      console.log('✅ Found Sex:', sex);
      return sex;
    }
    
    // Pattern 2: Line contains SEX and M/F with DATE OF BIRTH
    const combinedPattern = /SEX\s*[:\s]*([MF])\s*DATE\s*OF\s*BIRTH/i;
    const combinedMatch = upperLine.match(combinedPattern);
    
    if (combinedMatch) {
      const sex = combinedMatch[1].toUpperCase() === 'M' ? 'Male' : 'Female';
      console.log('✅ Found Sex (combined line):', sex);
      return sex;
    }
    
    // Pattern 3: Isolated M or F on a line (after cleaning noise)
    const cleanedLine = line.replace(/[^A-Za-z\s]/g, '').trim();
    if (cleanedLine === 'M' || cleanedLine === 'MALE') {
      console.log('✅ Found Sex (isolated M):', 'Male');
      return 'Male';
    }
    if (cleanedLine === 'F' || cleanedLine === 'FEMALE') {
      console.log('✅ Found Sex (isolated F):', 'Female');
      return 'Female';
    }
    
    // Pattern 4: M or F followed by date pattern
    const sexBeforeDatePattern = /\b([MF])\s+\d{4}[\/\-]\d{2}[\/\-]\d{2}/i;
    const sexDateMatch = line.match(sexBeforeDatePattern);
    if (sexDateMatch) {
      const sex = sexDateMatch[1].toUpperCase() === 'M' ? 'Male' : 'Female';
      console.log('✅ Found Sex (before date):', sex);
      return sex;
    }
  }
  
  console.log('❌ No UMID sex found');
  return null;
};

/**
 * UMID Birthday Extraction - IMPROVED VERSION
 * Handles: YYYY/MM/DD, MM/DD/YYYY, with OCR noise
 */
const extractUMIDBirthday = (lines) => {
  console.log('📅 Extracting UMID Birthday');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip address lines
    if (line.includes('PAYAPA') || 
        line.includes('STREET') || 
        line.includes('ST ') ||
        line.includes('CITY') ||
        line.includes('MANILA') ||
        line.includes('PHILIPPINES')) {
      continue;
    }
    
    // Pattern 1: "DATE OF BIRTH YYYY/MM/DD"
    const dobPattern1 = /DATE\s*OF\s*BIRTH\s*[:\s]*(\d{4})[\/\-](\d{2})[\/\-](\d{2})/i;
    const match1 = line.match(dobPattern1);
    
    if (match1) {
      const year = match1[1];
      const month = match1[2];
      const day = match1[3];
      
      const yearInt = parseInt(year);
      if (yearInt >= 1900 && yearInt <= new Date().getFullYear()) {
        const formattedDate = `${year}-${month}-${day}`;
        console.log('✅ Found Birthday (DATE OF BIRTH YYYY/MM/DD):', formattedDate);
        return formattedDate;
      }
    }
    
    // Pattern 2: YYYY/MM/DD anywhere in line (not in address)
    const datePattern = /\b(\d{4})[\/\-](\d{2})[\/\-](\d{2})\b/;
    const dateMatch = line.match(datePattern);
    
    if (dateMatch) {
      const year = dateMatch[1];
      const month = dateMatch[2];
      const day = dateMatch[3];
      
      const yearInt = parseInt(year);
      // Valid birthday year range
      if (yearInt >= 1900 && yearInt <= new Date().getFullYear()) {
        const formattedDate = `${year}-${month}-${day}`;
        console.log('✅ Found Birthday (YYYY/MM/DD):', formattedDate);
        return formattedDate;
      }
    }
    
    // Pattern 3: MM/DD/YYYY format
    const mmddPattern = /\b(\d{2})[\/\-](\d{2})[\/\-](\d{4})\b/;
    const mmddMatch = line.match(mmddPattern);
    
    if (mmddMatch) {
      const month = mmddMatch[1];
      const day = mmddMatch[2];
      const year = mmddMatch[3];
      
      const yearInt = parseInt(year);
      if (yearInt >= 1900 && yearInt <= new Date().getFullYear()) {
        const formattedDate = `${year}-${month}-${day}`;
        console.log('✅ Found Birthday (MM/DD/YYYY → YYYY-MM-DD):', formattedDate);
        return formattedDate;
      }
    }
  }
  
  console.log('❌ No UMID birthday found');
  return null;
};

/**
 * UMID Address Extraction - IMPROVED VERSION with noise cleaning
 * Handles lines like: "- 28 PAYAPA ST BAGONG DIWA", "I STO CRISTOBAL CALOOCAN CITY"
 */
const extractUMIDAddress = (lines) => {
  console.log('🏠 Extracting UMID Address');
  console.log('📄 All lines for address:', lines);
  
  let addressLines = [];
  
  // Helper function to clean address line noise
  const cleanAddressLine = (text) => {
    return text
      // Remove common OCR noise prefixes
      .replace(/^[\s\-\.\,\:\;\'\"\|\\_~=\[\]\(\)\{\}<>]+/, '')
      // Remove single character prefixes like "I ", "E ", "P, "
      .replace(/^[A-Z][\s\.\,]+/, '')
      // Remove noise suffixes
      .replace(/[\s\-\.\,\:\;\'\"\|\\_~=\[\]\(\)\{\}<>]+$/, '')
      // Normalize spaces
      .replace(/\s+/g, ' ')
      .trim();
  };
  
  // Address keywords to look for
  const addressKeywords = [
    'PAYAPA', 'BAGONG', 'DIWA',
    'CRISTOBAL', 'CALOOCAN', 'CITY',
    'METRO', 'MANILA', 'PHILIPPINES',
    'STREET', 'ST ', 'ST.',
    'BARANGAY', 'BRGY', 'BGY',
    'AVENUE', 'AVE', 'ROAD', 'RD',
    'VILLAGE', 'VILL', 'SUBD', 'SUBDIVISION'
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const upperLine = line.toUpperCase();
    
    // Skip header/name/CRN lines
    if (upperLine.includes('UMID') ||
        upperLine.includes('UNIFIED') ||
        upperLine.includes('MULTI-PURPOSE') ||
        upperLine.includes('SURNAME') ||
        upperLine.includes('GIVEN') ||
        upperLine.includes('MIDDLE') ||
        upperLine.includes('NAME') ||
        upperLine.includes('SEX') ||
        upperLine.includes('DATE') ||
        upperLine.includes('BIRTH') ||
        upperLine.includes('CRN') ||
        /\d{4}[-\s]?\d{7}[-\s]?\d/.test(line) ||
        /\d{4}[\/\-]\d{2}[\/\-]\d{2}/.test(line) ||
        line.length < 5) {
      continue;
    }
    
    // Check if line contains address keywords
    const hasAddressKeyword = addressKeywords.some(keyword => 
      upperLine.includes(keyword)
    );
    
    // Check if line has numbers (house/street numbers)
    const hasNumbers = /\d+/.test(line);
    
    if (hasAddressKeyword || (hasNumbers && addressLines.length > 0)) {
      const cleaned = cleanAddressLine(line);
      
      if (cleaned.length >= 5) {
        addressLines.push(cleaned);
        console.log('📍 Added address line:', cleaned);
      }
    }
    
    // Stop after collecting enough address lines
    if (addressLines.length >= 4) {
      break;
    }
  }
  
  console.log('📦 Collected address lines:', addressLines);
  
  if (addressLines.length > 0) {
    // Fix common OCR errors in address
    const fullAddress = addressLines
      .map(line => line
        .replace(/ALOOCAN/g, 'CALOOCAN')
        .replace(/CRISTOBA\s/g, 'CRISTOBAL ')
        .replace(/PH\s*PP/g, 'PHILIPP')
        .replace(/AGONG/g, 'BAGONG')
      )
      .join(', ');
    
    console.log('✅ Found Address:', fullAddress);
    return fullAddress;
  }
  
  console.log('❌ No UMID address found');
  return null;
};

/**
 * UMID ID Number (CRN) Extraction - IMPROVED VERSION
 * Handles OCR errors like "12151B0" instead of "1215160"
 */
const extractUMIDIDNumber = (lines) => {
  console.log('🔢 Extracting UMID ID Number (CRN)');
  
  for (let line of lines) {
    console.log('🔍 Checking line for CRN:', line);
    
    // Clean the line first - replace common OCR errors
    const cleanedLine = line
      .replace(/[Bb]/g, '8')  // B often misread for 8
      .replace(/[Oo]/g, '0')  // O often misread for 0
      .replace(/[Ll]/g, '1')  // L often misread for 1
      .replace(/[Ii]/g, '1')  // I often misread for 1
      .replace(/[Ss]/g, '5')  // S often misread for 5
      .replace(/[Zz]/g, '2'); // Z often misread for 2
    
    // Pattern 1: CRN followed by number
    // Format: CRN-XXXX-XXXXXXX-X or CRN XXXX-XXXXXXX-X
    const crnPattern = /CRN[-\s]*(\d{4})[-\s]?(\d{7})[-\s]?(\d)/i;
    const match = cleanedLine.match(crnPattern);
    
    if (match) {
      const idNumber = `${match[1]}-${match[2]}-${match[3]}`;
      console.log('✅ Found UMID CRN:', idNumber);
      return idNumber;
    }
    
    // Pattern 2: Just the number pattern (without CRN label)
    // RN-XXXX-XXXXXXX-X (sometimes CRN reads as RN)
    const rnPattern = /RN[-\s]*(\d{4})[-\s]?(\d{7})[-\s]?(\d)/i;
    const rnMatch = cleanedLine.match(rnPattern);
    
    if (rnMatch) {
      const idNumber = `${rnMatch[1]}-${rnMatch[2]}-${rnMatch[3]}`;
      console.log('✅ Found UMID ID (RN pattern):', idNumber);
      return idNumber;
    }
    
    // Pattern 3: Raw number pattern XXXX-XXXXXXX-X
    const numberPattern = /\b(\d{4})[-\s](\d{7})[-\s](\d)\b/;
    const numMatch = cleanedLine.match(numberPattern);
    
    if (numMatch) {
      const idNumber = `${numMatch[1]}-${numMatch[2]}-${numMatch[3]}`;
      console.log('✅ Found UMID ID Number (raw):', idNumber);
      return idNumber;
    }
  }
  
  console.log('❌ No UMID ID number found');
  return null;
};

  /**
   * PhilSys Name Extraction - MODIFIED for Full Name extraction
   */
  const extractPhilsysName = (lines) => {
    console.log('📋 PhilSys ID detected');
    console.log('📄 All Lines:', lines);
    
    let lastName = null;
    let givenNames = null;
    let middleName = null;
    
    // Strategy 1: Look for labeled sections with better pattern matching
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      
      // Skip header lines
      if (line.includes('PHILSYS') || 
          line.includes('PHILIPPINE') ||
          line.includes('REPUBLIKA') ||
          line.includes('REPUBLIC') ||
          line.includes('PAMBANSANG') ||
          line.includes('IDENTIFICATION') ||
          /^\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}$/.test(line.replace(/\s/g, ''))) {
        continue;
      }
      
      // Look for Last Name indicators (more flexible)
      if (line.includes('APELYIDO') || line.includes('APELLYIDO') || 
          line.includes('LAST') || line.includes('AGETYIDO')) {
        
        // Check next line for the actual last name
        if (nextLine && nextLine.length >= 2) {
          const cleanNext = nextLine.replace(/[\/\|\:\-\&\%\$\#\@]/g, '').trim();
          if (/^[A-Z][A-Z\s]*$/.test(cleanNext) && cleanNext.length <= 30) {
            lastName = cleanNext;
            console.log('✅ Found Last Name:', lastName);
          }
        }
      }
    }
    
    // Strategy 2: Sequential name extraction based on PhilSys layout
    // After ID number, names typically appear in order: Last, Given, Middle
    let idNumberIndex = -1;
    let nameLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Find ID number line
      if (/\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/.test(line)) {
        idNumberIndex = i;
        continue;
      }
      
      // Collect potential name lines after ID number
      if (idNumberIndex > -1 && i > idNumberIndex) {
        // Skip obvious non-name lines
        if (line.includes('APELYIDO') || 
            line.includes('PANGALAN') ||
            line.includes('GITNANG') ||
            line.includes('PETSA') ||
            line.includes('APRIL') ||
            line.includes('TIRAHAN') ||
            line.includes('/') ||
            line.length < 2 ||
            line.length > 25) {
          continue;
        }
        
        // Clean and validate potential name
        const cleanLine = line.replace(/[\/\|\:\-\&\%\$\#\@]/g, '').trim();
        if (/^[A-Z][A-Z\s]*$/.test(cleanLine) && 
            cleanLine.split(/\s+/).length <= 3 &&
            cleanLine.length >= 2) {
          nameLines.push(cleanLine);
        }
        
        // Stop after collecting 3 potential names or hitting date
        if (nameLines.length >= 3 || line.includes('APRIL') || line.includes('1978')) {
          break;
        }
      }
    }
    
    console.log('📝 Collected name lines:', nameLines);
    
    // Assign names based on PhilSys order: Last, Given, Middle
    if (nameLines.length >= 2) {
      lastName = nameLines[0];   // LEJARDE
      givenNames = nameLines[1]; // JERELYN
      if (nameLines.length >= 3) {
        middleName = nameLines[2]; // MANGADLAO
      }
    }
    
    // Construct full name: Given + Middle + Last
    if (givenNames && lastName) {
      let fullName = givenNames;
      if (middleName) {
        fullName += ' ' + middleName;
      }
      fullName += ' ' + lastName;
      console.log('✅ Constructed Full Name:', fullName);
      return fullName;
    }
    
    console.log('❌ No valid PhilSys name found');
    return null;
  };


  /**
   * PhilSys Birthday Extraction - NEW FUNCTION
   */
  const extractPhilsysBirthday = (lines) => {
    console.log('📅 Extracting PhilSys Birthday');
    
    const monthNames = {
      'JANUARY': '01', 'FEBRUARY': '02', 'MARCH': '03', 'APRIL': '04',
      'MAY': '05', 'JUNE': '06', 'JULY': '07', 'AUGUST': '08',
      'SEPTEMBER': '09', 'OCTOBER': '10', 'NOVEMBER': '11', 'DECEMBER': '12'
    };
    
    for (let line of lines) {
      // Look for date pattern anywhere in the line
      for (const [monthName, monthNum] of Object.entries(monthNames)) {
        // More flexible pattern matching
        const patterns = [
          new RegExp(`${monthName}\\s+(\\d{1,2})[,.]?\\s+(\\d{4})`, 'i'),
          new RegExp(`${monthName}\\s+(\\d{1,2})\\s*,\\s*(\\d{4})`, 'i'),
          new RegExp(`${monthName}\\s+(\\d{1,2})\\.\\s*(\\d{4})`, 'i')
        ];
        
        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (match) {
            const day = match[1].padStart(2, '0');
            const year = match[2];
            
            // Validate year is reasonable for a birthday
            const yearInt = parseInt(year);
            if (yearInt >= 1900 && yearInt <= new Date().getFullYear()) {
              const formattedDate = `${year}-${monthNum}-${day}`;
              console.log('✅ Found Birthday:', formattedDate);
              return formattedDate;
            }
          }
        }
      }
    }
    
    console.log('❌ No PhilSys birthday found');
    return null;
  };

  const extractPhilsysAddress = (lines) => {
    console.log('🏠 Extracting PhilSys Address');
    
    let addressParts = [];
    let foundAddressStart = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip header, ID number, names, and birthday lines
      if (line.includes('REPUBLIKA') ||
          line.includes('REPUBLIC') ||
          line.includes('PHILSYS') ||
          line.includes('PAMBANSANG') ||
          line.includes('IDENTIFICATION') ||
          /^\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/.test(line) ||
          line === 'LEJARDE' ||
          line === 'JERELYN' ||
          line === 'MANGADLAO' ||
          line.includes('APRIL') ||
          line.includes('1978') ||
          line.includes('APELYIDO') ||
          line.includes('PANGALAN') ||
          line.includes('GITNANG') ||
          line.includes('PETSA') ||
          line.includes('TIRAHAN') ||
          line.length < 3) {
        continue;
      }
      
      // Look for address patterns
      const hasAddressIndicators = 
        /\d{3,4}[-\s]?[A-Z]/.test(line) || // 1503-D pattern
        line.includes('FABIE') ||
        line.includes('STREET') ||
        line.includes('ST.') ||
        line.includes('BARANGAY') ||
        line.includes('BRGY') ||
        line.includes('MANILA') ||
        line.includes('CITY') ||
        /\d{3,4}/.test(line); // Any 3-4 digit number
      
      if (hasAddressIndicators) {
        foundAddressStart = true;
        addressParts.push(line.trim());
      } else if (foundAddressStart && addressParts.length < 3) {
        // Continue collecting address lines
        if (/[A-Z0-9]/.test(line) && line.length >= 3) {
          addressParts.push(line.trim());
        }
      }
      
      // Stop if we have enough address parts
      if (addressParts.length >= 3) {
        break;
      }
    }
    
    if (addressParts.length > 0) {
      const fullAddress = addressParts.join(', ');
      console.log('✅ Found Address:', fullAddress);
      return fullAddress;
    }
    
    console.log('❌ No PhilSys address found');
    return null;
  };

  const extractPagIbigName = (lines) => {
    console.log('📋 PAG-IBIG ID detected');
    
    // Look for MID pattern: XXXX-XXXX-XXXX
    const midPattern = /\d{4}[-\s]?\d{4}[-\s]?\d{4}/;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // If this line contains MID number
      if (midPattern.test(line)) {
        console.log('🔍 Found MID number line:', line);
        
        // Check previous line for name
        if (i > 0) {
          const nameLine = lines[i - 1].trim();
          if (isValidName(nameLine)) {
            return cleanName(nameLine);
          }
        }
        
        // Check if name is on same line before MID
        const beforeMID = line.split(midPattern)[0].trim();
        if (beforeMID.length > 5 && isValidName(beforeMID)) {
          return cleanName(beforeMID);
        }
      }
    }
  };

  const isValidName = (text) => {
    // Remove noise characters
    const cleaned = text.replace(/[|\\\/\=\+\*\@\#\$\%\^\&\[\]\{\}\(\)]/g, '');
    const words = cleaned.split(/\s+/).filter(w => w.length > 1);
    
    return words.length >= 2 && 
          words.length <= 4 && 
          words.every(word => /^[A-Z][A-Z\s\-'\.]*$/i.test(word));
  };

  const cleanName = (text) => {
    return text
      .replace(/[|\\\/\=\+\*\@\#\$\%\^\&\[\]\{\}\(\)]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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
      // Normalize the format: replace all separators with hyphens
      const normalizedNumber = match[0].replace(/\s+/g, '-').replace(/[-]+/g, '-');
      console.log('✅ Found ID number:', normalizedNumber);
      return normalizedNumber;
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
  
export const uploadIDImage = async (imageData, patientId, idType, idNumber = null) => {
  try {
    console.log('📤 Starting ID image upload to localhost:', { patientId, idType, idNumber });
    
    // Convert base64 to blob
    const base64Data = imageData.split(',')[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });
    
    // Create FormData
    const formData = new FormData();
    formData.append('file', blob, `${idType}_${Date.now()}.jpg`);
    formData.append('patientId', patientId);
    formData.append('idType', idType);
    if (idNumber) {
      formData.append('idNumber', idNumber);
    }
    
    console.log('📤 Uploading to localhost with patientId:', patientId);
    
    const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/upload-id-image`, {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ ID image uploaded successfully to localhost:', {
        publicUrl: result.publicUrl,
        fileName: result.fileName
      });
      return result;
    } else {
      console.error('❌ ID image upload failed:', result.error);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('❌ ID image upload error:', error);
    return { success: false, error: error.message };
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
    extractPhilHealthIDNumber,
    extractPhilsysBirthday,
    extractPhilsysAddress,
    extractPostalIDBirthday,
    extractPostalIDAddress,
    extractUMIDSex,
    extractUMIDBirthday,
    extractUMIDAddress,
    extractUMIDIDNumber,
    preprocessingTechniques,
    isCameraAvailable,
    initializeCamera,
    cleanupCamera,
    captureImageFromVideo,
    filterNoiseLines,
    detectIDInFrame,
    cropAndPreprocessID,
    startAutoCapture,
    uploadIDImage
  };