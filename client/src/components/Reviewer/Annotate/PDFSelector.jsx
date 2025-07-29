import React, { useState, useEffect } from 'react';
import './PDFSelector.css';

const PDFSelector = ({ onPDFSelect, refreshTrigger }) => {
  const [pdfs, setPdfs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPDF, setSelectedPDF] = useState(null);

  useEffect(() => {
    fetchPDFs();
  }, [refreshTrigger]);

  const fetchPDFs = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:3001/api/pdfs');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setPdfs(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching PDFs:', err);
      setError('Failed to load PDFs. Please make sure the server is running.');
    } finally {
      setLoading(false);
    }
  };

  const handlePDFSelect = (pdf) => {
    setSelectedPDF(pdf);
    onPDFSelect(pdf);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="pdf-selector">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading available PDFs...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pdf-selector">
        <div className="error-container">
          <div className="error-icon"></div>
          <h3>Error Loading PDFs</h3>
          <p>{error}</p>
          <button onClick={fetchPDFs} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-selector">
      <div className="pdf-selector-header">
        <h2>Select a PDF to Annotate</h2>
        <p>{pdfs.length} PDF{pdfs.length !== 1 ? 's' : ''} available</p>
        <button onClick={fetchPDFs} className="refresh-button" title="Refresh PDF list">
           Refresh
        </button>
      </div>
      
      <div className="pdf-grid">
        {pdfs.map((pdf) => (
          <div
            key={pdf.id}
            className={`pdf-card ${selectedPDF?.id === pdf.id ? 'selected' : ''}`}
            onClick={() => handlePDFSelect(pdf)}
          >
            <div className="pdf-icon"></div>
            <div className="pdf-info">
              <h3 className="pdf-name">{pdf.name}</h3>
              <p className="pdf-size">{formatFileSize(pdf.size)}</p>
              <p className="pdf-date">Modified: {formatDate(pdf.modifiedAt || pdf.createdAt)}</p>
            </div>
            <div className="pdf-actions">
              <button 
                className="select-button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePDFSelect(pdf);
                }}
              >
                Select
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {pdfs.length === 0 && (
        <div className="no-pdfs">
          <div className="no-pdfs-icon"></div>
          <h3>No PDFs Available</h3>
          <p>No PDF files found on the server.</p>
          <button onClick={fetchPDFs} className="refresh-button">
            Refresh
          </button>
        </div>
      )}
    </div>
  );
};

export default PDFSelector; 