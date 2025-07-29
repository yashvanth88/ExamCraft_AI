const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

async function createDummyPDF(filename, title, content) {
  const pdfsDir = path.join(__dirname, 'pdfs');
  
  if (!fs.existsSync(pdfsDir)) {
    fs.mkdirSync(pdfsDir, { recursive: true });
  }
  
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Standard letter size
  const { width, height } = page.getSize();
  
  // Get the standard font
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Add title
  const titleFontSize = 24;
  const titleWidth = boldFont.widthOfTextAtSize(title, titleFontSize);
  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y: height - 50,
    size: titleFontSize,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  
  // Add content
  const fontSize = 12;
  const lineHeight = fontSize * 1.2;
  const margin = 50;
  const maxWidth = width - 2 * margin;
  
  // Split content into lines
  const words = content.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    
    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        lines.push(word);
      }
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  
  // Draw content lines
  lines.forEach((line, index) => {
    const y = height - 100 - (index * lineHeight);
    if (y > margin) {
      page.drawText(line, {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
    }
  });
  
  // Save the PDF
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(path.join(pdfsDir, filename), pdfBytes);
  console.log(`Created PDF: ${filename}`);
}

async function generateDummyPDFs() {
  const dummyPDFs = [
    {
      filename: 'sample-exam-1.pdf',
      title: 'Mathematics Exam',
      content: 'This is a sample mathematics examination paper. It contains various mathematical problems including algebra, calculus, and geometry. Students are required to solve these problems within the allocated time. The exam consists of multiple choice questions, short answer questions, and problem-solving exercises.'
    },
    {
      filename: 'sample-exam-2.pdf',
      title: 'Physics Exam',
      content: 'This is a sample physics examination paper covering topics such as mechanics, thermodynamics, electromagnetism, and modern physics. The exam includes theoretical questions, numerical problems, and practical applications. Students must demonstrate their understanding of fundamental physics principles and their ability to apply them to real-world scenarios.'
    },
    {
      filename: 'sample-exam-3.pdf',
      title: 'Chemistry Exam',
      content: 'This is a sample chemistry examination paper that tests knowledge in organic chemistry, inorganic chemistry, physical chemistry, and analytical chemistry. The exam includes chemical equations, molecular structures, reaction mechanisms, and laboratory procedures. Students are expected to show proficiency in both theoretical concepts and practical applications.'
    }
  ];

  console.log('Generating dummy PDF files...');
  
  for (const pdf of dummyPDFs) {
    await createDummyPDF(pdf.filename, pdf.title, pdf.content);
  }
  
  console.log('All dummy PDFs generated successfully!');
}

// Run the generation
generateDummyPDFs().catch(console.error); 