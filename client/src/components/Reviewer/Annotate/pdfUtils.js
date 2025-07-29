import * as pdfjsLib from 'pdfjs-dist';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
// 172.17.2.85
// Always use the CDN worker for PDF.js
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
    this.originalFile = file;
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, verbosity: 0 });
    this.pdfDocument = await loadingTask.promise;
    this.totalPages = this.pdfDocument.numPages;
    return this.pdfDocument;
  }
  async renderPage(pageNumber = 1) {
    if (!this.pdfDocument) throw new Error('No PDF document loaded');
    const page = await this.pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: this.scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    this.canvasDimensions = { width: canvas.width, height: canvas.height };
    const renderContext = { canvasContext: context, viewport: viewport };
    await page.render(renderContext).promise;
    return canvas;
  }
  async renderAllPages() {
    if (!this.pdfDocument) throw new Error('No PDF document loaded');
    const pages = [];
    for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
      const canvas = await this.renderPage(pageNum);
      pages.push(canvas);
    }
    return pages;
  }
  getPageInfo() {
    return { currentPage: this.currentPage, totalPages: this.totalPages, scale: this.scale };
  }
  setScale(newScale) { this.scale = newScale; }
  setPage(pageNumber) { if (pageNumber >= 1 && pageNumber <= this.totalPages) { this.currentPage = pageNumber; } }
  getOriginalFile() { return this.originalFile; }
  getCanvasDimensions() { return this.canvasDimensions; }
  async getPDFPageSize(pageNumber = 1) {
    if (!this.pdfDocument) throw new Error('No PDF document loaded');
    const page = await this.pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.0 });
    return { width: viewport.width, height: viewport.height };
  }
}

export class AnnotationManager {
  constructor() { this.annotations = []; this.currentId = 0; }
  addAnnotation(type, data, pageNumber = 1) {
    const annotation = { id: ++this.currentId, type, data, pageNumber, timestamp: Date.now() };
    this.annotations.push(annotation); return annotation;
  }
  addTextAnnotation(x, y, text, color = '#000000', fontSize = 16, pageNumber = 1) {
    return this.addAnnotation('text', { x, y, text, color, fontSize }, pageNumber);
  }
  addDrawingAnnotation(points, color = '#000000', size = 2, pageNumber = 1) {
    return this.addAnnotation('drawing', { points, color, size }, pageNumber);
  }
  removeAnnotation(id) { this.annotations = this.annotations.filter(ann => ann.id !== id); }
  updateAnnotation(id, newData) { const annotation = this.annotations.find(ann => ann.id === id); if (annotation) { annotation.data = newData; } }
  clearAllAnnotations() { this.annotations = []; this.currentId = 0; }
  getAnnotations() { return this.annotations; }
  getAnnotationsByType(type) { return this.annotations.filter(ann => ann.type === type); }
  getAnnotationsByPage(pageNumber) { return this.annotations.filter(ann => ann.pageNumber === pageNumber); }
}

