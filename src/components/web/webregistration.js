  // webregistration.js
  import React, { useState, useEffect } from 'react';
  import './webregistration.css';
  import sampleID from "../../sampleID.png";
  import clicareLogo from "../../clicareLogo.png";
  import {
    User,
    Bell,
    Clipboard,
    Stethoscope,
    List,
    Calendar,
    CheckCircle,
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    RotateCcw,
    X,
    Check,
    Camera,
    Info,
    Search
  } from 'lucide-react';

  import {
    processIDWithOCR,
    isCameraAvailable,
    initializeCamera,
    cleanupCamera,
    captureImageFromVideo
  } from '../../services/tesseractOCR';

  const WebRegistration = () => {
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [fieldErrors, setFieldErrors] = useState({});
    const [showValidation, setShowValidation] = useState(false);
    const [duplicateChecking, setDuplicateChecking] = useState(false);
    const [duplicateCheckTimer, setDuplicateCheckTimer] = useState(null);

    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [registrationResult, setRegistrationResult] = useState(null);

    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState('success');

    const [showCameraModal, setShowCameraModal] = useState(false);
    const [cameraStream, setCameraStream] = useState(null);
    const [capturedImage, setCapturedImage] = useState(null);
    const [ocrProcessing, setOcrProcessing] = useState(false);
    const [cameraError, setCameraError] = useState('');

    const [timeSlots, setTimeSlots] = useState([]);
    const [relationships, setRelationships] = useState([]);
    const [severityLevels, setSeverityLevels] = useState([]);
    const [durationOptions, setDurationOptions] = useState([]);
    const [outpatientSymptoms, setOutpatientSymptoms] = useState([]);
    const [symptomsLoading, setSymptomsLoading] = useState(true);
    const [categorySearches, setCategorySearches] = useState({});
    const [openCategories, setOpenCategories] = useState({});
    const [selectedIDType, setSelectedIDType] = useState('');
    const [capturedIDImage, setCapturedIDImage] = useState(null);
    const [uploadingIDImage, setUploadingIDImage] = useState(false);

    const ID_TYPES = [
      { value: 'philhealth', label: 'PhilHealth ID' },
      { value: 'drivers_license', label: 'Driver\'s License' },
      { value: 'umid', label: 'UMID' },
      { value: 'philsys', label: 'PhilSys ID' },
      { value: 'pagibig', label: 'PAG-IBIG ID' },
      { value: 'postal', label: 'Postal ID' }
    ];

    const [formData, setFormData] = useState({
      fullName: '', 
      sex: '', 
      birthday: '', 
      age: '', 
      address: '', 
      contactNumber: '',
      email: '', 
      emergencyContactName: '', 
      emergencyContactNumber: '', 
      emergencyRelationship: '',
      selectedSymptoms: [], 
      duration: '', 
      severity: '', 
      previousTreatment: '', 
      allergies: '',
      medications: '', 
      preferredDate: '', 
      appointmentTime: '', 
      idType: '',
      idNumber: ''  // ADD THIS LINE
    });

    useEffect(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const timer = setInterval(() => setCurrentTime(new Date()), 1000);
      return () => clearInterval(timer);
    }, [currentStep]);

    useEffect(() => {
      const fetchFormData = async () => {
        try {
          const [timeSlotsRes, relationshipsRes, severityRes, durationRes] = await Promise.all([
            fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/time-slots`),
            fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/relationships`),
            fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/severity-levels`),
            fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/duration-options`)
          ]);

          const [timeSlotsData, relationshipsData, severityData, durationData] = await Promise.all([
            timeSlotsRes.json(),
            relationshipsRes.json(),
            severityRes.json(),
            durationRes.json()
          ]);

          if (timeSlotsData.success) setTimeSlots(timeSlotsData.data);
          if (relationshipsData.success) setRelationships(relationshipsData.data);
          if (severityData.success) setSeverityLevels(severityData.data);
          if (durationData.success) setDurationOptions(durationData.data);
        } catch (error) {
          console.error('Failed to fetch form data:', error);
        }
      };

      fetchFormData();
    }, []);

    useEffect(() => {
      fetchSymptoms();
    }, []);

    useEffect(() => {
      if (showCameraModal) {
        initializeCameraStream();
      } else {
        cleanupCameraStream();
      }
      return () => cleanupCameraStream();
    }, [showCameraModal]);

    useEffect(() => {
      if (formData.preferredDate && formData.appointmentTime) {
        const availableSlots = generateAvailableTimeSlots(formData.preferredDate);
        const valid = availableSlots.some(slot => slot.value === formData.appointmentTime);
        if (!valid) {
          setFormData(prev => ({ ...prev, appointmentTime: '' }));
        }
      }
    }, [formData.preferredDate]);

    useEffect(() => {
      if (showSuccessModal) {
        const timer = setTimeout(() => {
          handleSuccessModalClose();
        }, 30000);
        return () => clearTimeout(timer);
      }
    }, [showSuccessModal]);

    useEffect(() => {
      return () => {
        if (duplicateCheckTimer) {
          clearTimeout(duplicateCheckTimer);
        }
      };
    }, [duplicateCheckTimer]);

    const fetchSymptoms = async () => {
      try {
        setSymptomsLoading(true);
        const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/symptoms`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.symptoms?.length > 0) {
            setOutpatientSymptoms(result.symptoms);
          } else {
            setError('No symptoms found. Please check your database.');
            setOutpatientSymptoms([]);
          }
        } else {
          throw new Error(`API request failed with status ${response.status}`);
        }
      } catch {
        setError('Failed to load symptoms from server.');
        setOutpatientSymptoms([]);
      } finally {
        setSymptomsLoading(false);
      }
    };

    const formatTime = (date) =>
      date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    
    const formatDate = (date) => {
      return date.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
    };

    const toTitleCase = (str) => str ? str.toLowerCase().replace(/\b\w/g, l => l.toUpperCase()) : '';
    const toLowerCase = (str) => str ? str.toLowerCase() : '';

    const formatPhoneNumber = (value) => {
      const cleaned = value.replace(/\D/g, '').slice(0, 11);
      if (cleaned.length >= 8) return cleaned.replace(/(\d{4})(\d{3})(\d{4})/, '$1-$2-$3');
      if (cleaned.length >= 5) return cleaned.replace(/(\d{4})(\d{1,3})/, '$1-$2');
      return cleaned;
    };

    const cleanPhoneNumber = (value) => value.replace(/\D/g, '');

    const calculateAge = (birthday) => {
      if (!birthday) return '';
      const today = new Date();
      const birthDate = new Date(birthday);
      
      if (birthDate > today) return '';
      
      let years = today.getFullYear() - birthDate.getFullYear();
      let months = today.getMonth() - birthDate.getMonth();
      let days = today.getDate() - birthDate.getDate();
      
      if (days < 0) {
        months--;
        const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
        days += lastMonth.getDate();
      }
      
      if (months < 0) {
        years--;
        months += 12;
      }
    
      if (years > 120) return 'invalid';

      if (years === 0 && months === 0) {
        return days === 1 ? '1 day old' : `${days} days old`;
      } else if (years === 0) {
        return months === 1 ? '1 month old' : `${months} months old`;
      } else {
        return years;
      }
    };

    const getMaxAppointmentDate = () => {
      const maxDate = new Date();
      maxDate.setFullYear(maxDate.getFullYear() + 1);
      return maxDate.toISOString().split('T')[0];
    };

    const getFilteredSymptoms = (category) => {
      const searchTerm = categorySearches[category.category]?.toLowerCase() || '';
      if (!searchTerm) return category.symptoms;
      
      return category.symptoms.filter(symptom =>
        symptom.toLowerCase().includes(searchTerm)
      );
    };

    const getCategorySelectedCount = (category) => {
      return category.symptoms.filter(symptom => 
        formData.selectedSymptoms.includes(symptom)
      ).length;
    };

    const isRoutineCareSymptom = (symptoms) => {
      const routineCareSymptoms = [
        'Annual Check-up',
        'Health Screening', 
        'Vaccination',
        'Physical Exam',
        'Blood Pressure Check',
        'Cholesterol Screening',
        'Diabetes Screening',
        'Cancer Screening'
      ];
      
      return symptoms.some(symptom => routineCareSymptoms.includes(symptom));
    };

    const hasOnlyRoutineCareSymptoms = (symptoms) => {
      if (!symptoms || symptoms.length === 0) return false;
      
      // Get routine care symptoms from the fetched symptoms data
      const routineCareSymptoms = [];
      outpatientSymptoms.forEach(category => {
        category.metadata?.forEach(symptom => {
          if (symptom.is_routine_care) {
            routineCareSymptoms.push(symptom.name);
          }
        });
      });
      
      const symptomsList = Array.isArray(symptoms) ? symptoms : symptoms.split(', ');
      return symptomsList.every(symptom => routineCareSymptoms.includes(symptom.trim()));
    };

    const validateAge = (birthday) => {
      if (!birthday) return 'Date of birth is required';
      const age = calculateAge(birthday);
      if (age === 'invalid') return 'Enter a valid date of birth';
      if (age === '') return 'Date of birth is invalid';
      return null;
    };

    const validatePhoneNumber = (value) => {
      const cleaned = value.replace(/\D/g, '');
      if (!cleaned) return 'Contact number is required';
      if (cleaned.length !== 11) return 'Contact number must be exactly 11 digits';
      if (!cleaned.startsWith('09')) return 'Contact number must start with 09';
      return null;
    };

    const validateEmail = (email) => {
      if (!email) return 'Email address is required';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toLowerCase())) return 'Enter a valid email format';
      return null;
    };

    const validateFullName = (name) => {
      if (!name.trim()) return 'Full name is required';
      const words = name.trim().split(/\s+/);
      if (words.length < 2) return 'Please enter your full name';
      if (/\./.test(name)) return 'Do not use initials (write full middle name instead)';
      return null;
    };

    const validateAddress = (address) => {
      if (!address.trim()) return 'Complete address is required';
      const parts = address.split(' ').map(p => p.trim()).filter(Boolean);
      if (parts.length < 4) return 'Follow the format: House No., Street, Barangay, City, Province';
      return null;
    };

    const validateAppointmentDateTime = (date, time) => {
      if (!date) return 'Appointment date is required';
      if (!time) return 'Appointment time is required';
      
      const selectedDate = new Date(date);
      const today = new Date();
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      
      const isToday = selectedDate.toDateString() === today.toDateString();

      if (selectedDate < today.setHours(0, 0, 0, 0)) {
        return 'Invalid appointment date';
      }
      
      if (selectedDate > oneYearFromNow.setHours(0, 0, 0, 0)) {
        return 'Invalid appointment date';
      }
      
      if (isToday) {
        const currentHour = new Date().getHours();
        
        if (time === 'morning' && currentHour >= 12) {
          return 'Morning time slot is no longer available today';
        }
        if (time === 'afternoon' && currentHour >= 17) {
          return 'Afternoon time slot is no longer available today';
        }
        if (time === 'evening' && currentHour >= 20) {
          return 'Evening time slot is no longer available today';
        }
      }
      
      return null;
    };

    const validateStep = (step) => {
      switch (step) {
        case 1:
          return (
            validateFullName(formData.fullName) === null &&
            formData.sex &&
            formData.birthday &&
            validateAddress(formData.address) === null &&
            validatePhoneNumber(formData.contactNumber) === null &&
            validateEmail(formData.email) === null &&
            !fieldErrors.contactNumber &&
            !fieldErrors.email &&
            !duplicateChecking
          );
        case 2:
          return (
            validateFullName(formData.emergencyContactName) === null &&
            validatePhoneNumber(formData.emergencyContactNumber) === null &&
            formData.emergencyRelationship &&
            formData.emergencyContactNumber !== formData.contactNumber &&
            !fieldErrors.emergencyContactNumber
          );
        case 3:
          return (
            formData.fullName &&
            formData.sex &&
            formData.birthday &&
            formData.address &&
            formData.contactNumber &&
            formData.email &&
            formData.emergencyContactName &&
            formData.emergencyContactNumber &&
            formData.emergencyRelationship &&
            termsAccepted &&
            !fieldErrors.contactNumber &&
            !fieldErrors.email &&
            !fieldErrors.emergencyContactNumber
          );
        case 4:
          return formData.selectedSymptoms.length > 0;
        case 5:
          if (hasOnlyRoutineCareSymptoms(formData.selectedSymptoms)) {
            return true;
          }
          return formData.duration && formData.severity;
        case 6:
          return formData.preferredDate && formData.appointmentTime;
        case 7:
          const hasRoutineOnly = hasOnlyRoutineCareSymptoms(formData.selectedSymptoms);
          return (
            formData.fullName &&
            formData.selectedSymptoms.length > 0 &&
            validatePhoneNumber(formData.contactNumber) === null &&
            validatePhoneNumber(formData.emergencyContactNumber) === null &&
            validateEmail(formData.email) === null &&
            (hasRoutineOnly || (formData.duration && formData.severity)) &&
            formData.preferredDate &&
            formData.appointmentTime &&
            termsAccepted &&
            !fieldErrors.contactNumber &&
            !fieldErrors.email &&
            !fieldErrors.emergencyContactNumber
          );
          default:
          return true;
      }
    };

    const checkDuplicateUser = async (email, contactNumber) => {
      if (!email && !contactNumber) return null;
      
      try {
        setDuplicateChecking(true);
        
        const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/check-duplicate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            email: email ? email.toLowerCase() : undefined,
            contact_no: contactNumber ? cleanPhoneNumber(contactNumber) : undefined
          })
        });

        const result = await response.json();
        
        if (!response.ok) {
          return null;
        }

        return result;
        
      } catch (error) {
        return null; 
      } finally {
        setDuplicateChecking(false);
      }
    };

    const handleInputChange = (e) => {
      const { name, value } = e.target;
      let processedValue = value;

      if (name === 'preferredDate') {
        if (value && value.length === 10) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            setError('Invalid date format');
          } else {
            const selectedDate = new Date(value);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const oneYearFromNow = new Date();
            oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
            oneYearFromNow.setHours(0, 0, 0, 0);
            
            if (selectedDate < today) {
              setError('Invalid appointment date');
            } else if (selectedDate > oneYearFromNow) {
              setError('Invalid appointment date');
            } else {
              setError('');
            }
          }
        } else {
          setError('');
        }

        if (formData.preferredDate !== value && formData.appointmentTime) {
          setFormData(prev => ({ 
            ...prev, 
            [name]: processedValue,
            appointmentTime: ''
          }));
          return;
        }
          
      } else if (['fullName', 'emergencyContactName', 'address'].includes(name)) {
        processedValue = toTitleCase(value);
      } else if (name === 'email') {
        processedValue = toLowerCase(value);
      } else if (['contactNumber', 'emergencyContactNumber'].includes(name)) {
        processedValue = formatPhoneNumber(value);
      }

      if (showValidation) {
        setShowValidation(false);
        
        const duplicateErrorFields = ['contactNumber', 'email'];
        const preservedErrors = {};
        
        duplicateErrorFields.forEach(field => {
          if (fieldErrors[field] && 
              (fieldErrors[field].includes('already registered') || 
              fieldErrors[field].includes('duplicate') ||
              fieldErrors[field].includes('already exists') ||
              fieldErrors[field].includes('already in use'))) {
            preservedErrors[field] = fieldErrors[field];
          }
        });
        
        setFieldErrors(preservedErrors);
        setError('');
      }

      if (fieldErrors[name] && 
          (fieldErrors[name].includes('already registered') || 
          fieldErrors[name].includes('duplicate') ||
          fieldErrors[name].includes('already exists') ||
          fieldErrors[name].includes('already in use'))) {
        setFieldErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[name];
          return newErrors;
        });
      }

      setFormData(prev => {
        const updated = { ...prev, [name]: processedValue };

        if (name === 'birthday') {
          updated.age = calculateAge(processedValue);
        }

        return updated;
      });

      if (!error.includes('contact details') && !error.includes('already registered')) {
        setError('');
      }

      if (name === 'email' || name === 'contactNumber') {
        debouncedDuplicateCheck(name, processedValue);
      }
    };

    const handleSymptomToggle = (symptom) => {
      const isSelected = formData.selectedSymptoms.includes(symptom);
      const updatedSymptoms = isSelected
        ? formData.selectedSymptoms.filter(s => s !== symptom)
        : [...formData.selectedSymptoms, symptom];
      
      setFormData(prev => ({ ...prev, selectedSymptoms: updatedSymptoms }));
      
      if (updatedSymptoms.length > 0 && fieldErrors.selectedSymptoms) {
        const newErrors = { ...fieldErrors };
        delete newErrors.selectedSymptoms;
        setFieldErrors(newErrors);
        setError('');
      }
    };

    const debouncedDuplicateCheck = async (fieldName, value) => {
      if (duplicateCheckTimer) {
        clearTimeout(duplicateCheckTimer);
      }

      const timer = setTimeout(async () => {
        if (!value || value.length < 3) return;

        let email = '';
        let contactNumber = '';
        
        if (fieldName === 'email') {
          email = value;
        } else if (fieldName === 'contactNumber') {
          contactNumber = value;
          if (cleanPhoneNumber(value).length !== 11) return;
        }

        const duplicateResult = await checkDuplicateUser(email, contactNumber);
        
        if (duplicateResult && duplicateResult.isDuplicate) {
          setFieldErrors(prev => ({
            ...prev,
            [fieldName]: duplicateResult.message
          }));
        } else if (duplicateResult && !duplicateResult.isDuplicate) {
          setFieldErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[fieldName];
            return newErrors;
          });
        
          setFieldErrors(currentErrors => {
            const remainingErrors = Object.keys(currentErrors).filter(key => key !== fieldName);
            if (remainingErrors.length === 0) {
              setError('');
            }
            return currentErrors;
          });
        }
      }, 800);
      setDuplicateCheckTimer(timer);
    };

    const handleIDScanClick = () => {
      if (!isCameraAvailable()) {
        setError('Camera scanning requires HTTPS connection. Please contact IT support or enter information manually.');
        return;
      }
      setShowCameraModal(true);
      setCameraError('');
    };

    const initializeCameraStream = async () => {
      cleanupCameraStream();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      try {
        const stream = await initializeCamera();
        
        if (!stream) {
          throw new Error('Failed to get camera stream');
        }
        
        setCameraStream(stream);
        setCameraError('');
        
        setTimeout(() => {
          const video = document.getElementById('webreg-camera-feed');
          
          if (!video) {
            setCameraError('Video element not available. Please try again.');
            return;
          }
          
          video.srcObject = null;
          video.load();
          video.srcObject = stream;
          video.setAttribute('playsinline', '');
          video.setAttribute('webkit-playsinline', '');
          video.muted = true;
          
          const playVideo = async () => {
            try {
              await video.play();
            } catch (playError) {
              setCameraError('Failed to start camera preview. Please check camera permissions.');
            }
          };
          
          playVideo();
        }, 300);
        
      } catch (err) {
        let errorMessage = 'Failed to access camera. ';
        
        if (err.name === 'NotAllowedError') {
          errorMessage += 'Please allow camera access and try again.';
        } else if (err.name === 'NotFoundError') {
          errorMessage += 'No camera found on this device.';
        } else if (err.name === 'NotReadableError') {
          errorMessage += 'Camera is already in use by another application.';
        } else {
          errorMessage += err.message || 'Unknown camera error.';
        }
        
        setCameraError(errorMessage);
        setCameraStream(null);
      }
    };

    const cleanupCameraStream = () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => {
          track.stop();
        });
      }

      const video = document.getElementById('webreg-camera-feed');
      if (video) {
        video.srcObject = null;
        video.load();
      }

      cleanupCamera(cameraStream);
      setCameraStream(null);
    };

const handleCaptureID = async () => {
  if (ocrProcessing) return;
  
  const video = document.getElementById('webreg-camera-feed');
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
    setCameraError('Camera not ready. Please wait a moment and try again.');
    return;
  }
  
  try {
    const imageData = captureImageFromVideo(video);
    if (!imageData) {
      setCameraError('Failed to capture image. Please try again.');
      return;
    }
    
    setCapturedImage(imageData);
    
    // If ID type is selected, process with OCR AND upload image
    if (selectedIDType) {
      await processIDImageWithOCR(imageData);
      // Image upload is now handled inside processIDImageWithOCR
    } else {
      setCameraError('Please select an ID type first');
    }
  } catch (error) {
    setCameraError('Failed to capture image. Please try again.');
  }
};

// MODIFIED: uploadIDImageToSupabase function (new helper function)
const uploadIDImageToSupabase = async (imageDataUrl, patientId, idType) => {
  try {
    setUploadingIDImage(true);
    
    // Convert base64 to blob
    const base64Data = imageDataUrl.split(',')[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });
    
    // Create FormData
    const formData = new FormData();
    formData.append('file', blob, `${patientId}_${idType}_${Date.now()}.jpg`);
    formData.append('patientId', patientId);
    formData.append('idType', idType);
    
    // Upload to backend
    const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/upload-id-image`, {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ ID image uploaded successfully:', result.publicUrl);
      return result.publicUrl;
    } else {
      console.error('❌ ID image upload failed:', result.error);
      return null;
    }
  } catch (error) {
    console.error('❌ ID image upload error:', error);
    return null;
  } finally {
    setUploadingIDImage(false);
  }
};


