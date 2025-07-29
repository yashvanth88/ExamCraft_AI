# Exam-Craft Annotate Server

This is the backend server for the Exam-Craft Annotate application that serves PDF files and provides an API for the frontend.

## Setup Instructions

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Generate Dummy PDF Files

```bash
npm run generate-pdfs
```

This will create three sample PDF files in the `pdfs/` directory:
- `sample-exam-1.pdf` - Mathematics Exam
- `sample-exam-2.pdf` - Physics Exam  
- `sample-exam-3.pdf` - Chemistry Exam

### 3. Start the Server

```bash
npm start
```

Or for development with auto-restart:

```bash
npm run dev
```

The server will start on `http://localhost:3001`

## API Endpoints

### GET /api/pdfs
Returns a list of all available PDF files with metadata.

**Response:**
```json
[
  {
    "id": "sample-exam-1",
    "name": "sample-exam-1.pdf",
    "url": "http://localhost:3001/pdfs/sample-exam-1.pdf",
    "size": 12345,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

### GET /api/pdfs/:id
Serves a specific PDF file by ID.

### POST /api/pdfs/save
Saves an annotated PDF back to the server.

**Request:** Multipart form data with PDF file
**Response:**
```json
{
  "success": true,
  "message": "PDF saved successfully",
  "filename": "sample-exam-1.pdf",
  "size": 12345
}
```

### GET /api/health
Health check endpoint.

**Response:**
```json
{
  "status": "OK",
  "message": "Server is running"
}
```

## File Structure

```
server/
├── package.json
├── server.js
├── generate-dummy-pdfs.js
├── pdfs/                    # PDF files directory
│   ├── sample-exam-1.pdf
│   ├── sample-exam-2.pdf
│   └── sample-exam-3.pdf
└── README.md
```

## Adding Your Own PDFs

To add your own PDF files:

1. Place your PDF files in the `pdfs/` directory
2. Restart the server
3. The files will automatically appear in the frontend PDF selector

## CORS Configuration

The server is configured with CORS enabled to allow requests from the frontend running on `http://localhost:5173` (Vite default port).

## Dependencies

- **express**: Web framework
- **cors**: Cross-origin resource sharing
- **multer**: File upload handling
- **pdf-lib**: PDF generation for dummy files
- **nodemon**: Development server with auto-restart 