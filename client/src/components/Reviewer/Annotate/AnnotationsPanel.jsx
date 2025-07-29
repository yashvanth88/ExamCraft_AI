import React from 'react';
import './AnnotationsPanel.css';

const AnnotationsPanel = ({ annotations, onDeleteAnnotation, onClearAll }) => {
  const textAnnotations = annotations.filter(ann => ann.type === 'text');
  const drawingAnnotations = annotations.filter(ann => ann.type === 'drawing');

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className="annotations-panel">
      <div className="panel-header">
        <h3>Annotations</h3>
        {annotations.length > 0 && (
          <button onClick={onClearAll} className="clear-all-btn" title="Clear all annotations">
            🗑️ Clear All
          </button>
        )}
      </div>

      <div className="annotations-content">
        {annotations.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📝</div>
            <p>No annotations yet</p>
            <small>Use the tools above to add annotations</small>
          </div>
        ) : (
          <>
            {/* Text Annotations */}
            {textAnnotations.length > 0 && (
              <div className="annotation-section">
                <h4>Text Annotations ({textAnnotations.length})</h4>
                <div className="annotation-list">
                  {textAnnotations.map((annotation) => (
                    <div key={annotation.id} className="annotation-item text-annotation">
                      <div className="annotation-content">
                        <div className="annotation-text">{annotation.data.text}</div>
                        <div className="annotation-meta">
                          <span className="annotation-time">
                            {formatTimestamp(annotation.timestamp)}
                          </span>
                          <div 
                            className="annotation-color" 
                            style={{ backgroundColor: annotation.data.color }}
                          ></div>
                        </div>
                      </div>
                      <button
                        onClick={() => onDeleteAnnotation(annotation.id)}
                        className="delete-btn"
                        title="Delete annotation"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Drawing Annotations */}
            {drawingAnnotations.length > 0 && (
              <div className="annotation-section">
                <h4>Drawing Annotations ({drawingAnnotations.length})</h4>
                <div className="annotation-list">
                  {drawingAnnotations.map((annotation) => (
                    <div key={annotation.id} className="annotation-item drawing-annotation">
                      <div className="annotation-content">
                        <div className="annotation-text">
                          Drawing ({annotation.data.points.length / 2} points)
                        </div>
                        <div className="annotation-meta">
                          <span className="annotation-time">
                            {formatTimestamp(annotation.timestamp)}
                          </span>
                          <div 
                            className="annotation-color" 
                            style={{ backgroundColor: annotation.data.color }}
                          ></div>
                          <span className="annotation-size">
                            {annotation.data.size}px
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => onDeleteAnnotation(annotation.id)}
                        className="delete-btn"
                        title="Delete annotation"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Summary */}
      {annotations.length > 0 && (
        <div className="panel-summary">
          <div className="summary-item">
            <span className="summary-label">Total:</span>
            <span className="summary-value">{annotations.length}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Text:</span>
            <span className="summary-value">{textAnnotations.length}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Drawings:</span>
            <span className="summary-value">{drawingAnnotations.length}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnotationsPanel; 