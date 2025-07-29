const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = 3001;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'pdfs'));
  },
  filename: function (req, file, cb) {
    // Keep the original filename
    cb(null, file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/pdfs', express.static(path.join(__dirname, 'pdfs')));

// Get list of available PDFs
app.get('/api/pdfs', (req, res) => {
  const pdfsDir = path.join(__dirname, 'pdfs');
  
  try {
    if (!fs.existsSync(pdfsDir)) {
      fs.mkdirSync(pdfsDir, { recursive: true });
    }
    
    const files = fs.readdirSync(pdfsDir);
    const pdfFiles = files
      .filter(file => file.toLowerCase().endsWith('.pdf'))
      .map(file => {
        const filePath = path.join(pdfsDir, file);
        const stats = fs.statSync(filePath);
        return {
          id: file.replace('.pdf', ''),
          name: file,
          url: `http://localhost:${PORT}/pdfs/${file}?t=${stats.mtime.getTime()}`, // Add timestamp for cache busting
          size: stats.size,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime
        };
      });
    
    res.json(pdfFiles);
  } catch (error) {
    console.error('Error reading PDFs directory:', error);
    res.status(500).json({ error: 'Failed to read PDFs directory' });
  }
});

// Get specific PDF by ID
app.get('/api/pdfs/:id', (req, res) => {
  const { id } = req.params;
  const pdfPath = path.join(__dirname, 'pdfs', `${id}.pdf`);
  
  if (fs.existsSync(pdfPath)) {
    res.sendFile(pdfPath);
  } else {
    res.status(404).json({ error: 'PDF not found' });
  }
});

// Save annotated PDF back to server
app.post('/api/pdfs/save', upload.single('pdf'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const filename = req.file.originalname;
    const filePath = req.file.path;
    
    console.log(`Annotated PDF saved: ${filename}`);
    console.log(`File path: ${filePath}`);
    console.log(`File size: ${req.file.size} bytes`);
    console.log(`Original file exists: ${fs.existsSync(filePath)}`);

    // Verify the file was actually saved
    if (!fs.existsSync(filePath)) {
      return res.status(500).json({ error: 'File was not saved properly' });
    }

    // Get file stats to confirm
    const stats = fs.statSync(filePath);
    console.log(`File stats - Size: ${stats.size}, Modified: ${stats.mtime}`);

    res.json({ 
      success: true, 
      message: 'PDF saved successfully',
      filename: filename,
      size: req.file.size,
      savedSize: stats.size,
      timestamp: stats.mtime
    });
  } catch (error) {
    console.error('Error saving PDF:', error);
    res.status(500).json({ error: 'Failed to save PDF' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`PDFs available at http://localhost:${PORT}/api/pdfs`);
}); 