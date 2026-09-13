import axios from 'axios';

const API = axios.create({
  // Pulls base URL from your frontend .env file, with a secure localhost fallback
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// 1. Request Interceptor: Automatically attach the JWT token to outgoing requests
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 2. Response Interceptor: Handle global errors (e.g., auto-logout on expired tokens)
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Clear storage and redirect to login if unauthorized/token expired
      if (error.response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }

      // Log or catch global maintenance mode trigger
      if (error.response.status === 503) {
        console.warn("Portal is currently under maintenance mode.");
      }
    }
    return Promise.reject(error);
  }
);

export default API;