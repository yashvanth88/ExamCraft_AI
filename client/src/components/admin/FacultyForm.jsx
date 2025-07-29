import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../utils/api';
import Header from '../Header';
import Logo from '../../images/profile.png';

export default function FacultyForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState(() => ({
    name: '',
    email: '',
    password: '',
    dept_id: ''
  }));
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDepartments();
    if (id) {
      fetchFaculty();
    }
  }, [id]);

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/department/');
      setDepartments(response.data.departments || []);
    } catch (error) {
      console.error('Error fetching departments:', error);
      setError('Failed to fetch departments');
    }
  };

  const fetchFaculty = async () => {
    try {
      const response = await api.get(`/faculty/${id}/`);
      console.log('Faculty response:', response.data);
      
      const faculty = response.data.faculty;
      
      if (faculty) {
        console.log('Found faculty:', faculty);
        // Correctly handle department ID from the response
        const departmentId = faculty.departments?.[0]?.dept_id || '';
        console.log('Department ID:', departmentId);

        setFormData({
          name: faculty.name || '',
          email: faculty.email || '',
          password: '',
          dept_id: departmentId ? departmentId.toString() : ''
        });
      } else {
        console.error('Faculty not found:', id);
        setError('Faculty not found');
      }
    } catch (error) {
      console.error('Error fetching faculty:', error);
      setError('Failed to fetch faculty details');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      console.log('Submitting form data:', formData);

      const updateData = {
        faculty_id: id,
        name: formData.name.trim(),
        email: formData.email.trim(),
        dept_id: formData.dept_id || null,  // Make sure dept_id is included
      };

      if (formData.password) {
        updateData.password = formData.password;
      }

      console.log('Update data being sent:', updateData);

      if (id) {
        // For updating existing faculty
        const response = await api.put('/faculty/', updateData);
        console.log('Faculty update response:', response.data);
        alert('Faculty updated successfully!');
      } else {
        // For new faculty
        if (!formData.password) {
          setError('Password is required for new faculty');
          setLoading(false);
          return;
        }
        const response = await api.post('/faculty/', updateData);
        console.log('Faculty created:', response.data);
      }

      navigate('/admin/faculty');
    } catch (error) {
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      const errorMessage = error.response?.data?.error || 'Failed to save faculty';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    console.log(`Changing ${name} to:`, value); // Debug log
    
    setFormData(prev => {
      const newData = {
        ...prev,
        [name]: value
      };
      console.log('Updated form data:', newData); // Debug log
      return newData;
    });
  };

  return (
    <div className="admin-form-container">
      <Header name="Admin" page={id ? 'Edit Faculty' : 'Add Faculty'} logo={Logo} />
      
      <div className="form-content">
        <h2>{id ? 'Edit Faculty' : 'Add New Faculty'}</h2>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Faculty Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="form-control"
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="form-control"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">
              {id ? 'Password (leave blank to keep current)' : 'Password'}
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required={!id}
              className="form-control"
            />
          </div>

          <div className="form-group">
            <label htmlFor="dept_id">Department</label>
            <select
              id="dept_id"
              name="dept_id"
              value={formData.dept_id}
              onChange={handleChange}
              className="form-control"
            >
              <option value="">
                {id ? 
                  `Current Department: ${
                    formData.dept_id ? 
                    (departments.find(d => d.dept_id.toString() === formData.dept_id)?.dept_name || "Loading...") 
                    : "Not Assigned"
                  }`
                  : "Select Department"
                }
              </option>
              {departments.map(dept => (
                <option 
                  key={dept.dept_id} 
                  value={dept.dept_id.toString()}
                >
                  {dept.dept_name}
                </option>
              ))}
            </select>
          </div>

          <div className="button-group">
            <button type="button" onClick={() => navigate('/admin/faculty')} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {id ? 'Update Faculty' : 'Add Faculty'}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .admin-form-container {
          min-height: 100vh;
          background-color: #f5f6fa;
        }

        .form-content {
          max-width: 600px;
          margin: 2rem auto;
          padding: 2rem;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        h2 {
          color: #417690;
          margin-bottom: 1.5rem;
        }

        .error-message {
          background: #fff1f0;
          border: 1px solid #ffa39e;
          padding: 0.75rem;
          border-radius: 4px;
          color: #cf1322;
          margin-bottom: 1rem;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        label {
          display: block;
          margin-bottom: 0.5rem;
          color: #2c3e50;
          font-weight: 500;
        }

        input {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 1rem;
        }

        input:focus {
          border-color: #417690;
          outline: none;
          box-shadow: 0 0 0 2px rgba(65,118,144,0.2);
        }

        .button-group {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          margin-top: 2rem;
        }

        button {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 4px;
          font-size: 1rem;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .btn-primary {
          background: #417690;
          color: white;
        }

        .btn-primary:hover {
          background: #205067;
        }

        .btn-primary:disabled {
          background: #97a5ac;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: #f8f9fa;
          color: #2c3e50;
          border: 1px solid #ddd;
        }

        .btn-secondary:hover {
          background: #e9ecef;
        }
      `}</style>
    </div>
  );
} 