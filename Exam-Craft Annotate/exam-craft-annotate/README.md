# Exam-Craft Annotate

A modern web application for annotating PDF documents with text and pen annotations. Built with React, PDF.js, and Express.js.

## Features

- 📄 **PDF Upload & Display**: Upload PDFs or select from server
- ✏️ **Annotation Tools**: Text and pen annotations
- 🎨 **Customizable**: Color and size controls for annotations
- 📱 **Responsive**: Works on desktop and mobile devices
- 💾 **Export Options**: Download as image, export as PDF, save to server, or download annotated PDF
- 🔍 **Zoom Controls**: Zoom in/out for detailed work
- 📋 **Annotation Management**: View, edit, and delete annotations

## Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### 1. Clone and Setup

```bash
git clone <repository-url>
cd exam-craft-annotate
```

### 2. Setup Backend Server

```bash
# Install server dependencies
cd server
npm install

# Generate dummy PDF files
npm run generate-pdfs

# Start the server
npm start
```

The server will run on `http://localhost:3001`

### 3. Setup Frontend

```bash
# In a new terminal, go back to the root directory
cd ..

# Install frontend dependencies
npm install

# Start the development server
npm run dev
```

The frontend will run on `http://localhost:5173`

### 4. Use the Application

1. Open `http://localhost:5173` in your browser
2. You'll see a PDF selector with available PDFs from the server
3. Click on a PDF to start annotating
4. Use the toolbar to switch between text and pen tools
5. Add annotations and export your work

## Project Structure

```
exam-craft-annotate/
├── src/
│   ├── components/
│   │   ├── PDFSelector.jsx      # PDF selection interface
│   │   ├── PDFViewer.jsx        # PDF display and annotation canvas
│   │   ├── Toolbar.jsx          # Annotation tools and controls
│   │   ├── AnnotationsPanel.jsx # Annotation management panel
│   │   └── *.css               # Component styles
│   ├── utils/
│   │   └── pdfUtils.js         # PDF handling and export utilities
│   ├── App.jsx                 # Main application component
│   └── main.jsx                # Application entry point
├── server/
│   ├── server.js               # Express server
│   ├── generate-dummy-pdfs.js  # PDF generation script
│   ├── pdfs/                   # PDF files directory
│   └── package.json            # Server dependencies
├── public/
│   └── pdf.worker.js           # PDF.js worker file
└── package.json                # Frontend dependencies
```

## Usage

### PDF Selection
- The app starts with a PDF selector showing available PDFs from the server
- Click on any PDF to load it for annotation
- Use the "Back" button to return to the selector

### Annotation Tools

**Text Tool:**
- Click anywhere on the PDF to add text annotations
- Type your text and press Enter to confirm
- Text annotations can be edited or deleted

**Pen Tool:**
- Draw freehand annotations on the PDF
- Adjust color and size using the toolbar controls
- Pen strokes can be erased with the eraser tool

**Eraser Tool:**
- Click on annotations to remove them
- Use "Clear All" to remove all annotations

### Navigation
- Use page controls to navigate multi-page PDFs
- Zoom in/out using the scale controls
- Pan by dragging when zoomed in

### Export Options
- **Download as Image**: Saves the current view as a PNG file
- **Export as PDF**: Creates a new PDF with annotations embedded
- **Save to Server**: Saves the annotated PDF back to the server (updates the original file)
- **Download PDF**: Downloads the annotated PDF locally (preserves original formatting)

## API Endpoints

The server provides the following endpoints:

- `GET /api/pdfs` - List all available PDFs
- `GET /api/pdfs/:id` - Get a specific PDF file
- `GET /api/health` - Server health check

## Adding Your Own PDFs

1. Place your PDF files in the `server/pdfs/` directory
2. Restart the server
3. Your PDFs will appear in the frontend selector

## Technologies Used

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **PDF.js** - PDF rendering
- **jsPDF** - PDF export
- **html2canvas** - Image export

### Backend
- **Express.js** - Web server
- **CORS** - Cross-origin resource sharing
- **pdf-lib** - PDF generation for dummy files

## Development

### Frontend Development
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
```

### Backend Development
```bash
cd server
npm run dev          # Start with nodemon (auto-restart)
npm start            # Start production server
```

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Troubleshooting

### CORS Issues
- Ensure the server is running on port 3001
- Check that CORS is properly configured in server.js

### PDF Loading Issues
- Verify PDF files are valid and not corrupted
- Check browser console for error messages
- Ensure PDF.js worker file is accessible

### Annotation Issues
- Clear browser cache if annotations don't appear
- Check that the canvas is properly initialized
- Verify that the PDF is fully loaded before annotating

## License

This project is licensed under the MIT License.

## Support

If you encounter any issues or have questions:

1. Check the browser console for error messages
2. Ensure your Word document is not corrupted
3. Try uploading a different document format
4. Clear your browser cache and try again

---

**Happy Annotating! 🎨📝**
