import React, { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Line, Text } from 'react-konva';
import './PDFViewer.css';

const PDFViewer = ({
  pdfHandler,
  currentPage,
  scale,
  annotations,
  currentTool,
  penColor,
  penSize,
  onAnnotationAdd,
  onAnnotationUpdate,
  onAnnotationDelete,
  showTextInput,
  textInputPosition,
  textInputValue,
  onTextInputChange,
  onTextInputSubmit
}) => {
  const containerRef = useRef();
  const canvasRef = useRef();
  const [pageCanvas, setPageCanvas] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [isDrawing, setIsDrawing] = useState(false);

  // Load and render PDF page
  useEffect(() => {
    const loadPage = async () => {
      if (pdfHandler && currentPage) {
        try {
          // Get the actual PDF page size in points
          const pdfPageSize = await pdfHandler.getPDFPageSize(currentPage);
          setCanvasSize({
            width: pdfPageSize.width,
            height: pdfPageSize.height
          });

          // Render the page at scale 1.0 (actual size)
          const canvas = await pdfHandler.renderPage(currentPage);
          setPageCanvas(canvas);
        } catch (error) {
          console.error('Error loading PDF page:', error);
        }
      }
    };

    loadPage();
  }, [pdfHandler, currentPage, scale]);

  // Handle canvas interactions
  const handleStageClick = (e) => {
    if (currentTool === 'text') {
      const pos = e.target.getStage().getPointerPosition();
      onAnnotationAdd('text', { x: pos.x, y: pos.y });
    }
  };

  const handleMouseDown = (e) => {
    if (currentTool === 'pen') {
      setIsDrawing(true);
      const pos = e.target.getStage().getPointerPosition();
      console.log('Mouse down at:', pos);
      onAnnotationAdd('drawing', { 
        points: [pos.x, pos.y], 
        color: penColor, 
        size: penSize 
      });
    }
  };

  const handleMouseMove = (e) => {
    if (currentTool === 'pen' && isDrawing && annotations.length > 0) {
      const lastAnnotation = annotations[annotations.length - 1];
      if (lastAnnotation.type === 'drawing') {
        const pos = e.target.getStage().getPointerPosition();
        console.log('Mouse move at:', pos);
        const updatedPoints = [...lastAnnotation.data.points, pos.x, pos.y];
        console.log('Updated points:', updatedPoints);
        onAnnotationUpdate(lastAnnotation.id, {
          ...lastAnnotation.data,
          points: updatedPoints
        });
      }
    }
  };

  const handleMouseUp = (e) => {
    if (currentTool === 'pen' && isDrawing) {
      console.log('Mouse up, final points:', annotations[annotations.length - 1]?.data?.points);
    }
    setIsDrawing(false);
  };

  const handleTextDragEnd = (annotationId, newPosition) => {
    onAnnotationUpdate(annotationId, {
      ...annotations.find(ann => ann.id === annotationId).data,
      x: newPosition.x,
      y: newPosition.y
    });
  };

  if (!pageCanvas) {
    return (
      <div className="pdf-viewer">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading PDF page...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-viewer" ref={containerRef}>
      <div className="pdf-container">
        {/* PDF Page Canvas */}
        <div className="pdf-page">
          <img
            ref={canvasRef}
            src={pageCanvas.toDataURL()}
            alt={`PDF Page ${currentPage}`}
            style={{
              width: `${canvasSize.width}px`,
              height: `${canvasSize.height}px`,
              display: 'block'
            }}
          />
        </div>

        {/* Annotation Canvas Overlay */}
        <div className="annotation-overlay">
          <Stage
            width={canvasSize.width}
            height={canvasSize.height}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onClick={handleStageClick}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: 'auto',
              zIndex: 10
            }}
          >
            <Layer>
              {/* Drawing annotations */}
              {annotations
                .filter(ann => ann.type === 'drawing')
                .map((annotation, i) => (
                  <Line
                    key={annotation.id}
                    points={annotation.data.points}
                    stroke={annotation.data.color}
                    strokeWidth={annotation.data.size}
                    tension={0.5}
                    lineCap="round"
                    lineJoin="round"
                  />
                ))}

              {/* Text annotations */}
              {annotations
                .filter(ann => ann.type === 'text')
                .map((annotation) => (
                  <Text
                    key={annotation.id}
                    x={annotation.data.x}
                    y={annotation.data.y}
                    text={annotation.data.text}
                    fontSize={annotation.data.fontSize}
                    fill={annotation.data.color}
                    draggable
                    onDragEnd={(e) => handleTextDragEnd(annotation.id, {
                      x: e.target.x(),
                      y: e.target.y()
                    })}
                  />
                ))}
            </Layer>
          </Stage>

          {/* Text input overlay */}
          {showTextInput && (
            <div
              className="text-input-overlay"
              style={{
                position: 'absolute',
                left: textInputPosition.x,
                top: textInputPosition.y,
                zIndex: 1000
              }}
            >
              <input
                type="text"
                value={textInputValue}
                onChange={(e) => onTextInputChange(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    onTextInputSubmit();
                  }
                }}
                onBlur={onTextInputSubmit}
                autoFocus
                placeholder="Enter annotation text..."
                className="annotation-text-input"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PDFViewer; 