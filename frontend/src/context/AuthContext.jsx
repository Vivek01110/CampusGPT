import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('askcampus_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('askcampus_token'));
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Synchronize authentication status with backend on mount
  useEffect(() => {
    const initAuth = async () => {
      const savedToken = localStorage.getItem('askcampus_token');
      if (savedToken) {
        try {
          const res = await authAPI.getMe();
          if (res?.data?.user) {
            setUser(res.data.user);
            localStorage.setItem('askcampus_user', JSON.stringify(res.data.user));
          }
        } catch (err) {
          console.warn('[AuthContext] Session expired or invalid token:', err.message);
          logout();
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  /**
   * Log in user
   */
  const login = async (email, password) => {
    setAuthError(null);
    try {
      const response = await authAPI.login({ email, password });
      const { user: userData, token: userToken } = response.data;

      setUser(userData);
      setToken(userToken);
      localStorage.setItem('askcampus_token', userToken);
      localStorage.setItem('askcampus_user', JSON.stringify(userData));

      return { success: true, user: userData };
    } catch (err) {
      setAuthError(err.message || 'Login failed. Please verify credentials.');
      return { success: false, error: err.message || 'Login failed' };
    }
  };

  /**
   * Register a new user
   */
  const register = async (userData) => {
    setAuthError(null);
    try {
      const response = await authAPI.register(userData);
      const { user: newUser, token: userToken } = response.data;

      setUser(newUser);
      setToken(userToken);
      localStorage.setItem('askcampus_token', userToken);
      localStorage.setItem('askcampus_user', JSON.stringify(newUser));

      return { success: true, user: newUser };
    } catch (err) {
      setAuthError(err.message || 'Registration failed.');
      return { success: false, error: err.message || 'Registration failed' };
    }
  };

  /**
   * Log out user
   */
  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (err) {
      // Ignore network errors on logout
    } finally {
      setUser(null);
      setToken(null);
      localStorage.removeItem('askcampus_token');
      localStorage.removeItem('askcampus_user');
      localStorage.removeItem('campusgpt_messages');
      setAuthError(null);
    }
  };

  const value = {
    user,
    token,
    loading,
    authError,
    isAuthenticated: Boolean(user && token),
    isAdmin: user?.role === 'admin',
    login,
    register,
    logout,
    clearError: () => setAuthError(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
