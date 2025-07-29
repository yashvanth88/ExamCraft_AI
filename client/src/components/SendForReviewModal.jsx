import React, { useState, useEffect } from 'react';
import { api, reviewAPI } from '../utils/api';

export default function SendForReviewModal({ isOpen, onClose, paperId, onSuccess }) {
  const [reviewers, setReviewers] = useState([]);
  const [selectedReviewers, setSelectedReviewers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  console.log('SendForReviewModal render:', { isOpen, paperId });

  useEffect(() => {
    if (isOpen) {
      fetchReviewers();
    }
  }, [isOpen]);

  const fetchReviewers = async () => {
    try {
      const response = await api.get('/reviewer/');
      setReviewers(response.data.reviewer || []);
    } catch (err) {
      console.error('Error fetching reviewers:', err);
      setError('Failed to load reviewers');
    }
  };

  const handleReviewerToggle = (reviewerId) => {
    setSelectedReviewers(prev => 
      prev.includes(reviewerId)
        ? prev.filter(id => id !== reviewerId)
        : [...prev, reviewerId]
    );
  };

  const handleSubmit = async () => {
    if (selectedReviewers.length === 0) {
      setError('Please select at least one reviewer');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await reviewAPI.assignPaperReview(paperId, selectedReviewers);
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error assigning paper:', err);
      setError(err.response?.data?.error || 'Failed to assign paper for review');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  console.log('Rendering modal with overlay');

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div className="modal-content" style={{
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 10px 20px rgba(0,0,0,0.15)',
        maxWidth: '500px',
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto'
      }}>
        <div className="modal-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.5rem',
          borderBottom: '1px solid #e0e0e0'
        }}>
          <h2 style={{ margin: 0, color: '#1a1a1a' }}>Send Paper for Review</h2>
          <button 
            className="close-btn" 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#666666'
            }}
          >&times;</button>
        </div>

        <div className="modal-body" style={{ padding: '1.5rem' }}>
          <p>Select reviewers to send this paper for review:</p>
          
          {error && <div className="error-message" style={{
            background: '#ef5350',
            color: '#d32f2f',
            padding: '0.75rem',
            borderRadius: '8px',
            marginBottom: '1rem'
          }}>{error}</div>}
          
          <div className="reviewers-list" style={{
            maxHeight: '300px',
            overflowY: 'auto',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            padding: '0.5rem'
          }}>
            {reviewers.map((reviewer) => (
              <div key={reviewer.r_id} className="reviewer-item" style={{
                padding: '0.5rem',
                borderBottom: '1px solid #e0e0e0'
              }}>
                <label className="checkbox-label" style={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  gap: '0.75rem'
                }}>
                  <input
                    type="checkbox"
                    checked={selectedReviewers.includes(reviewer.r_id)}
                    onChange={() => handleReviewerToggle(reviewer.r_id)}
                  />
                  <span className="reviewer-info" style={{
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    <strong>{reviewer.name}</strong>
                    <span className="email" style={{ color: '#666666', fontSize: '0.875rem' }}>{reviewer.email}</span>
                  </span>
                </label>
              </div>
            ))}
          </div>

          {reviewers.length === 0 && (
            <div className="no-reviewers">
              <p>No reviewers available. Please contact an administrator.</p>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '1rem',
          padding: '1.5rem',
          borderTop: '1px solid #e0e0e0'
        }}>
          <button 
            className="btn btn-secondary" 
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #e0e0e0',
              borderRadius: '4px',
              background: 'white',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleSubmit}
            disabled={loading || selectedReviewers.length === 0}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '4px',
              background: selectedReviewers.length === 0 ? '#ccc' : '#1976d2',
              color: 'white',
              cursor: selectedReviewers.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Sending...' : `Send to ${selectedReviewers.length} Reviewer(s)`}
          </button>
        </div>
      </div>
    </div>
  );
} 