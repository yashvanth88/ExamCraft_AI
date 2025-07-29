import React from 'react';
import './Toolbar.css';

const Toolbar = ({ 
  currentTool, 
  setCurrentTool, 
  penColor, 
  setPenColor, 
  penSize, 
  setPenSize,
  onUpload,
  onClear,
  onDownload,
  onExportPDF,
  onSaveCurrentPDF,
  onDownloadCurrentPDF,
  fileInputRef,
  currentPage,
  totalPages,
  onPageChange,
  scale,
  onScaleChange,
  onBackToSelector,
  selectedPDF,
  serverAvailable
}) => {
  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <button onClick={onBackToSelector} className="back-btn" title="Back to PDF selection">
          ← Back
        </button>
        {selectedPDF && (
          <div className="selected-pdf-info">
            <span className="pdf-name">{selectedPDF.name}</span>
          </div>
        )}
      </div>

      <div className="toolbar-section">
        <input
          type="file"
          accept=".pdf"
          onChange={onUpload}
          ref={fileInputRef}
          style={{ display: 'none' }}
        />
        <button onClick={() => fileInputRef.current.click()} className="upload-btn">
          📄 Upload PDF
        </button>
      </div>

      <div className="toolbar-section">
        <div className="tool-selector">
          <button
            className={`tool-btn ${currentTool === 'text' ? 'active' : ''}`}
            onClick={() => setCurrentTool('text')}
            title="Add text annotations"
          >
            📝 Text
          </button>
          <button
            className={`tool-btn ${currentTool === 'pen' ? 'active' : ''}`}
            onClick={() => setCurrentTool('pen')}
            title="Draw freehand"
          >
            ✏️ Pen
          </button>
          <button
            className={`tool-btn ${currentTool === 'eraser' ? 'active' : ''}`}
            onClick={() => setCurrentTool('eraser')}
            title="Erase annotations"
          >
            🧽 Eraser
          </button>
        </div>
      </div>

      <div className="toolbar-section">
        <div className="pen-controls">
          <input
            type="color"
            value={penColor}
            onChange={(e) => setPenColor(e.target.value)}
            title="Annotation Color"
            className="color-picker"
          />
          <div className="size-control">
            <input
              type="range"
              min="1"
              max="20"
              value={penSize}
              onChange={(e) => setPenSize(parseInt(e.target.value))}
              title="Pen Size"
              className="size-slider"
            />
            <span className="size-label">{penSize}px</span>
          </div>
        </div>
      </div>

      {totalPages > 0 && (
        <div className="toolbar-section">
          <div className="page-controls">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="page-btn"
            >
              ◀
            </button>
            <span className="page-info">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="page-btn"
            >
              ▶
            </button>
          </div>
        </div>
      )}

      <div className="toolbar-section">
        <div className="scale-controls">
          <button
            onClick={() => onScaleChange(scale - 0.25)}
            disabled={scale <= 0.5}
            className="scale-btn"
            title="Zoom Out"
          >
            🔍-
          </button>
          <span className="scale-label">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => onScaleChange(scale + 0.25)}
            disabled={scale >= 3.0}
            className="scale-btn"
            title="Zoom In"
          >
            🔍+
          </button>
        </div>
      </div>

      <div className="toolbar-section">
        <div className="action-buttons">
          <button onClick={onClear} className="clear-btn" title="Clear all annotations">
            🗑️ Clear
          </button>
          <button onClick={onDownload} className="download-btn" title="Download as image">
            💾 Image
          </button>
          <button onClick={onExportPDF} className="export-btn" title="Export as PDF">
            📄 PDF
          </button>
          <button 
            onClick={onSaveCurrentPDF} 
            className={`save-btn ${!serverAvailable ? 'disabled' : ''}`}
            title={serverAvailable ? "Save current PDF with annotations to server" : "Server not available"}
            disabled={!serverAvailable}
          >
            💾 Save to Server {!serverAvailable && '(Offline)'}
          </button>
          <button onClick={onDownloadCurrentPDF} className="download-current-btn" title="Download current PDF with annotations">
            📥 Download PDF
          </button>
          <button 
            onClick={() => {
              // Test drawing annotation
              const testPoints = [100, 100, 200, 200, 300, 100, 400, 200, 500, 100];
              console.log('Adding test drawing with points:', testPoints);
              // This would need to be passed from App component
            }} 
            className="test-btn" 
            title="Add test drawing annotation"
          >
            🧪 Test Draw
          </button>
        </div>
      </div>
    </div>
  );
};

export default Toolbar; 