import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { Link } from "react-router-dom";
import { theme } from '../styles/theme';
import { useAuth } from '../contexts/AuthContext';

const styles = {
  loginContainer: {
    minHeight: '100vh',
    background: `linear-gradient(135deg, ${theme.colors.primary.main}, ${theme.colors.secondary.main})`,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '2rem',
  },
  loginBox: {
    background: 'rgba(255, 255, 255, 0.95)',
    padding: '2.5rem',
    borderRadius: theme.borderRadius.lg,
    boxShadow: theme.shadows.lg,
    width: '100%',
    maxWidth: '400px',
    backdropFilter: 'blur(10px)',
  },
  heading: {
    color: theme.colors.primary.main,
    textAlign: 'center',
    marginBottom: '2rem',
    fontSize: '1.875rem',
    fontWeight: '600',
  },
  formGroup: {
    marginBottom: '1.5rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    color: theme.colors.text.secondary,
    fontWeight: '500',
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    border: `1px solid ${theme.colors.border.main}`,
    borderRadius: theme.borderRadius.md,
    fontSize: '1rem',
    transition: 'all 0.2s',
    outline: 'none',
  },
  button: {
    width: '100%',
    padding: '0.875rem',
    backgroundColor: theme.colors.primary.main,
    color: 'white',
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: '1rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginTop: '1rem',
  },
  errorMessage: {
    color: theme.colors.error.main,
    textAlign: 'center',
    marginBottom: '1rem',
    padding: '0.75rem',
    backgroundColor: theme.colors.error.light + '20',
    borderRadius: theme.borderRadius.md,
  }
};

export default function Login({ user }) {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if(formData.password.length < 6){
      setError("Password must be at least 6 characters long");
      return;
    }
    if (!/[@$!%*?&#]/.test(formData.password)) {
      setError("Password must contain at least one special character (@, $, !, %, *, ?, &, #).");
      return;
    }
    try {
      const userData = await login({
        username: formData.username,
        password: formData.password,
        role: user
      });
      console.log(userData)

      // Redirect based on user role
      if (userData.role === 'admin') {
        navigate('/admin-dashboard');
      } else if (userData.role === 'faculty') {
        navigate('/faculty-dashboard', { state: { email: formData.username } });
      } else if (userData.role === 'student') {
        navigate('/student-dashboard', { state: { email: formData.username } });
      } else if (userData.role === 'reviewer'){
        navigate('/reviewer-dashboard', { state: { email: formData.username } });
      }
      
      // if (userData.role === 'admin') {
      //   navigate('/admin-dashboard');
      // } else {
      //   console.log(formData.username);
      //   navigate('/faculty-dashboard', {state : {email : formData.username}});
      // }
    } catch (error) {
      console.error('Login error:', error);
      setError(error.response?.data?.error || 'Login failed. Please try again.');
    }
  };

  return (
    <div style={styles.loginContainer}>
      <div style={styles.loginBox}>
      <h2 style={styles.heading}>
      {user === 'admin' 
      ? 'Admin Login' 
      : user === 'faculty' 
      ? 'Faculty Login' 
      : user === 'reviewer'
      ? 'Reviewer Login' 
      : 'Student Login'}
</h2>

        {error && <div style={styles.errorMessage}>{error}</div>}
        <form onSubmit={handleLogin}>
          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="username">Username</label>
            <input
              style={styles.input}
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              required
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="password">Password</label>
            <input
              style={styles.input}
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>
          <button style={styles.button} type="submit">Login</button>
        </form>
        {user === 'student' && (
  <div style={{ marginTop: '1rem', textAlign: 'center' }}>
    Not registered?{' '}
    <Link to="/signup-student" style={{ color: '#007bff', textDecoration: 'underline' }}>
      Sign up here
    </Link>
  </div>
)}

      </div>
    </div>
  );
}