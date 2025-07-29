import React, { useState, useEffect } from 'react';
import { reviewAPI, api } from '../../utils/api';
import Header from '../Header';
import { theme } from '../../styles/theme';
import { useNavigate } from 'react-router-dom';

const ReviewerDashboard = () => {
  const [assignedPapers, setAssignedPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAssignedPapers();
  }, []);

  const fetchAssignedPapers = async () => {
    try {
      setLoading(true);
      const response = await reviewAPI.getAssignedPapers();
      setAssignedPapers(response.papers || []);
    } catch (err) {
      console.error('Error fetching assigned papers:', err);
      setError('Failed to load assigned papers');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkReviewed = async (assignmentId) => {
    try {
      await reviewAPI.markPaperReviewed(assignmentId);
      // Refresh the list
      fetchAssignedPapers();
    } catch (err) {
      console.error('Error marking paper reviewed:', err);
      alert('Failed to mark paper as reviewed');
    }
  };

  const downloadPaper = async (paperPath) => {
    if (!paperPath) {
      alert('Paper file not available');
      return;
    }
    // Ensure the path starts with 'media/' or 'generated_papers/'
    let safePath = paperPath;
    if (!paperPath.startsWith('media/') && !paperPath.startsWith('generated_papers/')) {
      safePath = 'media/' + paperPath.replace(/^\/+/, '');
    }
    try {
      // Use the authenticated API to download the file
      const response = await api.get(`/ai/download-paper/`, {
        params: { path: safePath },
        responseType: 'blob',
      });
      // Get filename from Content-Disposition header if available
      let filename = safePath.split('/').pop() || 'question_paper.zip';
      const contentDisposition = response.headers['content-disposition'];
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match && match[1]) filename = match[1];
      }
      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading paper:', err);
      alert('Failed to download paper.');
    }
  };

  const getStatusColor = (status) => {
    return status === 'pending' ? theme.colors.warning.main : theme.colors.success.main;
  };

  const getStatusText = (status) => {
    return status === 'pending' ? 'Pending Review' : 'Reviewed';
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <Header page="Reviewer Dashboard" />
        <div className="loading">Loading assigned papers...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <Header page="Reviewer Dashboard" />
        <div className="error">{error}</div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <Header page="Reviewer Dashboard" />
      
      <div className="content">
        <div className="header-section">
          <h1>Assigned Papers for Review</h1>
          <p>Papers assigned to you for review</p>
        </div>

        {assignedPapers.length === 0 ? (
          <div className="no-papers">
            <div className="no-papers-icon">📄</div>
            <h3>No Papers Assigned</h3>
            <p>You don't have any papers assigned for review at the moment.</p>
          </div>
        ) : (
          <div className="papers-grid">
            {assignedPapers.map((paper) => (
              <div key={paper.assignment_id} className="paper-card">
                <div className="paper-header">
                  <h3>{paper.paper_title}</h3>
                  <span 
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(paper.status) }}
                  >
                    {getStatusText(paper.status)}
                  </span>
                </div>

                <div className="paper-details">
                  <div className="detail-item">
                    <strong>Course:</strong> {paper.course_name} ({paper.course_code})
                  </div>
                  <div className="detail-item">
                    <strong>Faculty:</strong> {paper.faculty_name}
                  </div>
                  <div className="detail-item">
                    <strong>Assigned:</strong> {new Date(paper.assigned_at).toLocaleDateString()}
                  </div>
                  {paper.reviewed_at && (
                    <div className="detail-item">
                      <strong>Reviewed:</strong> {new Date(paper.reviewed_at).toLocaleDateString()}
                    </div>
                  )}
                </div>

                <div className="paper-actions">
                  <button 
                    className="btn btn-primary"
                    onClick={() => downloadPaper(paper.paper_path)}
                    disabled={!paper.paper_path}
                  >
                    📥 Download Paper
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => navigate('/reviewer/annotate', { state: { paper } })}
                    disabled={!paper.paper_path}
                  >
                    📝 Review/Annotate
                  </button>
                  {paper.status === 'pending' && (
                    <button 
                      className="btn btn-success"
                      onClick={() => handleMarkReviewed(paper.assignment_id)}
                    >
                      ✅ Mark as Reviewed
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .dashboard-container {
          min-height: 100vh;
          background: ${theme.colors.background.default};
        }

        .content {
          padding: 2rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .header-section {
          margin-bottom: 2rem;
        }

        .header-section h1 {
          color: ${theme.colors.text.primary};
          margin-bottom: 0.5rem;
        }

        .header-section p {
          color: ${theme.colors.text.secondary};
          margin: 0;
        }

        .no-papers {
          text-align: center;
          padding: 4rem 2rem;
          background: white;
          border-radius: ${theme.borderRadius.lg};
          box-shadow: ${theme.shadows.md};
        }

        .no-papers-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }

        .no-papers h3 {
          color: ${theme.colors.text.primary};
          margin-bottom: 0.5rem;
        }

        .no-papers p {
          color: ${theme.colors.text.secondary};
        }

        .papers-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
          gap: 2rem;
        }

        .paper-card {
          background: white;
          border-radius: ${theme.borderRadius.lg};
          box-shadow: ${theme.shadows.md};
          overflow: hidden;
          border-top: 4px solid ${theme.colors.primary.main};
        }

        .paper-header {
          padding: 1.5rem;
          border-bottom: 1px solid ${theme.colors.border};
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .paper-header h3 {
          margin: 0;
          color: ${theme.colors.text.primary};
          flex: 1;
          margin-right: 1rem;
        }

        .status-badge {
          color: white;
          padding: 0.25rem 0.75rem;
          border-radius: ${theme.borderRadius.md};
          font-size: 0.875rem;
          font-weight: 500;
          white-space: nowrap;
        }

        .paper-details {
          padding: 1.5rem;
        }

        .detail-item {
          margin-bottom: 0.75rem;
          color: ${theme.colors.text.secondary};
        }

        .detail-item:last-child {
          margin-bottom: 0;
        }

        .detail-item strong {
          color: ${theme.colors.text.primary};
        }

        .paper-actions {
          padding: 1.5rem;
          border-top: 1px solid ${theme.colors.border};
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .btn {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: ${theme.borderRadius.md};
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-primary {
          background: ${theme.colors.primary.main};
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: ${theme.colors.primary.dark};
        }

        .btn-success {
          background: ${theme.colors.success.main};
          color: white;
        }

        .btn-success:hover:not(:disabled) {
          background: ${theme.colors.success.dark};
        }

        .loading, .error {
          text-align: center;
          padding: 4rem 2rem;
          color: ${theme.colors.text.secondary};
        }

        .error {
          color: ${theme.colors.error.main};
        }
      `}</style>
    </div>
  );
};

export default ReviewerDashboard;
