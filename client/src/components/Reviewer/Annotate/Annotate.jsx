import React, { useState, useRef, useEffect } from 'react';
import Toolbar from './Toolbar';
import PDFViewer from './PDFViewer';
import AnnotationsPanel from './AnnotationsPanel';
import { useLocation, useNavigate } from 'react-router-dom';
import { PDFHandler, AnnotationManager, PDFExporter, PDF_CONSTANTS, checkServerStatus } from './pdfUtils';
import { api } from '../../../utils/api';

function Annotate() {
  const location = useLocation();
  const paper = location.state?.paper;
  const navigate = useNavigate();

  // PDF and annotation state
  const [pdfHandler, setPdfHandler] = useState(null);
  const [annotationManager] = useState(new AnnotationManager());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(PDF_CONSTANTS.DEFAULT_SCALE);
  const [isLoading, setIsLoading] = useState(false);
  const [isServerAvailable, setIsServerAvailable] = useState(true);
  const [loadingVersion, setLoadingVersion] = useState('original'); // 'original' or 'annotated'
  const [isSavingAnnotations, setIsSavingAnnotations] = useState(false);

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
    checkServerStatus().then(setIsServerAvailable);
  }, []);

  // Load PDF from backend when paper changes
  useEffect(() => {
    if (!pdfHandler || !paper?.paper_path) return;
    
    // Set current paper ID globally for the save function
    window.currentPaperId = paper.id;
    window.currentPaperPath = paper.paper_path;
    console.log('Set current paper path:', paper.paper_path);
    
    const fetchAndLoadPDF = async () => {
      setIsLoading(true);
      try {
        // First check if there's an annotated version
        let pdfPath = paper.paper_path;
        if (paper.ai_meta_data?.annotated_paper_path) {
          pdfPath = paper.ai_meta_data.annotated_paper_path;
          setLoadingVersion('annotated');
          console.log('Loading annotated version:', pdfPath);
        } else {
          setLoadingVersion('original');
          console.log('Loading original version:', pdfPath);
        }
        
        const safePath = pdfPath.startsWith('media/') || pdfPath.startsWith('generated_papers/')
          ? pdfPath
          : 'media/' + pdfPath.replace(/^\/+/, '');
        const response = await api.get('/ai/download-paper/', {
          params: { path: safePath },
          responseType: 'blob',
        });
        if (response.status !== 200) throw new Error('Failed to fetch PDF');
        const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/pdf' });
        
        // Extract original filename from paper_path
        const originalFilename = paper.paper_path ? paper.paper_path.split('/').pop() : 'paper.pdf';
        const file = new File([blob], originalFilename, { type: 'application/pdf' });
        await pdfHandler.loadPDF(file);
        setTotalPages(pdfHandler.totalPages);
        setCurrentPage(1);
        annotationManager.clearAllAnnotations();
        setAnnotations([]);
        
        // Load saved annotations after PDF is loaded
        if (paper.id) {
          await loadAnnotations(paper.id);
        }
      } catch (err) {
        alert('Failed to load PDF: ' + err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAndLoadPDF();
    // eslint-disable-next-line
  }, [pdfHandler, paper]);

  // Load annotations from server
  const loadAnnotations = async (paperId) => {
    try {
      const response = await api.get('/ai/load-annotations/', {
        params: { paper_id: paperId }
      });
      if (response.data.success && response.data.annotations) {
        setAnnotations(response.data.annotations);
        console.log(`Loaded ${response.data.annotations_count} annotations`);
      }
    } catch (error) {
      console.log('No saved annotations found or error loading:', error.message);
    }
  };

  // Save annotations to server
  const saveAnnotations = async (paperId, annotationsToSave) => {
    setIsSavingAnnotations(true);
    try {
      const response = await api.post('/ai/save-annotations/', {
        paper_id: paperId,
        annotations: annotationsToSave
      });
      if (response.data.success) {
        console.log(`Saved ${response.data.annotations_count} annotations`);
      }
    } catch (error) {
      console.error('Error saving annotations:', error);
    } finally {
      setIsSavingAnnotations(false);
    }
  };

  // Annotation handlers
  const handleAnnotationAdd = (type, data) => {
    if (type === 'text') {
      setTextInputPosition(data);
      setShowTextInput(true);
      setTextInputValue('');
      return;
    }
    
    let annotation;
    if (type === 'drawing') {
      annotation = annotationManager.addDrawingAnnotation(
        data.points,
        data.color,
        data.size,
        currentPage
      );
    }
    
    if (annotation) {
      const updatedAnnotations = [...annotations, annotation];
      setAnnotations(updatedAnnotations);
      
      // Auto-save annotations
      if (paper?.id) {
        saveAnnotations(paper.id, updatedAnnotations);
      }
    }
  };

  const handleAnnotationUpdate = (id, newData) => {
    const updatedAnnotations = annotations.map(ann =>
      ann.id === id ? { ...ann, data: newData } : ann
    );
    setAnnotations(updatedAnnotations);
    annotationManager.updateAnnotation(id, newData);
    
    // Auto-save annotations
    if (paper?.id) {
      saveAnnotations(paper.id, updatedAnnotations);
    }
  };

  const handleAnnotationDelete = (id) => {
    annotationManager.removeAnnotation(id);
    const updatedAnnotations = annotations.filter(ann => ann.id !== id);
    setAnnotations(updatedAnnotations);
    
    // Auto-save annotations
    if (paper?.id) {
      saveAnnotations(paper.id, updatedAnnotations);
    }
  };

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
        16,
        currentPage
      );
      const updatedAnnotations = [...annotations, annotation];
      setAnnotations(updatedAnnotations);
      
      // Auto-save annotations
      if (paper?.id) {
        saveAnnotations(paper.id, updatedAnnotations);
      }
    }
    setShowTextInput(false);
    setTextInputValue('');
  };

  const handleClearAll = () => {
    annotationManager.clearAllAnnotations();
    setAnnotations([]);
  };

  const handleDownload = async () => {
    if (!containerRef.current) return;
    try {
      await PDFExporter.exportAsImage(containerRef.current, 'annotated-document.png');
    } catch (error) {
      alert('Error downloading image: ' + error.message);
    }
  };

  const handleExportPDF = async () => {
    if (!containerRef.current) return;
    try {
      await PDFExporter.exportAsPDF(containerRef.current, 'annotated-document.pdf');
    } catch (error) {
      alert('Error exporting PDF: ' + error.message);
    }
  };

  const handleSaveCurrentPDF = async () => {
    if (!pdfHandler || !pdfHandler.getOriginalFile()) {
      alert('No PDF loaded to save.');
      return;
    }
    
    if (!isServerAvailable) {
      alert('Server is not available. Please check your connection.');
      return;
    }
    
    try {
      console.log('All annotations before saving:', annotations);
      console.log('Drawing annotations:', annotations.filter(ann => ann.type === 'drawing'));
      console.log('Text annotations:', annotations.filter(ann => ann.type === 'text'));
      
      const originalFile = pdfHandler.getOriginalFile();
      const result = await PDFExporter.saveCurrentPDF(pdfHandler, annotationManager, originalFile, null, true);
      alert(`PDF saved successfully to server! File: ${result.filename}`);
    } catch (error) {
      console.error('Error saving current PDF:', error);
      if (error.message.includes('Server is not available')) {
        alert('Server is not available. PDF has been downloaded locally instead.');
      } else {
        alert('Error saving current PDF. Please try again.');
      }
    }
  };

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

  const isPDFLoaded = pdfHandler && pdfHandler.pdfDocument;

  if (!paper) {
    return (
      <div className="annotate-container">
        <h2>No paper selected</h2>
        <p>Please go to the Reviewer Dashboard and click "Review/Annotate" on an assigned paper.</p>
      </div>
    );
  }

  return (
    <div className="annotate-container" ref={containerRef}>
      <Toolbar
        currentTool={currentTool}
        setCurrentTool={setCurrentTool}
        penColor={penColor}
        setPenColor={setPenColor}
        penSize={penSize}
        setPenSize={setPenSize}
        onUpload={() => {}}
        onClear={handleClearAll}
        onDownload={handleDownload}
        onExportPDF={handleExportPDF}
        onSaveCurrentPDF={handleSaveCurrentPDF}
        onDownloadCurrentPDF={handleDownloadCurrentPDF}
        fileInputRef={fileInputRef}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        scale={scale}
        onScaleChange={setScale}
        onBackToSelector={() => navigate('/reviewer')}
        selectedPDF={{ name: paper.paper_title || 'Paper' }}
        serverAvailable={isServerAvailable}
      />
      <div className="main-content">
        {isLoading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading {loadingVersion} version...</p>
          </div>
        ) : (
          <>
            {loadingVersion === 'annotated' && (
              <div className="version-indicator">
                <span className="annotated-badge">📝 Annotated Version</span>
              </div>
            )}
            {isSavingAnnotations && (
              <div className="saving-indicator">
                <span className="saving-badge">💾 Saving annotations...</span>
              </div>
            )}
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
          </>
        )}
        <AnnotationsPanel
          annotations={annotations}
          onDeleteAnnotation={handleAnnotationDelete}
          onClearAll={handleClearAll}
        />
      </div>
    </div>
  );
}

export default Annotate; 