import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import Header from '../Header';
import Logo from '../../images/profile.png';
import { theme } from '../../styles/theme';
import { Button } from '../common/Button';

export default function AdminReviewerList() {
  const navigate = useNavigate();
  const [reviewer, setReviewer] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchReviewer();
  }, []);

  const fetchReviewer = async () => {
    try {
      const response = await api.get('/reviewer/');
      console.log('Reviewer:', response.data);
      setReviewer(response.data.reviewer || []);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching reviewer:', err);
      setError('Failed to load reviewer data');
      setLoading(false);
    }
  };

  const handleDelete = async (rId) => {
    if (window.confirm('Are you sure you want to delete this reviewer?')) {
      try {
        await api.delete(`/reviewer/${rId}/`);
        fetchReviewer();
      } catch (err) {
        setError('Failed to delete reviewer');
      }
    }
  };

  if (loading) return <div className="loading">Loading reviewer data...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <>
    <Header name="Reviewer Management" logo={Logo} />
      <div className="container">
        <div className="header-section">
          <h1>Manage Reviewer</h1>
          <Button 
            onClick={() => navigate('/admin/reviewer/add')}
            variant="primary"
          >Add New Reviewer</Button>
        </div>
        
        <div className="reviewer-grid">
          {reviewer.map((r) => (
            <div key={r.r_id} className="reviewer-card">
              <div className="card-header">
                <h3>{r.name}</h3>
                <p className="email">{r.email}</p>
              </div>

             
              <div className="card-actions">
                <button 
                  className="edit-btn"
                  onClick={() => navigate(`/admin/reviewer/${r.r_id}/edit`)}
                >
                  Edit
                </button>
                <button 
                  className="delete-btn"
                  onClick={() => handleDelete(r.r_id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .container {
          padding: 2rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .header-section {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .reviewer-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
          gap: 2rem;
        }

        .reviewer-card {
          background: white;
          --card-color: ${theme.colors.success.main};
          border-top: 4px solid var(--card-color);
          border-radius: ${theme.borderRadius.lg};
          box-shadow: ${theme.shadows.md};
          overflow: hidden;
        }

        .card-header {
          padding: 1.5rem;
          border-bottom: 1px solid ${theme.colors.border};
          color: var(--card-color);
        }

        .card-header h3 {
          margin: 0;
          font-size: 1.25rem;
        }

        .email {
          margin: 0.5rem 0 0;
          font-size: 0.9rem;
          color: ${theme.colors.text.secondary};
        }

        .card-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          padding: 1rem 1.5rem;
          background: ${theme.colors.background.default};
          border-top: 1px solid ${theme.colors.border};
        }

        .edit-btn, .delete-btn {
          padding: 0.5rem;
          border: none;
          border-radius: ${theme.borderRadius.md};
          cursor: pointer;
          font-weight: 500;
          transition: opacity 0.2s;
        }

        .edit-btn:hover, .delete-btn:hover {
          opacity: 0.9;
        }

        .edit-btn {
          background: ${theme.colors.primary.main};
          color: white;
        }

        .delete-btn {
          background: ${theme.colors.error.main};
          color: white;
        }

      `}</style>
    </>
  );
} 