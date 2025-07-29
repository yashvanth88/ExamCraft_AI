import * as pdfjsLib from 'pdfjs-dist';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// Set up PDF.js worker - try local first, then CDN fallback
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

export class PDFHandler {
  constructor() {
    this.pdfDocument = null;
    this.currentPage = 1;
    this.totalPages = 0;
    this.scale = 1.0;
    this.originalFile = null;
    this.canvasDimensions = { width: 800, height: 600 };
  }

  async loadPDF(file) {
    try {
      console.log('Loading PDF file:', file.name, 'Size:', file.size);
      
      // Store the original file reference
      this.originalFile = file;
      
      const arrayBuffer = await file.arrayBuffer();
      console.log('ArrayBuffer created, size:', arrayBuffer.byteLength);
      
      // Use the latest PDF.js API
      const loadingTask = pdfjsLib.getDocument({
        data: arrayBuffer,
        verbosity: 0
      });
      
      this.pdfDocument = await loadingTask.promise;
      this.totalPages = this.pdfDocument.numPages;
      
      console.log('PDF loaded successfully. Pages:', this.totalPages);
      return this.pdfDocument;
    } catch (error) {
      console.error('Detailed error loading PDF:', error);
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      throw new Error(`Failed to load PDF file: ${error.message}`);
    }
  }

  async renderPage(pageNumber = 1) {
    if (!this.pdfDocument) {
      throw new Error('No PDF document loaded');
    }

    try {
      const page = await this.pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale: this.scale });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Store canvas dimensions for coordinate conversion
      this.canvasDimensions = {
        width: canvas.width,
        height: canvas.height
      };

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };

      await page.render(renderContext).promise;
      return canvas;
    } catch (error) {
      console.error('Error rendering PDF page:', error);
      throw new Error('Failed to render PDF page');
    }
  }

  async renderAllPages() {
    if (!this.pdfDocument) {
      throw new Error('No PDF document loaded');
    }

    const pages = [];
    for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
      const canvas = await this.renderPage(pageNum);
      pages.push(canvas);
    }
    return pages;
  }

  getPageInfo() {
    return {
      currentPage: this.currentPage,
      totalPages: this.totalPages,
      scale: this.scale
    };
  }

  setScale(newScale) {
    this.scale = newScale;
  }

  setPage(pageNumber) {
    if (pageNumber >= 1 && pageNumber <= this.totalPages) {
      this.currentPage = pageNumber;
    }
  }

  getOriginalFile() {
    return this.originalFile;
  }

  getCanvasDimensions() {
    return this.canvasDimensions;
  }

  async getPDFPageSize(pageNumber = 1) {
    if (!this.pdfDocument) throw new Error('No PDF document loaded');
    const page = await this.pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.0 });
    return { width: viewport.width, height: viewport.height };
  }
}

export class AnnotationManager {
  constructor() {
    this.annotations = [];
    this.currentId = 0;
  }

  addAnnotation(type, data) {
    const annotation = {
      id: ++this.currentId,
      type,
      data,
      timestamp: Date.now()
    };
    this.annotations.push(annotation);
    return annotation;
  }

  addTextAnnotation(x, y, text, color = '#000000', fontSize = 16) {
    return this.addAnnotation('text', {
      x,
      y,
      text,
      color,
      fontSize
    });
  }

  addDrawingAnnotation(points, color = '#000000', size = 2) {
    return this.addAnnotation('drawing', {
      points,
      color,
      size
    });
  }

  removeAnnotation(id) {
    this.annotations = this.annotations.filter(ann => ann.id !== id);
  }

  updateAnnotation(id, newData) {
    const annotation = this.annotations.find(ann => ann.id === id);
    if (annotation) {
      annotation.data = newData;
    }
  }

  clearAllAnnotations() {
    this.annotations = [];
    this.currentId = 0;
  }

  getAnnotations() {
    return this.annotations;
  }

  getAnnotationsByType(type) {
    return this.annotations.filter(ann => ann.type === type);
  }
}