export class PDFExporter {
  static async createAnnotatedPDF(pdfHandler, annotationManager, containerElement) {
    const pdf = new jsPDF();
    const pages = await pdfHandler.renderAllPages();
    for (let i = 0; i < pages.length; i++) {
      if (i > 0) { pdf.addPage(); }
      const canvas = pages[i];
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      const annotations = annotationManager.getAnnotations();
      annotations.forEach(annotation => {
        if (annotation.type === 'text') {
          const { x, y, text, color, fontSize } = annotation.data;
          pdf.setTextColor(color);
          pdf.setFontSize(fontSize);
          pdf.text(text, x, y);
        }
      });
    }
    return pdf;
  }
  static async exportAsImage(containerElement, filename = 'annotated-document.png') {
    const canvas = await html2canvas(containerElement, { allowTaint: true, useCORS: true, scale: 2, backgroundColor: '#ffffff' });
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL();
    link.click();
  }
  static async exportAsPDF(containerElement, filename = 'annotated-document.pdf') {
    const canvas = await html2canvas(containerElement, { allowTaint: true, useCORS: true, scale: 2, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF();
    const imgWidth = pdf.internal.pageSize.getWidth();
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    pdf.save(filename);
  }
  static async saveCurrentPDF(pdfHandler, annotationManager, originalFile, filename = null, saveToServer = false) {
    const originalArrayBuffer = await originalFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(originalArrayBuffer);
    const pages = pdfDoc.getPages();
    const annotations = annotationManager.getAnnotations();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pdfPage = pages[0];
    const pdfWidth = pdfPage.getWidth();
    const pdfHeight = pdfPage.getHeight();
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];
      const pageNumber = pageIndex + 1;
      const pageAnnotations = annotationManager.getAnnotationsByPage(pageNumber);
      pageAnnotations.forEach(annotation => {
        if (annotation.type === 'text') {
          const { x, y, text, color, fontSize } = annotation.data;
          if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) { return; }
          const rgbColor = this.hexToRgb(color);
          const canvasDimensions = pdfHandler.getCanvasDimensions();
          const canvasWidth = canvasDimensions.width;
          const canvasHeight = canvasDimensions.height;
          const scaleX = pdfWidth / canvasWidth;
          const scaleY = pdfHeight / canvasHeight;
          const pdfX = x * scaleX;
          const pdfY = pdfHeight - (y * scaleY);
          const clampedX = Math.max(10, Math.min(pdfX, pdfWidth - 10));
          const clampedY = Math.max(10, Math.min(pdfY, pdfHeight - 10));
          page.drawText(text, { x: clampedX, y: clampedY, size: Math.max(8, fontSize * scaleY), font: font, color: rgb(rgbColor.r / 255, rgbColor.g / 255, rgbColor.b / 255) });
        } else if (annotation.type === 'drawing') {
          const { points, color, size } = annotation.data;
          if (points && points.length >= 4) {
            const rgbColor = this.hexToRgb(color);
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
            if (coordinatePairs.length > 1) {
              const canvasDimensions = pdfHandler.getCanvasDimensions();
              const canvasWidth = canvasDimensions.width;
              const canvasHeight = canvasDimensions.height;
              const scaleX = pdfWidth / canvasWidth;
              const scaleY = pdfHeight / canvasHeight;
              const pdfPoints = coordinatePairs.map(point => ({ x: Math.max(0, Math.min(point.x * scaleX, pdfWidth)), y: Math.max(0, Math.min(pdfHeight - (point.y * scaleY), pdfHeight)) }));
              for (let i = 0; i < pdfPoints.length - 1; i++) {
                const start = pdfPoints[i];
                const end = pdfPoints[i + 1];
                try {
                  page.drawLine({ start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y }, thickness: Math.max(1, size * scaleY), color: rgb(rgbColor.r / 255, rgbColor.g / 255, rgbColor.b / 255) });
                } catch (lineError) {
                  const path = page.drawPath(`M ${start.x} ${start.y} L ${end.x} ${end.y}`);
                  path.setStrokeColor(rgb(rgbColor.r / 255, rgbColor.g / 255, rgbColor.b / 255));
                  path.setStrokeWidth(Math.max(1, size * scaleY));
                }
              }
            }
          }
        }
      });
    }
    const modifiedPdfBytes = await pdfDoc.save();
    if (saveToServer) {
      const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('pdf', blob, originalFile.name);
      
      // Get the original filename from the current paper context
      const paperId = window.currentPaperId || null;
      let originalFilename = originalFile.name;
      
      // Try to get the original filename from the paper path
      if (window.currentPaperPath) {
        const pathParts = window.currentPaperPath.split('/');
        originalFilename = pathParts[pathParts.length - 1];
        console.log('Using original filename from paper path:', originalFilename);
      } else {
        console.log('Using filename from original file:', originalFilename);
      }
      
      formData.append('original_filename', originalFilename);
      
      if (paperId) {
        formData.append('paper_id', paperId);
      }
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://172.17.2.85:8000/api/ai/save-annotated-pdf/', { 
          method: 'POST', 
          headers: {
            'Authorization': `Token ${token}`
          },
          body: formData 
        });
        if (!response.ok) { throw new Error(`Server error: ${response.status}`); }
        const result = await response.json();
        alert('Annotated PDF saved successfully! When you open this paper again, you will see your annotations.');
        return result;
      } catch (error) {
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
      const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `annotated-${originalFile.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return true;
    }
  }
  static hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 0, g: 0, b: 0 };
  }
}

export const PDF_CONSTANTS = {
  DEFAULT_SCALE: 1.0,
  MIN_SCALE: 0.5,
  MAX_SCALE: 3.0,
  SCALE_STEP: 0.25
};

export const checkServerStatus = async () => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch('http://172.17.2.85:8000/api/ai/health', {
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}; 