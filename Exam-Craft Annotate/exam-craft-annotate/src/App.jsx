import React, { useState, useRef, useEffect } from 'react';
import Toolbar from './components/Toolbar';
import PDFViewer from './components/PDFViewer';
import AnnotationsPanel from './components/AnnotationsPanel';
import PDFSelector from './components/PDFSelector';
import { PDFHandler, AnnotationManager, PDFExporter, PDF_CONSTANTS, checkServerStatus } from './utils/pdfUtils';
import './App.css';

function App() {
  // PDF and document state
  const [pdfHandler, setPdfHandler] = useState(null);
  const [annotationManager] = useState(new AnnotationManager());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(PDF_CONSTANTS.DEFAULT_SCALE);
  const [isLoading, setIsLoading] = useState(false);
  const [showPDFSelector, setShowPDFSelector] = useState(true);
  const [selectedPDF, setSelectedPDF] = useState(null);
  const [serverAvailable, setServerAvailable] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Tool state
  const [currentTool, setCurrentTool] = useState('text');
  const [penColor, setPenColor] = useState('#000000');
  const [penSize, setPenSize] = useState(2);

  // Annotation state
  const [annotations, setAnnotations] = useState([]);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInputPosition, setTextInputPosition] = useState({ x: 0, y: 0 });
  const [textInputValue, setTextInputValue] = useState('');

  // Refs
  const fileInputRef = useRef();
  const containerRef = useRef();

  // Initialize PDF handler and check server status
  useEffect(() => {
    const handler = new PDFHandler();
    setPdfHandler(handler);
    
    // Check server status
    checkServerStatus().then(setServerAvailable);
  }, []);

  // Handle file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.includes('pdf')) {
      alert('Please select a PDF file.');
      return;
    }

    setIsLoading(true);
    try {
      await pdfHandler.loadPDF(file);
      setTotalPages(pdfHandler.totalPages);
      setCurrentPage(1);
      annotationManager.clearAllAnnotations();
      setAnnotations([]);
      setShowPDFSelector(false);
    } catch (error) {
      console.error('Error loading PDF:', error);
      alert('Error loading PDF file. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle PDF selection from server
  const handlePDFSelect = async (pdf) => {
    setIsLoading(true);
    try {
      const response = await fetch(pdf.url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      const file = new File([blob], pdf.name, { type: 'application/pdf' });
      
      await pdfHandler.loadPDF(file);
      setTotalPages(pdfHandler.totalPages);
      setCurrentPage(1);
      annotationManager.clearAllAnnotations();
      setAnnotations([]);
      setSelectedPDF(pdf);
      setShowPDFSelector(false);
    } catch (error) {
      console.error('Error loading PDF from server:', error);
      alert('Error loading PDF from server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle back to PDF selector
  const handleBackToSelector = () => {
    setShowPDFSelector(true);
    setSelectedPDF(null);
    setTotalPages(0);
    setCurrentPage(1);
    annotationManager.clearAllAnnotations();
    setAnnotations([]);
  };

  // Handle page change
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      pdfHandler.setPage(newPage);
    }
  };

  // Handle scale change
  const handleScaleChange = (newScale) => {
    const clampedScale = Math.max(
      PDF_CONSTANTS.MIN_SCALE,
      Math.min(PDF_CONSTANTS.MAX_SCALE, newScale)
    );
    setScale(clampedScale);
    pdfHandler.setScale(clampedScale);
  };

  // Handle annotation addition
  const handleAnnotationAdd = (type, data) => {
    let annotation;
    
    if (type === 'text') {
      setTextInputPosition(data);
      setShowTextInput(true);
      setTextInputValue('');
      return;
    } else if (type === 'drawing') {
      annotation = annotationManager.addDrawingAnnotation(
        data.points,
        data.color,
        data.size
      );
    }

    if (annotation) {
      setAnnotations([...annotations, annotation]);
    }
  };

  // Handle annotation update
  const handleAnnotationUpdate = (id, newData) => {
    // Update React state
    const updatedAnnotations = annotations.map(ann => 
      ann.id === id ? { ...ann, data: newData } : ann
    );
    setAnnotations(updatedAnnotations);
    
    // Also update the annotation manager
    annotationManager.updateAnnotation(id, newData);
  };

  // Handle annotation deletion
  const handleAnnotationDelete = (id) => {
    annotationManager.removeAnnotation(id);
    setAnnotations(annotations.filter(ann => ann.id !== id));
  };

  // Handle text input
  const handleTextInputChange = (value) => {
    setTextInputValue(value);
  };

  const handleTextInputSubmit = () => {
    if (textInputValue.trim()) {
      const annotation = annotationManager.addTextAnnotation(
        textInputPosition.x,
        textInputPosition.y,
        textInputValue,
        penColor,
        16
      );
      setAnnotations([...annotations, annotation]);
      setShowTextInput(false);
      setTextInputValue('');
    }
  };

  // Handle clear all annotations
  const handleClearAll = () => {
    annotationManager.clearAllAnnotations();
    setAnnotations([]);
  };

  // Handle download as image
  const handleDownload = async () => {
    if (!containerRef.current) return;
    
    try {
      await PDFExporter.exportAsImage(containerRef.current, 'annotated-document.png');
    } catch (error) {
      console.error('Error downloading image:', error);
      alert('Error downloading image. Please try again.');
    }
  };

  // Handle export as PDF
  const handleExportPDF = async () => {
    if (!containerRef.current) return;
    
    try {
      await PDFExporter.exportAsPDF(containerRef.current, 'annotated-document.pdf');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Error exporting PDF. Please try again.');
    }
  };

  // Handle save current PDF to server
  const handleSaveCurrentPDF = async () => {
    if (!pdfHandler || !pdfHandler.getOriginalFile()) {
      alert('No PDF loaded to save.');
      return;
    }
    
    if (!serverAvailable) {
      alert('Server is not available. Please start the server first.');
      return;
    }
    
    try {
      // Debug: Log all annotations before saving
      console.log('All annotations before saving:', annotations);
      console.log('Drawing annotations:', annotations.filter(ann => ann.type === 'drawing'));
      console.log('Text annotations:', annotations.filter(ann => ann.type === 'text'));
      
      // Test: Add a simple drawing annotation if none exist
      if (annotations.filter(ann => ann.type === 'drawing').length === 0) {
        console.log('No drawing annotations found, adding test annotation...');
        const testAnnotation = annotationManager.addDrawingAnnotation(
          [100, 100, 200, 200, 300, 100], // Simple triangle
          '#ff0000',
          3
        );
        console.log('Test drawing annotation added:', testAnnotation);
      }
      
      const originalFile = pdfHandler.getOriginalFile();
      const result = await PDFExporter.saveCurrentPDF(pdfHandler, annotationManager, originalFile, null, true);
      alert(`PDF saved successfully to server! File: ${result.filename}`);
      // Trigger refresh of PDF list
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Error saving current PDF:', error);
      if (error.message.includes('Server is not available')) {
        alert('Server is not available. PDF has been downloaded locally instead.');
      } else {
        alert('Error saving current PDF. Please try again.');
      }
    }
  };

  // Handle download current PDF locally
  const handleDownloadCurrentPDF = async () => {
    if (!pdfHandler || !pdfHandler.getOriginalFile()) {
      alert('No PDF loaded to download.');
      return;
    }
    
    try {
      const originalFile = pdfHandler.getOriginalFile();
      const filename = `annotated-${originalFile.name}`;
      await PDFExporter.saveCurrentPDF(pdfHandler, annotationManager, originalFile, filename, false);
      alert('PDF downloaded successfully with annotations!');
    } catch (error) {
      console.error('Error downloading current PDF:', error);
      alert('Error downloading current PDF. Please try again.');
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Exam-Craft Annotate</h1>
        {!showPDFSelector && (
          <Toolbar
            currentTool={currentTool}
            setCurrentTool={setCurrentTool}
            penColor={penColor}
            setPenColor={setPenColor}
            penSize={penSize}
            setPenSize={setPenSize}
            onUpload={handleFileUpload}
            onClear={handleClearAll}
            onDownload={handleDownload}
            onExportPDF={handleExportPDF}
            onSaveCurrentPDF={handleSaveCurrentPDF}
            onDownloadCurrentPDF={handleDownloadCurrentPDF}
            fileInputRef={fileInputRef}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            scale={scale}
            onScaleChange={handleScaleChange}
            onBackToSelector={handleBackToSelector}
            selectedPDF={selectedPDF}
            serverAvailable={serverAvailable}
          />
        )}
      </header>

      <div className="main-content">
        {showPDFSelector ? (
          <PDFSelector onPDFSelect={handlePDFSelect} refreshTrigger={refreshTrigger} />
        ) : (
          <>
            <div className="document-container" ref={containerRef}>
              {isLoading ? (
                <div className="loading-container">
                  <div className="loading-spinner"></div>
                  <p>Loading PDF...</p>
                </div>
              ) : totalPages > 0 ? (
                <PDFViewer
                  pdfHandler={pdfHandler}
                  currentPage={currentPage}
                  scale={scale}
                  annotations={annotations}
                  currentTool={currentTool}
                  penColor={penColor}
                  penSize={penSize}
                  onAnnotationAdd={handleAnnotationAdd}
                  onAnnotationUpdate={handleAnnotationUpdate}
                  onAnnotationDelete={handleAnnotationDelete}
                  showTextInput={showTextInput}
                  textInputPosition={textInputPosition}
                  textInputValue={textInputValue}
                  onTextInputChange={handleTextInputChange}
                  onTextInputSubmit={handleTextInputSubmit}
                />
              ) : (
                <div className="upload-prompt">
                  <h2>Upload a PDF Document to Start Annotating</h2>
                  <p>Click the "Upload PDF" button above to get started</p>
                  <div className="upload-icon">📄</div>
                </div>
              )}
            </div>

            <AnnotationsPanel
              annotations={annotations}
              onDeleteAnnotation={handleAnnotationDelete}
              onClearAll={handleClearAll}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default App;