export class PDFExporter {
  static async createAnnotatedPDF(pdfHandler, annotationManager, containerElement) {
    try {
      // Create a new PDF document
      const pdf = new jsPDF();
      
      // Get all pages from the original PDF
      const pages = await pdfHandler.renderAllPages();
      
      for (let i = 0; i < pages.length; i++) {
        if (i > 0) {
          pdf.addPage();
        }

        const canvas = pages[i];
        const imgData = canvas.toDataURL('image/png');
        
        // Add the page image to PDF
        const imgWidth = pdf.internal.pageSize.getWidth();
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);

        // Add annotations for this page
        const annotations = annotationManager.getAnnotations();
        annotations.forEach(annotation => {
          if (annotation.type === 'text') {
            const { x, y, text, color, fontSize } = annotation.data;
            pdf.setTextColor(color);
            pdf.setFontSize(fontSize);
            pdf.text(text, x, y);
          }
          // Note: Drawing annotations would need more complex handling
        });
      }

      return pdf;
    } catch (error) {
      console.error('Error creating annotated PDF:', error);
      throw new Error('Failed to create annotated PDF');
    }
  }

  static async exportAsImage(containerElement, filename = 'annotated-document.png') {
    try {
      const canvas = await html2canvas(containerElement, {
        allowTaint: true,
        useCORS: true,
        scale: 2,
        backgroundColor: '#ffffff'
      });

      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL();
      link.click();
    } catch (error) {
      console.error('Error exporting as image:', error);
      throw new Error('Failed to export as image');
    }
  }

  static async exportAsPDF(containerElement, filename = 'annotated-document.pdf') {
    try {
      const canvas = await html2canvas(containerElement, {
        allowTaint: true,
        useCORS: true,
        scale: 2,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF();
      
      const imgWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save(filename);
    } catch (error) {
      console.error('Error exporting as PDF:', error);
      throw new Error('Failed to export as PDF');
    }
  }

  static async saveCurrentPDF(pdfHandler, annotationManager, originalFile, filename = null, saveToServer = false) {
    try {
      console.log('Starting to save current PDF with annotations...');
      
      // Get the original PDF bytes
      const originalArrayBuffer = await originalFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(originalArrayBuffer);
      
      // Get all pages
      const pages = pdfDoc.getPages();
      
      // Get annotations for the current page
      const annotations = annotationManager.getAnnotations();
      console.log('Annotations to add:', annotations);
      
      // Embed the standard font for text annotations
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      // Get PDF page dimensions for coordinate conversion
      const pdfPage = pages[0]; // Assuming single page for now
      const pdfWidth = pdfPage.getWidth();
      const pdfHeight = pdfPage.getHeight();
      
      console.log('PDF dimensions:', { width: pdfWidth, height: pdfHeight });
      
      // Process each page
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const page = pages[pageIndex];
        const pageNumber = pageIndex + 1;
        
        // Filter annotations for this page (for now, assume all annotations are on current page)
        const pageAnnotations = annotations.filter(ann => {
          // For simplicity, we'll add all annotations to the current page
          // In a more sophisticated implementation, you'd track which page each annotation belongs to
          return true;
        });
        
        // Add text annotations
        pageAnnotations.forEach(annotation => {
          if (annotation.type === 'text') {
            const { x, y, text, color, fontSize } = annotation.data;
            
            // Validate coordinates
            if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
              console.warn('Invalid text annotation coordinates:', { x, y, text });
              return;
            }
            
            console.log('Processing text annotation:', { x, y, text, fontSize });
            
            // Convert color from hex to RGB
            const rgbColor = this.hexToRgb(color);
            
            // Convert coordinates from canvas to PDF coordinates
            // Canvas coordinates are relative to the canvas size
            // PDF coordinates are in points (1/72 inch)
            const canvasDimensions = pdfHandler.getCanvasDimensions();
            const canvasWidth = canvasDimensions.width;
            const canvasHeight = canvasDimensions.height;
            
            console.log('Canvas dimensions:', canvasDimensions);
            
            // Calculate scale factors
            const scaleX = pdfWidth / canvasWidth;
            const scaleY = pdfHeight / canvasHeight;
            
            // Convert coordinates
            const pdfX = x * scaleX;
            const pdfY = pdfHeight - (y * scaleY); // Flip Y coordinate (PDF origin is bottom-left)
            
            console.log('Coordinate conversion:', { 
              canvas: { x, y }, 
              pdf: { x: pdfX, y: pdfY },
              scale: { x: scaleX, y: scaleY }
            });
            
            // Ensure coordinates are within page bounds
            const clampedX = Math.max(10, Math.min(pdfX, pdfWidth - 10));
            const clampedY = Math.max(10, Math.min(pdfY, pdfHeight - 10));
            
            page.drawText(text, {
              x: clampedX,
              y: clampedY,
              size: Math.max(8, fontSize * scaleY), // Scale font size proportionally
              font: font,
              color: rgb(rgbColor.r / 255, rgbColor.g / 255, rgbColor.b / 255)
            });
                    } else if (annotation.type === 'drawing') {
            // Handle drawing annotations
            const { points, color, size } = annotation.data;
            
            console.log('Processing drawing annotation:', { points: points?.length, color, size });
            console.log('Raw points array:', points);
            
            if (points && points.length >= 4) { // Need at least 2 points (x,y pairs)
              // Convert color from hex to RGB
              const rgbColor = this.hexToRgb(color);
              
              // Convert points array to coordinate pairs
              const coordinatePairs = [];
              for (let i = 0; i < points.length; i += 2) {
                if (i + 1 < points.length) {
                  const x = points[i];
                  const y = points[i + 1];
                  if (typeof x === 'number' && typeof y === 'number' && !isNaN(x) && !isNaN(y)) {
                    coordinatePairs.push({ x, y });
                  }
                }
              }
              
              console.log('Coordinate pairs:', coordinatePairs);
              
              if (coordinatePairs.length > 1) {
                // Convert points to PDF coordinates with validation
                const canvasDimensions = pdfHandler.getCanvasDimensions();
                const canvasWidth = canvasDimensions.width;
                const canvasHeight = canvasDimensions.height;
                const scaleX = pdfWidth / canvasWidth;
                const scaleY = pdfHeight / canvasHeight;
                
                console.log('Canvas dimensions:', canvasDimensions);
                console.log('Scale factors:', { scaleX, scaleY });
                
                const pdfPoints = coordinatePairs.map(point => ({
                  x: Math.max(0, Math.min(point.x * scaleX, pdfWidth)),
                  y: Math.max(0, Math.min(pdfHeight - (point.y * scaleY), pdfHeight)) // Flip Y coordinate
                }));
                
                console.log('PDF points:', pdfPoints);
                
                // Draw line segments using paths
                for (let i = 0; i < pdfPoints.length - 1; i++) {
                  const start = pdfPoints[i];
                  const end = pdfPoints[i + 1];
                  
                  console.log(`Drawing line ${i}: (${start.x}, ${start.y}) to (${end.x}, ${end.y})`);
                  
                  // Use drawLine method
                  try {
                    page.drawLine({
                      start: { x: start.x, y: start.y },
                      end: { x: end.x, y: end.y },
                      thickness: Math.max(1, size * scaleY),
                      color: rgb(rgbColor.r / 255, rgbColor.g / 255, rgbColor.b / 255)
                    });
                  } catch (lineError) {
                    console.warn('drawLine failed, trying alternative method:', lineError);
                    
                    // Alternative: Draw as a path
                    const path = page.drawPath(`M ${start.x} ${start.y} L ${end.x} ${end.y}`);
                    path.setStrokeColor(rgb(rgbColor.r / 255, rgbColor.g / 255, rgbColor.b / 255));
                    path.setStrokeWidth(Math.max(1, size * scaleY));
                  }
                }
              } else {
                console.warn('Not enough valid coordinate pairs for drawing');
              }
            } else {
              console.warn('Not enough points for drawing annotation:', points);
            }
          }
        });
      }
      
      // Save the modified PDF
      const modifiedPdfBytes = await pdfDoc.save();
      
      if (saveToServer) {
        // Send to server
        const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
        const formData = new FormData();
        formData.append('pdf', blob, originalFile.name);
        
        try {
          const response = await fetch('http://localhost:3001/api/pdfs/save', {
            method: 'POST',
            body: formData
          });
          
          if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
          }
          
          const result = await response.json();
          console.log('PDF saved to server:', result);
          return result;
        } catch (error) {
          console.error('Server save failed, falling back to local download:', error);
          // Fallback to local download if server is not available
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `annotated-${originalFile.name}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          
          throw new Error('Server is not available. PDF has been downloaded locally instead.');
        }
      } else {
        // Download locally
        const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || `annotated-${originalFile.name}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        URL.revokeObjectURL(url);
        
        console.log('PDF saved locally with annotations');
        return true;
      }
    } catch (error) {
      console.error('Error saving current PDF:', error);
      throw new Error('Failed to save current PDF with annotations');
    }
  }

  static hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }
}

export const PDF_CONSTANTS = {
  DEFAULT_SCALE: 1.0,
  MIN_SCALE: 0.5,
  MAX_SCALE: 3.0,
  SCALE_STEP: 0.25
};

// Check if server is available
export const checkServerStatus = async () => {
  try {
    const response = await fetch('http://localhost:3001/api/health');
    return response.ok;
  } catch (error) {
    console.log('Server not available:', error);
    return false;
  }
}; 