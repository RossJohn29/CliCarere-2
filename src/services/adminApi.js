// adminApi.js

// Use environment variable for API URL, fallback to localhost for development
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const getAuthToken = () => {
  return localStorage.getItem('adminToken');
};

const getAuthHeaders = () => {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

const apiCall = async (endpoint, options = {}) => {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
   
    const config = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    const response = await fetch(url, config);
   
    let data;
    const contentType = response.headers.get('Content-Type');
   
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      switch (response.status) {
        case 401:
          localStorage.clear();
          window.location.href = '/admin-login';
          throw new Error(data.error || 'Unauthorized access');
       
        case 403:
          throw new Error(data.error || 'Access forbidden');
       
        case 404:
          throw new Error(data.error || 'Resource not found');
       
        case 429:
          throw new Error(data.error || 'Too many requests. Please try again later.');
       
        case 500:
          throw new Error(data.error || 'Server error. Please try again.');
       
        default:
          throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
      }
    }

    return data;

  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Unable to connect to server. Please check your connection.');
    }
   
    throw error;
  }
};

export const fetchAdminData = async () => {
  const response = await fetch(`${API_BASE_URL}/api/admin/data`);
  return response.json();
};

export const adminApi = {
  healthCheck: async () => {
    return apiCall('/api/health');  // ✅ Added /api
  },

  login: async (credentials) => {
    const response = await apiCall('/api/admin/login', {  // ✅ Added /api
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    if (response.success && response.token) {
      localStorage.setItem('adminToken', response.token);
      localStorage.setItem('adminId', response.admin.healthadmin_id);
      localStorage.setItem('adminInfo', JSON.stringify(response.admin));
    }

    return response;
  },

  logout: async () => {
    try {
      await apiCall('/api/admin/logout', {  // ✅ Added /api
        method: 'POST',
        headers: getAuthHeaders(),
      });
    } catch (error) {
      console.warn('Logout API call failed:', error);
    } finally {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminId');
      localStorage.removeItem('adminInfo');
    }
  },

  getProfile: async () => {
    return apiCall('/api/admin/profile', {  // ✅ Added /api
      headers: getAuthHeaders(),
    });
  },

  validateToken: async () => {
    return apiCall('/api/admin/validate-token', {  // ✅ Added /api
      method: 'POST',
      headers: getAuthHeaders(),
    });
  },

  getDashboardStats: async () => {
    return apiCall('/api/admin/dashboard-stats', {  // ✅ Added /api
      headers: getAuthHeaders(),
    });
  },

  getAllAdmins: async () => {
    return apiCall('/api/admin/all', {  // ✅ Added /api
      headers: getAuthHeaders(),
    });
  },
};

export const adminUtils = {
  isAuthenticated: () => {
    const token = getAuthToken();
    return !!token;
  },

  isTokenExpired: () => {
    const token = getAuthToken();
    if (!token) return true;
   
    try {
      const tokenParts = token.split('.');
      if (tokenParts.length !== 3) return true;
     
      const payload = JSON.parse(atob(tokenParts[1]));
      const now = Date.now() / 1000;
     
      return payload.exp && payload.exp < (now + 30);
    } catch (error) {
      console.warn('Token parsing error:', error);
      return true;
    }
  },

  getAdminInfo: () => {
    const adminInfoString = localStorage.getItem('adminInfo');
    return adminInfoString ? JSON.parse(adminInfoString) : null;
  },

  refreshTokenIfNeeded: async () => {
    try {
      await adminApi.validateToken();
      return true;
    } catch (error) {
      console.warn('Token validation failed:', error);
      return false;
    }
  },

  formatAdminName: (admin) => {
    if (!admin) return 'Unknown Admin';
    return admin.name || 'Admin User';
  },

  formatAdminPosition: (admin) => {
    if (!admin) return 'Unknown Position';
    return admin.position || 'Administrator';
  },

  formatErrorMessage: (error) => {
    if (typeof error === 'string') return error;
    if (error && error.message) return error.message;
    return 'An unexpected error occurred. Please try again.';
  },
};

export default adminApi;