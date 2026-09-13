import { createContext, useContext, useState, useEffect } from 'react';
import API from '../api/axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [maintenance, setMaintenance] = useState({
    isUnderMaintenance: false,
    message: '',
    estimatedEnd: null,
  });

  useEffect(() => {
    const initializeAuth = async () => {
      // 1. Check global maintenance status first
      try {
        const maintRes = await API.get('/auth/maintenance/status');
        if (maintRes.data?.data) {
          setMaintenance(maintRes.data.data);
        }
      } catch (err) {
        console.warn("Could not fetch maintenance status:", err.message);
      }

      // 2. Check stored tokens & user session
      const token = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      if (token && storedUser) {
        // Optimistically set from storage for instant UI paint
        try {
          setUser(JSON.parse(storedUser));
        } catch (e) {
          console.error("Failed to parse stored user:", e);
        }

        // Fetch fresh user data from server to keep state and permissions updated
        try {
          const res = await API.get('/auth/me');
          if (res.data?.data?.user) {
            const freshUser = res.data.data.user;
            localStorage.setItem('user', JSON.stringify(freshUser));
            setUser(freshUser);
          }
        } catch (err) {
          console.warn("Session validation failed or token expired:", err?.response?.data?.message || err.message);
          // If token is invalid/expired, clear session
          if (err.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setUser(null);
          }
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = (userData, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  // Function to safely update user state & localStorage after profile/email verification changes
  const updateUser = (userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, login, updateUser, logout, loading, maintenance, setMaintenance }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);