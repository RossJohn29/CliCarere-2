// weblogin.js
import React, { useState, useEffect } from 'react';
import './weblogin.css';
import logo from "../../logo.png";
import { 
  User,
  UserPlus,
  Mail,
  Phone,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

const WebLogin = () => {
  const [patientType, setPatientType] = useState('');
  const [loginMethod, setLoginMethod] = useState('email');
  const [fieldErrors, setFieldErrors] = useState({});
  const [showValidation, setShowValidation] = useState(false);
  const [credentials, setCredentials] = useState({
    patientId: '',
    email: '',
    phoneNumber: '',
    otp: ''
  });
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [justSent, setJustSent] = useState(false);
  const [checkTimeout, setCheckTimeout] = useState(null)

  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    return () => {
      if (checkTimeout) {
        clearTimeout(checkTimeout);
      }
    };
  }, [checkTimeout]);

  // Enhanced phone number validation
  const validatePhoneNumber = (phone) => {
    // Philippine phone number format
    const phoneRegex = /^(09|\+639|639)\d{9}$/;
    return phoneRegex.test(phone.replace(/\s|-/g, ''));
  };

  // Enhanced email validation
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const checkReturningPatientPendingQueue = async (patientId) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/check-pending-queue-by-id`, {
        method: 'POST',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ patientId })
      });

      const result = await response.json();
      
      if (!response.ok) {
        console.error('Error checking pending queue:', result);
        return { hasPending: false }; // Allow login on error
      }

      return result;
    } catch (error) {
      console.error('Failed to check pending queue:', error);
      return { hasPending: false }; // Allow login on error
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCredentials({ ...credentials, [name]: value });
    
    // Real-time pending queue check for Patient ID with debouncing
    if (name === 'patientId') {
      // Clear previous timeout
      if (checkTimeout) {
        clearTimeout(checkTimeout);
      }
      
      // Set new timeout for checking (wait 500ms after user stops typing)
      const newTimeout = setTimeout(() => {
        checkPendingQueueRealtime(value);
      }, 500);
      
      setCheckTimeout(newTimeout);
    }
    
    if (showValidation && !error.includes('Active Consultation')) {
      setShowValidation(false);
      setFieldErrors({});
    }
    
    if (!error.includes('Active Consultation')) {
      setError('');
    }
  };

  const handleMethodSwitch = (method) => {
    setLoginMethod(method);
    setCodeSent(false);
    setJustSent(false);
    setCredentials((prev) => ({ ...prev, otp: '' }));
    setError('');
    // Clear field-specific errors when switching methods
    setFieldErrors({});
    setShowValidation(false);
  };

  const checkPendingQueueRealtime = async (patientId) => {
    if (!patientId || patientId.trim().length < 3) {
      // Clear error and enable button if patient ID is too short
      if (error.includes('Active Consultation') || error.includes('scheduled appointment')) {
        setError('');
        setFieldErrors({});
      }
      return false;
    }

    try {
      console.log('🔍 Checking queue status for:', patientId);
      
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/outpatient/check-queue-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ patientId: patientId.toUpperCase() })
      });

      const data = await response.json();
      console.log('📊 Queue check result:', data);

      if (data.success && data.hasPendingQueue) {
        console.log('⚠️ Pending queue detected:', data.status);
        
        // ✅ Different messages based on status
        let errorMessage = '';
        if (data.status === 'scheduled') {
          const schedDate = data.scheduledDate ? new Date(data.scheduledDate).toLocaleDateString() : 'your scheduled date';
          errorMessage = `Please complete your first consultation before logging in.`;
        } else if (data.status === 'waiting') {
          errorMessage = `Please complete your first consultation before logging in.`;
        } else if (data.status === 'in_progress') {
          errorMessage = `Please complete your first consultation before logging in.`;
        } else {
          errorMessage = data.message || 'Please complete your current consultation before logging in.';
        }
        
        setError(errorMessage);
        setFieldErrors({ patientId: 'Pending consultation detected' });
        
        return true; // Has pending queue
      } else {
        console.log('✅ No pending queue - allowing login');
        // Clear error if no pending queue
        if (error.includes('Active Consultation') || error.includes('scheduled appointment')) {
          setError('');
          setFieldErrors({});
        }
        return false;
      }
    } catch (err) {
      console.error('❌ Queue check error:', err);
      return false;
    }
  };

  const handleSendOTP = async () => {
    const stepErrors = {};
    
    if (!credentials.patientId.trim()) {
      stepErrors.patientId = 'Patient ID is required';
    } else {
      // Check for pending queue before sending OTP
      const hasPendingQueue = await checkPendingQueueRealtime(credentials.patientId);
      if (hasPendingQueue) {
        // Don't set sendingCode to true here
        return; // Stop OTP sending if pending queue exists
      }
    }

    const contactValue = loginMethod === 'email' ? credentials.email : credentials.phoneNumber;
    if (!contactValue.trim()) {
      if (loginMethod === 'email') {
        stepErrors.email = 'Email address is required';
      } else {
        stepErrors.phoneNumber = 'Phone number is required';
      }
    } else {
      if (loginMethod === 'email' && !validateEmail(contactValue)) {
        stepErrors.email = 'Please enter a valid email address';
      }
      if (loginMethod === 'phone' && !validatePhoneNumber(contactValue)) {
        stepErrors.phoneNumber = 'Please enter a valid Philippine phone number (09XXXXXXXXX)';
      }
    }

    setFieldErrors(stepErrors);
    setShowValidation(true);

    if (Object.keys(stepErrors).length > 0) {
      return;
    }

    setSendingCode(true);
    setError('');

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/outpatient/send-otp`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          patientId: credentials.patientId.toUpperCase(),
          contactInfo: contactValue,
          contactType: loginMethod
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to send verification code');
        setSendingCode(false);
        return;
      }

      setCodeSent(true);
      setJustSent(true);
      
      setTimeout(() => {
        setJustSent(false);
        setCountdown(120);
      }, 2000);
    } catch (err) {
      console.error('Send OTP error:', err);
      setError('Connection error. Please check your internet and try again.');
    } finally {
      setSendingCode(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    setError('');

    const stepErrors = {};

    if (!credentials.patientId.trim()) {
      stepErrors.patientId = 'Patient ID is required';
    } else {
      // Final check before login
      const hasPendingQueue = await checkPendingQueueRealtime(credentials.patientId);
      if (hasPendingQueue) {
        setLoading(false);
        return;
      }
    }

    if (!codeSent) {
      stepErrors.otp = 'Please send verification code first';
    } else if (!credentials.otp.trim()) {
      stepErrors.otp = 'Verification code is required';
    }

    const contactValue = loginMethod === 'email' ? credentials.email : credentials.phoneNumber;
    if (!contactValue.trim()) {
      if (loginMethod === 'email') {
        stepErrors.email = 'Email address is required';
      } else {
        stepErrors.phoneNumber = 'Phone number is required';
      }
    }

    setFieldErrors(stepErrors);
    setShowValidation(true);

    if (Object.keys(stepErrors).length > 0) {
      setLoading(false);
      return;
    }

    try {
      const requestBody = {
        patientId: credentials.patientId.toUpperCase(),
        contactInfo: contactValue,
        otp: credentials.otp,
        deviceType: 'web'
      };

      console.log('📤 Sending login request:', requestBody);

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/outpatient/verify-otp`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      console.log('📥 Login response:', data);

      if (!response.ok) {
        console.error('❌ Login failed:', data.error);
        setError(data.error || 'Login failed. Please check your verification code.');
        setLoading(false);
        return;
      }

      console.log('✅ Login successful for:', data.patient.name);
      
      // Store comprehensive patient data
      localStorage.setItem('patientToken', data.token);
      localStorage.setItem('patientId', data.patient.patient_id);
      localStorage.setItem('patientName', data.patient.name);
      localStorage.setItem('patientInfo', JSON.stringify(data.patient));

      // Store emergency contact separately for easy access
      if (data.patient.emergency_contact_name) {
        localStorage.setItem('emergencyContact', JSON.stringify({
          name: data.patient.emergency_contact_name,
          relationship: data.patient.emergency_contact_relationship,
          contact_no: data.patient.emergency_contact_no
        }));
      }

      // Store login metadata
      localStorage.setItem('loginMethod', loginMethod);
      localStorage.setItem('deviceType', 'web');
      localStorage.setItem('loginTimestamp', new Date().toISOString());

      console.log('🎉 Redirecting to /web-main');
      
      window.location.replace('/web-main');

    } catch (err) {
      console.error('💥 Login error:', err);
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /* Patient Type Selection */
  const renderPatientTypeSelection = () => (
    <div className="weblogin-card">
      <div className="weblogin-form-header">
        <div className="weblogin-indicator">
          <span className="web-indicator">
            <img src={logo} alt="Logo" className="weblogin-indicator-logo"/>
          </span>
        </div>
        <h3>Welcome to CliCare</h3>
        <p>Choose your access type below</p>
      </div>

      <div className="weblogin-types">
        <button onClick={() => setPatientType('old')} className="weblogin-btn">
          <div className="icon">
            <User size={20} />
          </div>
          <div className="weblogin-btn-content">
            <h3>Returning Patient</h3>
            <p>I have a Patient ID</p>
            <small>Login with an existing account</small>
          </div>
        </button>

        <button onClick={() => setPatientType('new')} className="weblogin-btn">
          <div className="icon">
            <UserPlus size={20} />
          </div>
          <div className="weblogin-btn-content">
            <h3>New Patient</h3>
            <p>First time here</p>
            <small>Create your patient account</small>
          </div>
        </button>
      </div>
    </div>
  );

  /* Old Patient */
  const renderOldPatientLogin = () => (
    <div className="weblogin-card">
      <div className="weblogin-form-header">
        <div className="weblogin-indicator">
          <span className="web-indicator">
            <User size={25} />
          </span>
        </div>
        <h3>Welcome Back!</h3>
        <p>Enter your details to access your account</p>
      </div>

      {error && <div className="weblogin-error">{error}</div>}

      <div className="weblogin-login-form">
        <div className="weblogin-input-group">
          <label>Patient ID</label>
          <input
            type="text"
            name="patientId"
            value={credentials.patientId}
            onChange={handleInputChange}
            placeholder="Enter Patient ID (e.g., PAT001)"
            className={`weblogin-form-input ${fieldErrors.patientId ? 'invalid' : ''}`}
            required
            autoComplete="off"
            spellCheck="false"
          />
          <small className="weblogin-input-hint">
            Found on your patient card or previous visit documents
          </small>
          {showValidation && fieldErrors.patientId && (
            <small className="error-text">{fieldErrors.patientId}</small>
          )}
        </div>

        <div className="weblogin-input-group">
          <div className="weblogin-method-selection">
            <label>Verification Method</label>
            <div className="weblogin-method-toggle">
              <button
                type="button"
                onClick={() => handleMethodSwitch('email')}
                className={`weblogin-method-btn ${loginMethod === 'email' ? 'active' : ''}`}
              >
                <Mail size={16} /> Email
              </button>
              <button
                type="button"
                onClick={() => handleMethodSwitch('phone')}
                className={`weblogin-method-btn ${loginMethod === 'phone' ? 'active' : ''}`}
              >
                <Phone size={16} /> SMS
              </button>
            </div>
          </div>
          
          <label>{loginMethod === 'email' ? 'Email Address' : 'Phone Number'}</label>
          <div className="weblogin-contact-group">
            <input
              type={loginMethod === 'email' ? 'email' : 'tel'}
              name={loginMethod === 'email' ? 'email' : 'phoneNumber'}
              value={loginMethod === 'email' ? credentials.email : credentials.phoneNumber}
              onChange={handleInputChange}
              placeholder={loginMethod === 'email' ? 'you@example.com' : '09XX-XXX-XXXX'}
              className={`weblogin-form-input ${fieldErrors[loginMethod === 'email' ? 'email' : 'phoneNumber'] ? 'invalid' : ''}`}
              required
              autoComplete="off"
            />
            <button
              type="button"
              onClick={handleSendOTP}
              className="weblogin-otp-send-btn"
              disabled={sendingCode || justSent || countdown > 0}
            >
              {sendingCode
                ? (<><span className="weblogin-loading-spinner"></span> Sending...</>)
                : justSent
                  ? 'Sent'
                  : countdown > 0
                    ? `Resend in ${countdown}s`
                    : 'Send Code'}
            </button>
          </div>
          <small className="weblogin-input-hint">
            We'll send a verification code to your registered {loginMethod}
          </small>
          {showValidation && fieldErrors[loginMethod === 'email' ? 'email' : 'phoneNumber'] && (
            <small className="error-text">{fieldErrors[loginMethod === 'email' ? 'email' : 'phoneNumber']}</small>
          )}
        </div>

        <div className="weblogin-input-group">
          <label>Verification Code</label>
          <input
            type="text"
            name="otp"
            value={credentials.otp}
            onChange={handleInputChange}
            placeholder="Enter 6-digit verification code"
            className={`weblogin-form-input ${fieldErrors.otp ? 'invalid' : ''}`}
            maxLength="6"
            disabled={sendingCode}
            required
          />
          <small className="weblogin-input-hint">
            {codeSent
              ? (<><CheckCircle size={14} /> Code sent to your {loginMethod}</>)
              : (<><AlertTriangle size={14} /> Please send verification code first</>)
            }
          </small>
          {showValidation && fieldErrors.otp && (
            <small className="error-text">{fieldErrors.otp}</small>
          )}
        </div>

        <button 
          type="button" 
          onClick={handleLogin} 
          className="weblogin-access-btn"
          disabled={loading}
        >
          Sign In
        </button>

        <div className="weblogin-account-toggle">
          <p>
            Don't have an account?{' '}
            <button onClick={() => setPatientType('new')} className="weblogin-account-link">
              Register here
            </button>
          </p>
        </div>
      </div>
    </div>
  );

  /* New Patient Registration */
  const renderNewPatientRedirect = () => (
    <div className="weblogin-card">
      <div className="weblogin-form-header">
        <div className="weblogin-indicator">
          <span className="web-indicator">
            <UserPlus size={25} />
          </span>
        </div>
        <h3>Create Your Account</h3>
        <p>Join CliCare for better healthcare management</p>
      </div>

      <div className="weblogin-reg-info">
        <div className="weblogin-info-card">
          <h4>Quick Registration Process:</h4>
          <ul className="weblogin-info-list">
            <li><CheckCircle size={14} /> Personal information (name, age, contact)</li>
            <li><CheckCircle size={14} /> Emergency contact details</li>
            <li><CheckCircle size={14} /> Optional ID scan for faster setup</li>
            <li><CheckCircle size={14} /> Review and confirm your details</li>
          </ul>
        </div>
      </div>

      <button
        onClick={() => (window.location.href = '/web-registration')}
        className="weblogin-access-btn"
      > Start Registration
      </button>

      <div className="weblogin-account-toggle">
        <p>
          Already have an account?{' '}
          <button onClick={() => setPatientType('old')} className="weblogin-account-link">
            Sign in
          </button>
        </p>
      </div>
    </div>
  );

  return (
    <div className="weblogin-portal">
      <div className="weblogin-welcome-container">
        <h1 className="weblogin-welcome-title">Welcome to CliCare Hospital</h1>
        <p className="weblogin-welcome-subtitle">
          Access your <strong>Patient Portal</strong> or create a new account
        </p>
      </div>

      <div className="weblogin-content">
        {!patientType && renderPatientTypeSelection()}
        {patientType === 'old' && renderOldPatientLogin()}
        {patientType === 'new' && renderNewPatientRedirect()}
      </div>

      <div className="admin-footer">
        <p>© 2025 CliCare. All rights reserved.</p>
      </div>
    </div>
  );
};

export default WebLogin;