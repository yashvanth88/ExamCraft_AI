import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../utils/api';
import { convertLength } from '@mui/material/styles/cssUtils';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const token = localStorage.getItem('token');
        console.log('token', token)
        if (token) {
          api.defaults.headers.common['Authorization'] = `Token ${token}`;
          const response = await api.get('/profile/');
          setUser(response.data);
          console.log('response.data', response.data)
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
        localStorage.removeItem('token');
        delete api.defaults.headers.common['Authorization'];
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, []);

  const login = async (credentials) => {
    // console.log('credentials', credentials)
    try {
      const response = await api.post('/login/', credentials);
      const { token, user: userData } = response.data;
      
      // Store token and role (use role from backend response, not credentials)
      localStorage.setItem('token', token);
      localStorage.setItem('userRole', userData.role);
      api.defaults.headers.common['Authorization'] = `Token ${token}`;
      
      // Fetch user profile
      const profileResponse = await api.get('/profile/');
      const profileData = profileResponse.data;
      setUser(profileData);
      if (profileData.role === 'student') {
        const email = encodeURIComponent(profileData.email);
        const name = encodeURIComponent(profileData.name);
        window.location.href = `http://localhost:3000/exam?email=${email}&name=${name}&role=student`;
      }
      return profileData;
    } catch (error) {
      throw error.response?.data?.error || 'Login failed';
    }
  };

  const logout = async () => {
    try {
      // First, call the backend logout endpoint
      await api.post('/logout/');
    } catch (error) {
      console.error('Backend logout error:', error);
      // Continue with cleanup even if backend fails
    } finally {
      // Get last known role before clearing storage
      const lastRole = localStorage.getItem('userRole');
      // Clean up all auth-related storage
      localStorage.clear();  // Clear all localStorage items
      // Reset API headers
      delete api.defaults.headers.common['Authorization'];
      // Reset auth context state
      setUser(null);
      // Redirect to appropriate login page
      let loginPath = '/login';
      if (lastRole === 'faculty') {
        loginPath = '/login-faculty';
      } else if (lastRole === 'student') {
        loginPath = '/login-student';
      }
      else if(lastRole === 'reviewer'){
        loginPath = '/login-reviewer'
      }
      window.location.replace(loginPath); // Using replace prevents back-button from accessing protected routes
    }
  };

  const value = {
    user,
    loading,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 