const processIDImageWithOCR = async (imageData) => {
  if (ocrProcessing || !imageData) return;
  
  if (!selectedIDType) {
    setCameraError('Please select an ID type first');
    return;
  }
  
  setOcrProcessing(true);
  
  try {
    // Run OCR extraction
    const result = await processIDWithOCR(imageData, selectedIDType);
    
    if (result.success && result.name) {
      // Handle different ID types with their specific fields
      const updateData = { 
        fullName: result.name,
        idType: selectedIDType,
        idNumber: result.idNumber || ''
      };
      
      // PhilHealth: populate name, sex, birthday, and address
      if (selectedIDType === 'philhealth') {
        if (result.sex) updateData.sex = result.sex;
        if (result.birthday) {
          updateData.birthday = result.birthday;
          updateData.age = calculateAge(result.birthday);
        }
        if (result.address) updateData.address = result.address;
      }
      // Driver's License: populate name, sex, birthday, and address
      else if (selectedIDType === 'drivers_license') {
        if (result.sex) updateData.sex = result.sex;
        if (result.birthday) {
          updateData.birthday = result.birthday;
          updateData.age = calculateAge(result.birthday);
        }
        if (result.address) updateData.address = result.address;
      }
      // UMID: populate sex, birthday, and address
      else if (selectedIDType === 'umid') {
        if (result.sex) updateData.sex = result.sex;
        if (result.birthday) {
          updateData.birthday = result.birthday;
          updateData.age = calculateAge(result.birthday);
        }
        if (result.address) updateData.address = result.address;
      }
      // PhilSys or Postal ID: populate birthday and address
      else if (selectedIDType === 'philsys' || selectedIDType === 'postal') {
        if (result.birthday) {
          updateData.birthday = result.birthday;
          updateData.age = calculateAge(result.birthday);
        }
        if (result.address) updateData.address = result.address;
      }
      
      setFormData((prev) => ({ 
        ...prev, 
        ...updateData
      }));
      
      // ✅ NEW: Save captured image for later upload
      setCapturedIDImage(imageData);
      
      setShowCameraModal(false);
      setError('');
      
      // Show appropriate success message
      let successMessage = `${ID_TYPES.find(t => t.value === selectedIDType)?.label} scanned successfully!`;
      
      if (selectedIDType === 'philhealth' && result.sex && result.birthday && result.address) {
        successMessage += ' Name, sex, birthday, and address extracted.';
      } else if (selectedIDType === 'philhealth' && (result.sex || result.birthday || result.address)) {
        const extracted = [];
        if (result.sex) extracted.push('sex');
        if (result.birthday) extracted.push('birthday');
        if (result.address) extracted.push('address');
        successMessage += ` Name and ${extracted.join(', ')} extracted.`;
      } else if (selectedIDType === 'drivers_license' && result.sex && result.birthday && result.address) {
        successMessage += ' Name, sex, birthday, and address extracted.';
      } else if (selectedIDType === 'drivers_license' && (result.sex || result.birthday || result.address)) {
        const extracted = [];
        if (result.sex) extracted.push('sex');
        if (result.birthday) extracted.push('birthday');
        if (result.address) extracted.push('address');
        successMessage += ` Name and ${extracted.join(', ')} extracted.`;
      } else if (selectedIDType === 'umid' && result.sex && result.birthday && result.address) {
        successMessage += ' Name, sex, birthday, and address extracted.';
      } else if (selectedIDType === 'umid' && (result.sex || result.birthday || result.address)) {
        const extracted = [];
        if (result.sex) extracted.push('sex');
        if (result.birthday) extracted.push('birthday');
        if (result.address) extracted.push('address');
        successMessage += ` Name and ${extracted.join(', ')} extracted.`;
      } else if ((selectedIDType === 'philsys' || selectedIDType === 'postal') && result.birthday && result.address) {
        successMessage += ' Name, birthday, and address extracted.';
      } else if ((selectedIDType === 'philsys' || selectedIDType === 'postal') && (result.birthday || result.address)) {
        successMessage += ' Name and ' + (result.birthday ? 'birthday' : 'address') + ' extracted.';
      } else if (selectedIDType === 'pagibig') {
        successMessage += ' Name extracted.';
      }
      
      showToastNotification(successMessage, 'success');
    } else {
      setCameraError(result.message || 'Failed to extract information from ID');
    }
  } catch (err) {
    setCameraError('Failed to process ID image. Please try again.');
  } finally {
    setOcrProcessing(false);
  }
};


    const uploadIDImage = async (imageData, patientId, idType) => {
      try {
        // Convert base64 to blob
        const base64Data = imageData.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });
        
        // Create filename: patientId_idType_timestamp.jpg
        const timestamp = Date.now();
        const fileName = `${patientId}_${idType}_${timestamp}.jpg`;
        
        // Upload to Supabase
        const formData = new FormData();
        formData.append('file', blob, fileName);
        formData.append('patientId', patientId);
        formData.append('idType', idType);
        
        const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/upload-id-image`, {
          method: 'POST',
          body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
          console.log('✅ ID image uploaded successfully:', result.publicUrl);
          return result.publicUrl;
        } else {
          console.error('❌ ID image upload failed:', result.error);
          return null;
        }
      } catch (error) {
        console.error('❌ ID image upload error:', error);
        return null;
      }
    };

    const closeCameraModal = (focusFullName = false) => {
      setShowCameraModal(false);
      setCapturedImage(null);
      setCameraError('');
      setOcrProcessing(false);
      
      cleanupCameraStream();
      
      if (focusFullName) {
        setTimeout(() => {
          const fullNameInput = document.querySelector('input[name="fullName"]');
          if (fullNameInput) {
            fullNameInput.focus();
            fullNameInput.select();
          }
        }, 100);
      }
    };

    const retryIDCamera = async () => {
      setCameraError('');
      setOcrProcessing(false);
      await initializeCameraStream();
    };

    const generateAvailableTimeSlots = (selectedDate) => {
      const allSlots = [
        { value: 'morning', label: 'Morning (8:00 AM - 12:00 PM)', endHour: 12 },
        { value: 'afternoon', label: 'Afternoon (12:00 PM - 5:00 PM)', endHour: 17 },
        { value: 'evening', label: 'Evening (5:00 PM - 8:00 PM)', endHour: 20 },
        { value: 'anytime', label: 'Any available time', endHour: 24 }
      ];

      if (!selectedDate) return allSlots;

      const selectedDateObj = new Date(selectedDate);
      const today = new Date();
      const isToday = selectedDateObj.toDateString() === today.toDateString();

      if (!isToday) {
        return allSlots;
      }

      const currentHour = today.getHours();
      const availableSlots = [];

      allSlots.forEach(slot => {
        if (slot.value === 'anytime') {
          if (availableSlots.length > 0) {
            availableSlots.push(slot);
          }
        } else if (currentHour < slot.endHour - 2) {
          availableSlots.push(slot);
        }
      });

      return availableSlots.length > 0 ? availableSlots : [
        { value: 'emergency', label: 'Walk-in (subject to availability)' }
      ];
    };

    const generateDepartmentRecommendation = () => {
      const departmentMapping = {
        'Chest Pain': 'Cardiology',
        'Chest Discomfort': 'Cardiology', 
        'Heart Palpitations': 'Cardiology',
        'High Blood Pressure': 'Cardiology',
        'Shortness of Breath': 'Cardiology',
        'Stomach Ache': formData.age < 18 ? 'Pediatrics' : 'Internal Medicine',
        'Fever': 'Internal Medicine',
        'Headache': 'Internal Medicine',
        'Fatigue': 'Internal Medicine',
        'Cough': 'Internal Medicine',
        'Nausea': 'Internal Medicine',
        'Vomiting': 'Internal Medicine',
        'Diarrhea': 'Internal Medicine',
        'Joint Pain': 'Internal Medicine',
        'Back Pain': 'Internal Medicine',
        'Annual Check-up': 'Internal Medicine',
        'Health Screening': 'Internal Medicine',
        'Vaccination': 'Internal Medicine'
      };

      for (const symptom of formData.selectedSymptoms) {
        if (departmentMapping[symptom]) {
          return departmentMapping[symptom];
        }
      }
      
      return 'Internal Medicine';
    };

    const nextStep = () => {
      const stepErrors = {};

      if (currentStep === 1) {
        if (!formData.fullName.trim()) {
          stepErrors.fullName = 'Full name is required';
        } else if (validateFullName(formData.fullName)) {
          stepErrors.fullName = validateFullName(formData.fullName);
        }

        if (!formData.sex) stepErrors.sex = 'Select your sex';

        if (!formData.birthday) {
          stepErrors.birthday = 'Select your date of birth';
        } else if (validateAge(formData.birthday)) {
          stepErrors.birthday = validateAge(formData.birthday);
        }

        if (!formData.address.trim()) {
          stepErrors.address = 'Complete address is required';
        } else if (validateAddress(formData.address)) {
          stepErrors.address = validateAddress(formData.address);
        }

        if (!formData.contactNumber) {
          stepErrors.contactNumber = 'Contact number is required';
        } else if (validatePhoneNumber(formData.contactNumber)) {
          stepErrors.contactNumber = validatePhoneNumber(formData.contactNumber);
        }

        if (!formData.email) {
          stepErrors.email = 'Email address is required';
        } else if (validateEmail(formData.email)) {
          stepErrors.email = validateEmail(formData.email);
        }

        if (fieldErrors.contactNumber && !stepErrors.contactNumber) {
          stepErrors.contactNumber = fieldErrors.contactNumber;
        }
        if (fieldErrors.email && !stepErrors.email) {
          stepErrors.email = fieldErrors.email;
        }

        if (duplicateChecking) {
          setError('Please wait while we verify your contact details...');
          return;
        }
      }

      if (currentStep === 2) {
        if (!formData.emergencyContactName.trim()) {
          stepErrors.emergencyContactName = 'Emergency contact name is required';
        } else if (validateFullName(formData.emergencyContactName)) {
          stepErrors.emergencyContactName = validateFullName(formData.emergencyContactName);
        }

        if (!formData.emergencyContactNumber) {
          stepErrors.emergencyContactNumber = 'Emergency contact number is required'; 
        } else if (validatePhoneNumber(formData.emergencyContactNumber)) {
          stepErrors.emergencyContactNumber = validatePhoneNumber(formData.emergencyContactNumber);
        }

        if (!formData.emergencyRelationship) {
          stepErrors.emergencyRelationship = 'Select your relationship';
        }

        if (formData.emergencyContactNumber === formData.contactNumber) {
          stepErrors.emergencyContactNumber = 'Emergency contact number cannot be the same as patient\'s number';
        }
      }

      if (currentStep === 3 && !termsAccepted) {
        stepErrors.termsAccepted = 'Please accept the terms and conditions';
      }

      if (currentStep === 4) {
        if (formData.selectedSymptoms.length === 0) {
          stepErrors.selectedSymptoms = 'Select at least one symptom';
        }
      }

      if (currentStep === 5) {
        const hasRoutineOnly = hasOnlyRoutineCareSymptoms(formData.selectedSymptoms);
    
        if (!hasRoutineOnly) {
          if (!formData.duration) {
            stepErrors.duration = 'Select how long you have experienced these symptoms';
          }
          if (!formData.severity) {
            stepErrors.severity = 'Select the severity level';
          }
        }
      }
      
      if (currentStep === 6) {
        const dateTimeValidation = validateAppointmentDateTime(formData.preferredDate, formData.appointmentTime);
        if (dateTimeValidation) {
          stepErrors.preferredDate = dateTimeValidation;
        }
        
        if (!formData.preferredDate) stepErrors.preferredDate = 'Select your preferred date';
        if (!formData.appointmentTime) stepErrors.appointmentTime = 'Select your preferred time slot';
      }

      setFieldErrors(stepErrors);
      setShowValidation(true);

      if (Object.keys(stepErrors).length === 0) {
        if (currentStep < 7) {
          setCurrentStep(currentStep + 1);
          setShowValidation(false);
          setError('');
        }
      } else {
        if (stepErrors.contactNumber || stepErrors.email) {
          setError('Please use different contact details that are not already registered.');
        } else {
          setError('Please complete all required fields before continuing.');
        }
        
        setTimeout(() => {
          if (currentStep === 4 && stepErrors.selectedSymptoms) {
            window.scrollTo({ 
              top: 0, 
              behavior: 'smooth' 
            });
          } else {
            const firstErrorField = document.querySelector(
              `[name="${Object.keys(stepErrors)[0]}"]`
            );
            if (firstErrorField) {
              firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
              firstErrorField.focus();
            }
          }
        }, 100);
      }
    };

    const prevStep = () => {
      if (currentStep > 1) {
        setCurrentStep(currentStep - 1);
        setError('');
      }
    };

const handleSubmit = async () => {
  if (!validateStep(currentStep)) {
    setError('Please complete all required fields');
    return;
  }

  setLoading(true);
  setError('');

  try {
    const calculatedAge = formData.age || calculateAge(formData.birthday);

    // ✅ STEP 1: Upload ID image FIRST if captured
    let idImageUrl = null;
    if (capturedIDImage && selectedIDType) {
      console.log('📤 Uploading ID image before registration...');
      
      // Generate temporary patient ID for upload
      const tempUploadId = `TEMP_${Date.now()}`;
      
      idImageUrl = await uploadIDImageToSupabase(
        capturedIDImage,
        tempUploadId,
        selectedIDType
      );
      
      if (idImageUrl) {
        console.log('✅ ID image uploaded successfully:', idImageUrl);
      } else {
        console.warn('⚠️ ID image upload failed, continuing without image');
      }
    }

    // ✅ STEP 2: Create registration with id_image_url
    const registrationData = {
      name: formData.fullName,
      birthday: formData.birthday,
      age: parseInt(calculatedAge),
      sex: formData.sex,
      address: formData.address,
      contact_no: cleanPhoneNumber(formData.contactNumber),
      email: formData.email.toLowerCase(),
      emergency_contact_name: formData.emergencyContactName,
      emergency_contact_relationship: formData.emergencyRelationship,
      emergency_contact_no: cleanPhoneNumber(formData.emergencyContactNumber),
      symptoms: formData.selectedSymptoms.join(', '),
      duration: formData.duration,
      severity: formData.severity,
      previous_treatment: formData.previousTreatment || null,
      allergies: formData.allergies || null,
      medications: formData.medications || null,
      preferred_date: formData.preferredDate,
      preferred_time_slot: formData.appointmentTime,
      scheduled_date: formData.preferredDate,
      status: 'completed',
      created_date: new Date().toISOString().split('T')[0],
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      id_type: selectedIDType || null,
      id_number: formData.idNumber || null,
      id_image_url: idImageUrl || null // ✅ Include uploaded image URL
    };

    console.log('📤 Submitting registration with ID data:', {
      id_type: registrationData.id_type,
      id_number: registrationData.id_number,
      id_image_url: registrationData.id_image_url
    });

    const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/temp-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(registrationData)
    });

    const result = await response.json();

    if (!response.ok) {
      if (result.field) {
        setFieldErrors(prev => ({
          ...prev,
          [result.field === 'phone' ? 'contactNumber' : result.field]: result.error
        }));
        
        setCurrentStep(1);
        
        setTimeout(() => {
          const errorField = document.querySelector(`[name="${result.field === 'phone' ? 'contactNumber' : result.field}"]`);
          if (errorField) {
            errorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
            errorField.focus();
          }
        }, 100);
      }
      throw new Error(result.error || 'Registration failed');
    }

    const tempRegId = result.temp_id;
    const tempPatientId = result.temp_patient_id;

    // ✅ STEP 3: Update image path with real temp patient ID
    if (idImageUrl && tempPatientId && capturedIDImage) {
      console.log('🔄 Updating ID image path with temp patient ID...');
      
      // Re-upload with correct temp patient ID
      const finalImageUrl = await uploadIDImageToSupabase(
        capturedIDImage,
        tempPatientId,
        selectedIDType
      );
      
      if (finalImageUrl) {
        console.log('✅ ID image path updated with temp patient ID');
        
        // Update the database with the final image URL
        try {
          await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/temp-registration/${tempRegId}/update-id-image`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              id_image_url: finalImageUrl
            })
          });
          console.log('✅ Database updated with final image URL');
        } catch (updateError) {
          console.error('❌ Failed to update image URL in database:', updateError);
        }
      }
    }

    // Generate QR code data
    const qrData = {
      type: 'webreg_registration',
      source: 'web_registration',
      version: '1.0',
      tempRegId: tempRegId,
      tempPatientId: tempPatientId,
      patientName: formData.fullName,
      patientEmail: formData.email.toLowerCase(),
      patientPhone: cleanPhoneNumber(formData.contactNumber),
      scheduledDate: registrationData.scheduled_date,
      preferredTime: registrationData.preferred_time_slot,
      symptoms: formData.selectedSymptoms.join(', '),
      severity: formData.severity,
      duration: formData.duration,
      previousTreatment: formData.previousTreatment,
      allergies: formData.allergies,
      medications: formData.medications,
      timestamp: new Date().toISOString(),
      expiresAt: registrationData.expires_at,
      registrationHash: btoa(`${tempPatientId}-${formData.email.toLowerCase()}-${Date.now()}`).slice(0, 16),
      checksum: btoa(`${tempPatientId}${formData.fullName}${formData.email.toLowerCase()}`).slice(0, 8)
    };

    console.log('🔍 Generated QR Data:', qrData);

    if (!qrData.tempPatientId || !qrData.patientName || !qrData.patientEmail) {
      throw new Error('QR code generation failed - missing required data');
    }

    setRegistrationResult({
      tempPatientId: tempPatientId,
      type: 'registration'
    });

    // Send QR code email
    try {
      const qrResponse = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/generate-qr-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          qrData: qrData,
          patientEmail: formData.email,
          patientName: formData.fullName
        })
      });

      const qrResult = await qrResponse.json();

      if (!qrResponse.ok) {
        showToastNotification('Registration completed, but QR code email failed. Please visit the reception desk.', 'warning');
      } else {
        showToastNotification('Registration completed successfully! Check your email for the QR code.', 'success');
      }
    } catch (emailError) {
      showToastNotification('Registration completed, but QR code email failed. Please visit the reception desk.', 'warning');
    }

    setTimeout(() => {
      setShowSuccessModal(true);
    }, 500);

  } catch (err) {
    setError(err.message || 'Registration failed. Please check your internet connection and try again.');
    showToastNotification(err.message || 'Registration failed. Please try again.', 'error');
  } finally {
    setLoading(false);
  }
};

    const handleSuccessModalClose = () => {
      setShowSuccessModal(false);
      sessionStorage.clear();
      localStorage.clear();
      
      setTimeout(() => {
        window.location.href = '/web-login';
      }, 500);
    };

    const handleCategoryToggle = (categoryName) => {
      setOpenCategories(prev => ({
        ...prev,
        [categoryName]: !prev[categoryName]
      }));
    };

    const handleSearchChange = (categoryName, searchValue) => {
      setCategorySearches(prev => ({
        ...prev,
        [categoryName]: searchValue
      }));
    };

    const showToastNotification = (message, type = 'success') => {
      setToastMessage(message);
      setToastType(type);
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
      }, 4000);
    };

    const renderProgressBar = () => {
      const stepNames = ['Personal Info', 'Emergency Contact', 'Review Info', 'Health Assessment', 'Additional Info', 'Schedule', 'Final Review'];

      return (
        <div className="webreg-progress-container">
          <div className="webreg-progress-wrapper">
            {stepNames.map((name, index) => {
              const stepNumber = index + 1;
              const isActive = stepNumber === currentStep;
              const isCompleted = stepNumber < currentStep;

              return (
                <div
                  key={index}
                  className={`webreg-progress-step-wrapper 
                    ${isCompleted ? 'completed' : ''} 
                    ${isActive ? 'active' : ''}`}
                >
                  <div className="webreg-progress-step">
                    <div className="webreg-step-number-circle">
                      {isCompleted ? <Check size={16} /> : stepNumber}
                    </div>
                    <div className="webreg-step-details">
                      <div className="webreg-step-label">{name}</div>
                      <div className="webreg-step-description">
                        {isCompleted ? 'Completed' : isActive ? 'In Progress' : 'Pending'}
                      </div>
                    </div>
                  </div>
                  {index < stepNames.length - 1 && (
                    <div className={`webreg-step-connector-line ${isCompleted ? 'completed' : ''}`}></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    const renderPersonalDetailsStep = () => (
      <div className="webreg-reg-card webreg-step-transition">
        <div className="webreg-step-header">
          <div className="webreg-step-icon">
            <User size={24} />
          </div>
          <h3>Personal Information</h3>
          <p>Please provide your basic information</p>
        </div>

        <div className="kiosk-input-group">
          <label>ID Type</label>
          <select
            value={selectedIDType}
            onChange={(e) => setSelectedIDType(e.target.value)}
            className="kiosk-reg-form-input"
            required
          >
            <option value="">Select ID Type</option>
            {ID_TYPES.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          {!selectedIDType && (
            <small className="input-reminder">Select ID type before scanning</small>
          )}
        </div>

        <div className="web-input-group">
          <label>Scan ID (Optional)</label>
          <div className="web-scan-helper">Scan your {selectedIDType ? ID_TYPES.find(t => t.value === selectedIDType)?.label : 'ID'} for faster registration</div>
          <div className="web-id-scan">
            <img src={sampleID} alt="Sample ID" className="sampleID"/>
            <button
              onClick={handleIDScanClick}
              disabled={!selectedIDType || ocrProcessing || !isCameraAvailable()}
              className="web-id-scan-btn"
            >
              {!isCameraAvailable() ? 'Camera Not Available' :
                !selectedIDType ? 'Select ID Type First' :
                ocrProcessing ? (<><span className="web-loading-spinner"></span>Scanning...</>) : 
                `Scan ${ID_TYPES.find(t => t.value === selectedIDType)?.label}`}
            </button>
          </div>
        </div>

        <div className="webreg-form-grid two-column">
          <div className="webreg-input-group">
            <label>Full Name</label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleInputChange}
              placeholder="Enter your complete name"
              className={`webreg-reg-form-input ${fieldErrors.fullName ? 'invalid' : ''}`}
              required
              autoComplete="off"
            />
            <small className="input-reminder">First Name, Middle Name, Last Name</small>
            {showValidation && fieldErrors.fullName && (
              <small className="error-text">{fieldErrors.fullName}</small>
            )}
          </div>

          <div className="webreg-input-group">
            <label>Sex</label>
            <select
              name="sex"
              value={formData.sex}
              onChange={handleInputChange}
              className={`webreg-reg-form-input ${showValidation && fieldErrors.sex ? 'invalid' : ''}`}
              required
              autoComplete="off"
            >
              <option value="" disabled hidden>Select sex</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
            {showValidation && fieldErrors.sex && (
              <small className="error-text">{fieldErrors.sex}</small>
            )}
          </div>

          <div className="webreg-input-group">
            <label>Date of Birth</label>
            <input
              type="date"
              name="birthday"
              value={formData.birthday}
              onChange={handleInputChange}
              className={`webreg-reg-form-input ${showValidation && fieldErrors.birthday ? 'invalid' : ''}`}
              max={new Date().toISOString().split('T')[0]}
              required
              autoComplete="off"
            />
            {showValidation && fieldErrors.birthday && (
              <small className="error-text">{fieldErrors.birthday}</small>
            )}
          </div>

          <div className="webreg-input-group">
            <label>Age</label>
            <input
              type="text"
              value={formData.age ? (typeof formData.age === 'string' && formData.age.includes('old') ? formData.age : `${formData.age} years old`) : ''}
              className="webreg-reg-form-input"
              disabled
              placeholder="Auto-fill"
            />
          </div>

          <div className="webreg-input-group full-width">
            <label>Complete Address</label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleInputChange}
              placeholder="House No., Street, Barangay, City, Province"
              className={`webreg-reg-form-input ${fieldErrors.address ? 'invalid' : ''}`}
              required
              autoComplete="off"
            />
            {fieldErrors.address && (
              <small className="error-text">{fieldErrors.address}</small>
            )}
          </div>

          <div className="webreg-input-group">
            <label>Contact Number</label>
            <input
              type="tel"
              name="contactNumber"
              value={formData.contactNumber}
              onChange={handleInputChange}
              placeholder="09XX-XXX-XXXX"
              className={`webreg-reg-form-input ${fieldErrors.contactNumber ? 'invalid' : ''}`}
              required
              autoComplete="off"
            />
            {fieldErrors.contactNumber && (
              <small className="error-text">{fieldErrors.contactNumber}</small>
            )}
          </div>

          <div className="webreg-input-group">
            <label>Email Address</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="your.email@example.com"
              className={`webreg-reg-form-input ${fieldErrors.email ? 'invalid' : ''}`}
              required
              autoComplete="off"
            />
            {fieldErrors.email && (
              <small className="error-text">{fieldErrors.email}</small>
            )}
          </div>  
        </div>
      </div>
    );

    const renderEmergencyContactStep = () => (
      <div className="webreg-reg-card webreg-step-transition">
        <div className="webreg-step-header">
          <div className="webreg-step-icon">
            <Bell size={24} />
          </div>
          <h3>Emergency Contact</h3>
          <p>Provide emergency contact information</p>
        </div>

        <div className="webreg-emergency-banner">
          <div className="webreg-banner-icon">
            <Bell size={20} />
          </div>
          <div className="webreg-banner-content">
            <h4>Important Information</h4>
            <p>This person will be contacted in case of medical emergency</p>
          </div>
        </div>

        <div className="webreg-form-grid">
          <div className="webreg-input-group">
            <label>Emergency Contact Name</label>
            <input
              type="text"
              name="emergencyContactName"
              value={formData.emergencyContactName}
              onChange={handleInputChange}
              placeholder="Full name of emergency contact"
              className={`webreg-reg-form-input ${fieldErrors.emergencyContactName ? 'invalid' : ''}`}
              required
              autoComplete="off"
            />
            {fieldErrors.emergencyContactName && (
              <small className="error-text">{fieldErrors.emergencyContactName}</small>
            )}
          </div>

          <div className="webreg-input-group">
            <label>Contact Number</label>
            <input
              type="tel"
              name="emergencyContactNumber"
              value={formData.emergencyContactNumber}
              onChange={handleInputChange}
              placeholder="09XX-XXX-XXXX"
              className={`webreg-reg-form-input ${fieldErrors.emergencyContactNumber ? 'invalid' : ''}`}
              required
              autoComplete="off"
            />
            {fieldErrors.emergencyContactNumber && (
              <small className="error-text">{fieldErrors.emergencyContactNumber}</small>
            )}
            {formData.emergencyContactNumber === formData.contactNumber && (
              <small className="error-text">Emergency contact number cannot be the same as patient's number</small>
            )}
          </div>

          <div className="webreg-input-group">
            <label>Relationship</label>
            <select
              name="emergencyRelationship"
              value={formData.emergencyRelationship}
              onChange={handleInputChange}
              className={`webreg-reg-form-input ${showValidation && fieldErrors.emergencyRelationship ? 'invalid' : ''}`}
              required
              autoComplete="off"
            >
              <option value="" disabled hidden>Select relationship</option>
              {relationships.map(rel => (
                <option key={rel.id} value={rel.relationship_name}>
                  {rel.relationship_name}
                </option>
              ))}
            </select>
            {showValidation && fieldErrors.emergencyRelationship && (
              <small className="error-text">{fieldErrors.emergencyRelationship}</small>
            )}
          </div>
        </div>
      </div>
    );

    const renderReviewStep = () => (
      <div className="webreg-reg-card webreg-step-transition">
        <div className="webreg-step-header">
          <div className="webreg-step-icon">
            <Clipboard size={24} />
          </div>
          <h3>Review & Confirm</h3>
          <p>Please verify your information</p>
        </div>

        <div className="webreg-review-sections">
          <div className="webreg-review-section">
            <h4><User size={16} /> Personal Information</h4>
            <div className="webreg-review-grid">
              <div className="webreg-review-item">
                <label>Full Name:</label>
                <span>{formData.fullName}</span>
              </div>
              <div className="webreg-review-item">
                <label>Age & Sex:</label>
                <span>{formData.age} years old, {formData.sex}</span>
              </div>
              <div className="webreg-review-item">
                <label>Contact Number:</label>
                <span>{formData.contactNumber}</span>
              </div>
              <div className="webreg-review-item">
                <label>Email:</label>
                <span>{formData.email}</span>
              </div>
              <div className="webreg-review-item full-width">
                <label>Address:</label>
                <span>{formData.address}</span>
              </div>
            </div>
          </div>

          <div className="webreg-review-section">
            <h4><Bell size={16} /> Emergency Contact</h4>
            <div className="webreg-review-grid">
              <div className="webreg-review-item">
                <label>Name:</label>
                <span>{formData.emergencyContactName}</span>
              </div>
              <div className="webreg-review-item">
                <label>Number:</label>
                <span>{formData.emergencyContactNumber}</span>
              </div>
              <div className="webreg-review-item">
                <label>Relationship:</label>
                <span>{formData.emergencyRelationship}</span>
              </div>
            </div>
          </div>

          {formData.idType && (
            <div className="webreg-review-section">
              <h4><Clipboard size={16} /> ID Information</h4>
              <div className="webreg-review-grid">
                <div className="webreg-review-item">
                  <label>ID Type:</label>
                  <span>{formData.idType}</span>
                </div>
                <div className="webreg-review-item">
                  <label>ID Number:</label>
                  <span>{formData.idNumber}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="webreg-terms">
          <label className={`webreg-checkbox-label ${showValidation && fieldErrors.termsAccepted ? 'invalid' : ''}`}>
            <input 
              type="checkbox" 
              checked={termsAccepted}
              onChange={(e) => {
                setTermsAccepted(e.target.checked);
                if (e.target.checked) {
                  const newErrors = { ...fieldErrors };
                  delete newErrors.termsAccepted;
                  setFieldErrors(newErrors);
                }
              }}
              className={showValidation && fieldErrors.termsAccepted ? 'invalid' : ''}
            />
            <span>
              I confirm that all information provided is accurate and I agree to the
              <strong> Terms and Conditions</strong> and <strong>Privacy Policy </strong>
              of CliCare Hospital.
            </span>
          </label>
        </div>
      </div>
    );

    const renderSymptomsStep = () => (
      <div className="webreg-reg-card webreg-step-transition">
        <div className="webreg-step-header">
          <div className="webreg-step-icon">
            <Stethoscope size={24} />
          </div>
          <h3>Health Assessment</h3>
          <p>What brings you to the clinic today?</p>
        </div>

        <div className="webreg-symptoms-info">
          <div className={`webreg-info-banner ${showValidation && fieldErrors.selectedSymptoms ? 'has-error' : ''}`}>
            <div className="webreg-info-icon"><Stethoscope size={20} /></div>
            <div className="webreg-info-content">
              <h4>Select Your Symptoms</h4>
              <p>Search and select from categories below</p>
            </div>
          </div>
        </div>

        {formData.selectedSymptoms.length > 0 && (
          <div className="webreg-selected-symptoms">
            <h4>Selected Symptoms ({formData.selectedSymptoms.length})</h4>
            <div className="webreg-selected-list">
              {formData.selectedSymptoms.map(symptom => (
                <div
                  key={symptom}
                  className="webreg-selected-symptom"
                  onClick={() => handleSymptomToggle(symptom)}
                >
                  {symptom}
                  <span className="remove-icon">×</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {symptomsLoading ? (
          <div className="webreg-loading">
            <span className="webreg-loading-spinner"></span>
            Loading symptoms...
          </div>
        ) : outpatientSymptoms.length === 0 ? (
          <div className="webreg-reg-error">
            No symptoms available. Please refresh the page or contact support.
          </div>
        ) : (
          <div className="webreg-symptoms-categories">
            {outpatientSymptoms.map(category => {
              const filteredSymptoms = getFilteredSymptoms(category);
              const selectedCount = getCategorySelectedCount(category);
              const isOpen = openCategories[category.category];

              return (
                <div key={category.category} className="webreg-symptom-category">
                  <div 
                    className="webreg-category-header"
                    onClick={() => handleCategoryToggle(category.category)}
                  >
                    <div className="webreg-category-title">
                      {category.category}
                      {selectedCount > 0 && (
                        <span className="webreg-category-count">{selectedCount}</span>
                      )}
                    </div>
                    <div className="webreg-category-toggle">
                      {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </div>
                  </div>

                  <div className={`webreg-symptom-dropdown ${isOpen ? 'open' : ''}`}>
                    <div className="webreg-symptom-search-container">
                      <input
                        type="text"
                        placeholder={`Search ${category.category.toLowerCase()}...`}
                        value={categorySearches[category.category] || ''}
                        onChange={(e) => handleSearchChange(category.category, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="webreg-symptom-search"
                      />
                      <div className="webreg-search-icon">
                        <Search size={16} />
                      </div>
                    </div>

                    <div className="webreg-symptom-list">
                      {filteredSymptoms.length === 0 ? (
                        <div className="webreg-no-results">
                          No symptoms found matching "{categorySearches[category.category]}"
                        </div>
                      ) : (
                        filteredSymptoms.map((symptom, index) => (
                          <div
                            key={`${category.category}-${symptom}-${index}`}
                            onClick={() => handleSymptomToggle(symptom)}
                            className={`webreg-symptom-item ${
                              formData.selectedSymptoms.includes(symptom) ? 'selected' : ''
                            }`}
                          >
                            <span className="webreg-symptom-text">{symptom}</span>
                            {formData.selectedSymptoms.includes(symptom) && (
                              <span className="webreg-symptom-check">✓</span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );

    const renderDetailsStep = () => {
      const hasRoutineOnly = hasOnlyRoutineCareSymptoms(formData.selectedSymptoms);
      
      return (
        <div className="webreg-reg-card webreg-step-transition">
          <div className="webreg-step-header">
            <div className="webreg-step-icon"><List size={24} /></div>
            <h3>Additional Details</h3>
            <p>
              {hasRoutineOnly 
                ? "Additional information for your appointment"
                : "Help us understand your condition better"
              }
            </p>
          </div>

          {hasRoutineOnly && (
            <div className="webreg-info-banner">
              <div className="webreg-info-icon"><CheckCircle size={20} /></div>
              <div className="webreg-info-content">
                <h4>Routine Care Appointment</h4>
                <p>Duration and severity are not required for routine care services. You may skip to scheduling if desired.</p>
              </div>
            </div>
          )}

          <div className="webreg-form-grid two-column">
            {!hasRoutineOnly && (
              <>
                <div className="webreg-input-group full-width">
                  <label>How long have you experienced these symptoms?</label>
                  <select
                    name="duration"
                    value={formData.duration}
                    onChange={handleInputChange}
                    className={`webreg-reg-form-input ${fieldErrors.duration ? 'invalid' : ''}`}
                    required
                    autoComplete="off"
                  >
                    <option value="" disabled>Select duration</option>
                    {durationOptions.map(option => (
                      <option key={option.id} value={option.duration_text}>
                        {option.duration_text}
                      </option>
                    ))}
                  </select>
                  {showValidation && fieldErrors.duration && (
                    <small className="error-text">{fieldErrors.duration}</small>
                  )}
                </div>

                <div className="webreg-input-group full-width">
                  <label>Severity Level</label>
                  <select
                    name="severity"
                    value={formData.severity}
                    onChange={handleInputChange}
                    className={`webreg-reg-form-input ${fieldErrors.severity ? 'invalid' : ''}`}
                    required
                    autoComplete="off"
                  >
                    <option value="" disabled>Select severity</option>
                    {severityLevels.map(level => (
                      <option key={level.id} value={level.level_name}>
                        {level.level_name} - {level.description}
                      </option>
                    ))}
                  </select>
                  {showValidation && fieldErrors.severity && (
                    <small className="error-text">{fieldErrors.severity}</small>
                  )}
                </div>
              </>
            )}

            <div className="webreg-input-group full-width">
              <label>Previous Treatment</label>
              <textarea
                name="previousTreatment"
                value={formData.previousTreatment}
                onChange={handleInputChange}
                placeholder={hasRoutineOnly 
                  ? "Any previous screenings, vaccinations, or relevant medical history"
                  : "Any previous treatments or medications tried for this condition"
                }
                className="webreg-reg-form-input webreg-form-textarea"
                rows="2"
                autoComplete="off"
              />
            </div>

            <div className="webreg-input-group full-width">
              <label>Known Allergies</label>
              <input
                type="text"
                name="allergies"
                value={formData.allergies}
                onChange={handleInputChange}
                placeholder="List any known allergies to medications or substances"
                className="webreg-reg-form-input"
                autoComplete="off"
              />
            </div>

            <div className="webreg-input-group full-width">
              <label>Current Medications</label>
              <input
                type="text"
                name="medications"
                value={formData.medications}
                onChange={handleInputChange}
                placeholder="List any medications you're currently taking"
                className="webreg-reg-form-input"
                autoComplete="off"
              />
            </div>
          </div>
        </div>
      );
    };

    const renderSchedulingStep = () => (
      <div className="webreg-reg-card webreg-step-transition">
        <div className="webreg-step-header">
          <div className="webreg-step-icon">
            <Calendar size={24} />
          </div>
          <h3>Appointment Scheduling</h3>
          <p>Choose your preferred appointment date and time</p>
        </div>

        <div className="webreg-form-grid two-column">
          <div className="webreg-input-group">
            <label>Preferred Date</label>
            <input
              type="date"
              name="preferredDate"
              value={formData.preferredDate}
              onChange={handleInputChange}
              onInput={(e) => {
                const value = e.target.value;
                if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                  e.target.value = formData.preferredDate;
                }
              }}
              min={new Date().toISOString().split('T')[0]}
              max={getMaxAppointmentDate()}
              className={`webreg-reg-form-input ${fieldErrors.preferredDate ? 'invalid' : ''}`}
              required
              autoComplete="off"
            />
            {showValidation && fieldErrors.preferredDate && (
              <small className="error-text">{fieldErrors.preferredDate}</small>
            )}
          </div>

          <div className="webreg-input-group">
            <label>Appointment Time</label>
            <select
              name="appointmentTime"
              value={formData.appointmentTime}
              onChange={handleInputChange}
              className={`webreg-reg-form-input ${fieldErrors.appointmentTime ? 'invalid' : ''}`}
              required
              autoComplete="off"
            >
              <option value="">Select preferred time</option>
              {timeSlots.map(slot => (
                <option key={slot.slot_id} value={slot.slot_name}>
                  {slot.display_label}
                </option>
              ))}
            </select>
            {formData.preferredDate && new Date(formData.preferredDate).toDateString() === new Date().toDateString() && (
              <small className="input-reminder">Same-day appointments are subject to availability</small>
            )}
            {showValidation && fieldErrors.appointmentTime && (
              <small className="error-text">{fieldErrors.appointmentTime}</small>
            )}
          </div>
        </div>
      </div>
    );

    const renderSummaryStep = () => (
      <div className="webreg-reg-card webreg-step-transition">
        <div className="webreg-step-header">
          <div className="webreg-step-icon">
            <Clipboard size={24} />
          </div>
          <h3>Registration Summary</h3>
          <p>Review all information before completing registration</p>
        </div>

        {error && <div className="webreg-reg-error">{error}</div>}

        <div className="webreg-summary-sections">
          <div className="webreg-summary-section">
            <h4><User size={16} /> Patient Information</h4>
            <div className="webreg-summary-grid">
              <div className="webreg-summary-item">
                <label>Full Name:</label>
                <span>{formData.fullName}</span>
              </div>
              <div className="webreg-summary-item">
                <label>Age & Sex:</label>
                <span>{formData.age} years old, {formData.sex}</span>
              </div>
              <div className="webreg-summary-item">
                <label>Contact Number:</label>
                <span>{formData.contactNumber}</span>
              </div>
              <div className="webreg-summary-item">
                <label>Email:</label>
                <span>{formData.email}</span>
              </div>
              <div className="webreg-summary-item full-width">
                <label>Address:</label>
                <span>{formData.address}</span>
              </div>
            </div>
          </div>

          <div className="webreg-summary-section">
            <h4><Stethoscope size={16} /> Health Information</h4>
            <div className="webreg-summary-grid">
              <div className="webreg-summary-item full-width">
                <label>Symptoms ({formData.selectedSymptoms.length}):</label>
                <span>{formData.selectedSymptoms.join(', ')}</span>
              </div>
              <div className="webreg-summary-item">
                <label>Duration:</label>
                <span>{formData.duration}</span>
              </div>
              <div className="webreg-summary-item">
                <label>Severity:</label>
                <span>{formData.severity}</span>
              </div>
              {formData.allergies && (
                <div className="webreg-summary-item full-width">
                  <label>Allergies:</label>
                  <span>{formData.allergies}</span>
                </div>
              )}
              {formData.medications && (
                <div className="webreg-summary-item full-width">
                  <label>Current Medications:</label>
                  <span>{formData.medications}</span>
                </div>
              )}
            </div>
          </div>

          <div className="webreg-summary-section">
            <h4><Bell size={16} /> Emergency Contact</h4>
            <div className="webreg-summary-grid">
              <div className="webreg-summary-item">
                <label>Name:</label>
                <span>{formData.emergencyContactName}</span>
              </div>
              <div className="webreg-summary-item">
                <label>Number:</label>
                <span>{formData.emergencyContactNumber}</span>
              </div>
              <div className="webreg-summary-item">
                <label>Relationship:</label>
                <span>{formData.emergencyRelationship}</span>
              </div>
            </div>
          </div>

          <div className="webreg-summary-section">
            <h4><Calendar size={16} /> Appointment Schedule</h4>
            <div className="webreg-summary-grid">
              <div className="webreg-summary-item">
                <label>Preferred Date:</label>
                <span>{formData.preferredDate}</span>
              </div>
              <div className="webreg-summary-item">
                <label>Preferred Time:</label>
                <span>{formData.appointmentTime}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );

    const renderCurrentStep = () => {
      switch (currentStep) {
        case 1: return renderPersonalDetailsStep();
        case 2: return renderEmergencyContactStep();
        case 3: return renderReviewStep();
        case 4: return renderSymptomsStep();
        case 5: return renderDetailsStep();
        case 6: return renderSchedulingStep();
        case 7: return renderSummaryStep();
        default: return renderPersonalDetailsStep();
      }
    };

    const renderBackButton = () => {
      if (currentStep === 1) {
        return (
          <button
            type="button"
            onClick={() => window.location.href = '/web-login'}
            className="webreg-nav-btn home"
          >
            <ChevronLeft size={16} />Back to Home
          </button>
        );
      }

      return (
        <button
          type="button"
          onClick={prevStep}
          className="webreg-nav-btn secondary"
        >
          <ChevronLeft size={16} />Back
        </button>
      );
    };

    const renderNextButton = () => {
      if (currentStep === 7) {
        return (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="webreg-nav-btn submit"
          >
            Submit
          </button>
        );
      }

      return (
        <button
          type="button"
          onClick={nextStep}
          className="webreg-nav-btn primary"
        >
          Continue<ChevronRight size={16} />
        </button>
      );
    };

    const renderCameraModal = () => {
      if (!showCameraModal) return null;

      return (
        <div className="webreg-popup-overlay">
          <div className="webreg-popup webreg-camera-modal">
            <div className="webreg-popup-content">
              <div className="webreg-popup-header">
                <h3>Scan Philippine ID</h3>
                <button onClick={closeCameraModal} className="webreg-popup-close">
                  <X size={20} />
                </button>
              </div>
              {cameraError ? (
                <div className="webreg-camera-error">
                  <div className="webreg-error-icon">
                    <AlertTriangle size={48} />
                  </div>
                  <p>{cameraError}</p>
                  <div className="webreg-error-actions">
                    {cameraError.includes('HTTPS') ? (
                      <button onClick={() => closeCameraModal(true)} className="webreg-retry-btn">
                        Enter Manually
                      </button>
                    ) : (
                      <>
                        <button onClick={retryIDCamera} className="webreg-retry-btn">
                          <RotateCcw size={16} /> Try Again
                        </button>
                        <button onClick={() => closeCameraModal(true)} className="webreg-cancel-btn">
                          Enter Manually
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="webreg-camera-container">
                    <video 
                      id="webreg-camera-feed" 
                      autoPlay
                      playsInline
                      muted
                      className="webreg-camera-feed"
                    />
                    <div className="webreg-camera-overlay">
                      <div className="webreg-id-frame">
                        <div className="webreg-corner tl"></div>
                        <div className="webreg-corner tr"></div>
                        <div className="webreg-corner bl"></div>
                        <div className="webreg-corner br"></div>
                      </div>
                    </div>
                  </div>
                  <p className="webreg-camera-instruction">
                    <Camera size={16} />Position your ID within the frame above
                  </p>
                  <div className="webreg-error-actions">
                    <button
                      onClick={handleCaptureID}
                      disabled={ocrProcessing || !cameraStream}
                      className="webreg-capture-btn"
                    >
                      Capture ID
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      );
    }; 

    const renderSuccessModal = () => {
      if (!showSuccessModal || !registrationResult) return null;

      return (
        <div className="webreg-popup-overlay">
          <div className="webreg-popup webreg-success-modal">
            <div className="webreg-popup-content">
              <div className="webreg-success-content">
                <div className="webreg-success-message">
                  <h4>Registration QR Code Sent!</h4>

                  {/* Add Patient Details Section */}
                  <div className="webreg-success-details">
                    <p><strong>Registration ID:</strong> {registrationResult.tempPatientId}</p>
                    <p><strong>Status:</strong> Pending Kiosk Completion</p>
                  </div>

                  {/* Email Instructions */}
                  <div className="webreg-email-instructions">
                    <p>Your registration QR code has been sent to your email.</p>
                    <p>Please check your email and present the QR code at the hospital kiosk to complete your registration.</p>
                  </div>

                  <div className="webreg-error-actions">
                    <button
                      onClick={handleSuccessModalClose}
                      className="webreg-success-btn"
                    >
                      Continue to Homepage
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    };

    const renderToast = () => {
      if (!showToast) return null;

      return (
        <div className={`webreg-toast webreg-toast-${toastType}`}>
          <div className="webreg-toast-content">
            <div className="webreg-toast-icon">
              {toastType === 'success' && <CheckCircle size={18} />}
              {toastType === 'error' && <AlertTriangle size={18} />}
              {toastType === 'info' && <Info size={18} />}
              {toastType === 'warning' && <AlertTriangle size={18} />}
            </div>
            <div className="webreg-toast-message">{toastMessage}</div>
            <button 
              onClick={() => setShowToast(false)} 
              className="webreg-toast-close"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      );
    };

    const renderWelcomeSection = () => {
      return (
        <div className="webreg-welcome-container">
          <h1 className="webreg-welcome-title">Welcome to CliCare Hospital</h1>
          <p className="webreg-welcome-subtitle">
            You are registering as a <strong>New Patient</strong>. 
            Please complete all required steps below.
          </p>
        </div>
      );
    };

    return (
      <div className="webreg-registration-portal">
        {renderWelcomeSection()}
        {renderProgressBar()}
        
        <div className="webreg-reg-content">
          {renderCurrentStep()}
        </div>

        <div className="webreg-nav-buttons">
          {renderBackButton()}
          {renderNextButton()}
        </div>
        <div className="webreg-help-footer">
          <div className="webreg-help-section">
            <h4>Need Help?</h4>
            <p>Press the help button or ask hospital staff for assistance</p>
          </div>
        </div>

        {renderCameraModal()}
        {renderSuccessModal()}
        {renderToast()}

      </div>
    );
  };

  export default WebRegistration;