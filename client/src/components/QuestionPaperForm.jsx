import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Logo from "../images/profile.png";
import Header from "./Header";
import { api } from '../utils/api';
import '../styles/question-paper.css';
import SendForReviewModal from './SendForReviewModal';

const EXAM_LIMITS = {
  CIE: { partA: 10, partB: 50 },
  IMPROVEMENT: { partA: 10, partB: 50 },
  SEE: { partA: 20, partB: 80 },
  MAKEUP: { partA: 20, partB: 80 }
};

export default function QuestionPaperForm() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [filters, setFilters] = useState({
    unit: '',
    co: '',
    bt: '',
    marks: ''
  });
  const [selectedQuestions, setSelectedQuestions] = useState({
    partA: [],
    partB: []
  });
  const [paperMetadata, setPaperMetadata] = useState({
    course_code: '',
    course_title: '',
    date: new Date().toISOString().split('T')[0],
    max_marks: '',
    duration: '',
    semester: '',
    exam_type: 'CIE'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filteredQuestionIds, setFilteredQuestionIds] = useState(new Set());
  const [courseInfo, setCourseInfo] = useState(null);
  const [marksTotals, setMarksTotals] = useState({
    partA: 0,
    partB: 0
  });
  const [selectedQuestionDetails, setSelectedQuestionDetails] = useState({
    partA: new Map(),
    partB: new Map()
  });
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [generatedPaperId, setGeneratedPaperId] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      const userRole = localStorage.getItem('userRole');
      
      if (!token || userRole !== 'faculty') {
        navigate('/login-faculty');
        return;
      }

      if (!courseId) {
        navigate('/faculty-dashboard');
        return;
      }

      try {
        // First check course access
        const mappingResponse = await api.get('/faculty-courses/');
        const mappings = mappingResponse.data.mappings;
        const hasCourseAccess = mappings.some(mapping => mapping.course_id === courseId);
        
        if (!hasCourseAccess) {
          setError('You do not have access to this course');
          setTimeout(() => navigate('/faculty-dashboard'), 2000);
          return;
        }

        // Fetch course details from faculty dashboard
        const dashboardResponse = await api.get('/faculty-dashboard/');
        console.log('Dashboard response:', dashboardResponse.data); // Debug log
        
        // Extract course from the courses array
        const course = dashboardResponse.data.courses.find(c => c.id === courseId);
        
        if (course) {
          setPaperMetadata(prev => ({
            ...prev,
            course_code: course.id,
            course_title: course.name
          }));
        } else {
          console.error('Course not found in dashboard data. Available courses:', dashboardResponse.data.courses);
          throw new Error('Course not found in dashboard data');
        }
      } catch (error) {
        console.error('Error:', error);
        if (error.response?.status === 403) {
          navigate('/login-faculty');
        } else {
          setError('Failed to fetch course details. Please try again.');
          // Don't navigate away immediately to allow user to see the error
        }
      }
    };

    checkAuth();
  }, [courseId, navigate]);

  useEffect(() => {
    fetchQuestions();
  }, [courseId]);

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/course/${courseId}/questions/`);
      console.log('Questions response:', response.data);
      
      if (response.data && Array.isArray(response.data.questions)) {
        setQuestions(response.data.questions);
        setCourseInfo(response.data.course);
      } else {
        throw new Error('Invalid questions data format');
      }
    } catch (err) {
      console.error('Error fetching questions:', err);
      setError('Failed to fetch questions');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const applyFilters = async () => {
    setLoading(true);
    try {
        const filterData = {
            course_id: courseId,
            unit_numbers: filters.unit ? filters.unit.split(',').map(u => u.trim()) : [],
            cos: filters.co ? filters.co.split(',').map(co => co.trim()) : [],
            bts: filters.bt ? filters.bt.split(',').map(bt => bt.trim()) : [],
            marks: filters.marks ? filters.marks.split(',').map(m => parseInt(m.trim())).filter(m => !isNaN(m)) : []
        };

        const response = await api.post(`/course/${courseId}/filter-questions/`, filterData);
        
        if (response.data && Array.isArray(response.data.questions)) {
            // Store only the IDs of filtered questions
            const filteredIds = new Set(response.data.questions.map(q => parseInt(q.q_id)));
            setFilteredQuestionIds(filteredIds);
            
            // Update the main questions array with any new data
            setQuestions(prevQuestions => {
                const updatedQuestions = [...prevQuestions];
                response.data.questions.forEach(newQ => {
                    const index = updatedQuestions.findIndex(q => q.q_id === parseInt(newQ.q_id));
                    if (index !== -1) {
                        updatedQuestions[index] = { ...newQ, q_id: parseInt(newQ.q_id) };
                    } else {
                        updatedQuestions.push({ ...newQ, q_id: parseInt(newQ.q_id) });
                    }
                });
                return updatedQuestions;
            });
        }
    } catch (error) {
        console.error('Error applying filters:', error);
        setError('Failed to filter questions. Please try again.');
    } finally {
        setLoading(false);
    }
  };

  const calculateTotalMarks = (selectedState) => {
    return {
        partA: Array.from(selectedState.partA.values())
            .reduce((sum, q) => sum + parseInt(q.marks), 0),
        partB: Array.from(selectedState.partB.values())
            .reduce((sum, q) => sum + parseInt(q.marks), 0)
    };
  };

  const updateMarksTotals = (selectedState = selectedQuestionDetails) => {
    const totals = calculateTotalMarks(selectedState);
    setMarksTotals(totals);
  };

  useEffect(() => {
    updateMarksTotals();
  }, [questions]);

  const handleQuestionSelect = (questionId, part) => {
    const qId = parseInt(questionId);
    const question = questions.find(q => q.q_id === qId);
    
    if (!question) {
        console.error('Question not found:', qId);
        return;
    }

    const isQuizQuestion = parseInt(question.marks) <= 2;
    const isTestQuestion = parseInt(question.marks) > 2;

    setSelectedQuestionDetails(prev => {
        const newState = {
            partA: new Map(prev.partA),
            partB: new Map(prev.partB)
        };
        const otherPart = part === 'partA' ? 'partB' : 'partA';

        // If question is already in the current part, remove it
        if (newState[part].has(qId)) {
            newState[part].delete(qId);
        } else {
            // Validate question type for each part
            if (part === 'partA' && !isQuizQuestion) {
                alert('Only Quiz questions (2 marks or less) can be added to Part A');
                return prev;
            }
            if (part === 'partB' && !isTestQuestion) {
                alert('Only Test questions (more than 2 marks) can be added to Part B');
                return prev;
            }

            // Calculate new total
            const currentTotal = Array.from(newState[part].values())
                .reduce((sum, q) => sum + parseInt(q.marks), 0);
            const newTotal = currentTotal + parseInt(question.marks);
            const limit = EXAM_LIMITS[paperMetadata.exam_type][part];

            if (newTotal > limit) {
                alert(`Cannot add question. Total marks would exceed the ${part === 'partA' ? 'Part A' : 'Part B'} limit of ${limit} marks`);
                return prev;
            }

            // Remove from other part if present
            if (newState[otherPart].has(qId)) {
                newState[otherPart].delete(qId);
            }

            // Add to current part
            newState[part].set(qId, question);
        }

        // Update the selectedQuestions state
        setSelectedQuestions({
            partA: Array.from(newState.partA.keys()),
            partB: Array.from(newState.partB.keys())
        });

        updateMarksTotals(newState);
        return newState;
    });
  };

  const handleMetadataChange = (e) => {
    const { name, value } = e.target;
    setPaperMetadata(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Helper function to download a file
  async function downloadFile(url, payload, filename) {
    const response = await api.post(url, payload, { responseType: 'blob' });
    const blob = new Blob([response.data]);
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        course_id: courseId,
        course_code: paperMetadata.course_code,
        course_title: paperMetadata.course_title,
        selected_questions: {
          part_a: selectedQuestions.partA.map(id => parseInt(id)),
          part_b: selectedQuestions.partB.map(id => parseInt(id))
        },
        exam_type: paperMetadata.exam_type,
        date: paperMetadata.date,
        max_marks: parseInt(paperMetadata.max_marks),
        duration: paperMetadata.duration,
        semester: paperMetadata.semester
      };
      console.log('Submitting paper with payload:', payload);

      // Generate the paper and answer scheme
      let pdfPath = null;
      try {
        const paperResponse = await api.post('/generate-question-paper/', payload);
        pdfPath = paperResponse.data.download_path;
        console.log('Question paper generated successfully, PDF path:', pdfPath);
      } catch (paperError) {
        console.error('Error generating question paper:', paperError);
        // Continue anyway to show review modal
      }

      // Try to generate answer scheme (don't block on this)
      try {
      setTimeout(async () => {
          try {
        await downloadFile('/generate-answer-scheme/', payload, 'answer_scheme.docx');
            console.log('Answer scheme generated successfully');
          } catch (answerError) {
            console.error('Error generating answer scheme:', answerError);
          }
        }, 1000);
      } catch (answerError) {
        console.error('Error scheduling answer scheme generation:', answerError);
      }
      
      // Create a PaperDraft record for the review system
      try {
        console.log('Creating draft record...');
        const draftPayload = {
          course_id: courseId,
          paper_metadata: {
            course_code: paperMetadata.course_code,
            course_title: paperMetadata.course_title,
            exam_type: paperMetadata.exam_type,
            date: paperMetadata.date,
            max_marks: parseInt(paperMetadata.max_marks),
            duration: paperMetadata.duration,
            semester: paperMetadata.semester,
            generated_paper_path: pdfPath,
            generated_answer_path: `papers/${courseId}_${Date.now()}_answer_scheme.docx`
          },
          selected_questions: {
            part_a: selectedQuestions.partA.map(id => parseInt(id)),
            part_b: selectedQuestions.partB.map(id => parseInt(id))
          },
          status: 'finalized',
          pdf_path: pdfPath
        };
        
        const draftResponse = await api.post('/ai/create-draft/', draftPayload);
        const createdDraft = draftResponse.data.draft;
        setGeneratedPaperId(createdDraft.id);
        console.log('Draft created successfully:', createdDraft.id);
        
        // Show success message and open review modal
        setError(null);
        console.log('Opening review modal...');
        setIsReviewModalOpen(true);
        
      } catch (draftError) {
        console.error('Error creating draft record:', draftError);
        // Still show the review modal even if draft creation fails
        setGeneratedPaperId('temp_' + Date.now());
        console.log('Opening review modal with temp ID...');
        setIsReviewModalOpen(true);
      }
      
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      
      // Try to get the error message from the response
      if (error.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const errorData = JSON.parse(text);
          setError(errorData.error || errorData.detail || 'Failed to generate paper. Please check your selections.');
        } catch (e) {
          setError('Failed to generate paper. Please check your selections and try again.');
        }
      } else {
        setError(error.response?.data?.error || error.response?.data?.detail || 'Failed to generate paper');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReviewSuccess = () => {
    setError('Paper sent for review successfully!');
    setTimeout(() => setError(null), 3000);
    setIsReviewModalOpen(false);
  };

  const handleFilter = (filteredData) => {
    if (Array.isArray(filteredData)) {
      setFilteredQuestionIds(new Set(filteredData.map(q => parseInt(q.q_id))));
    } else {
      console.error('Filtered data is not an array:', filteredData);
      setFilteredQuestionIds(new Set());  // Set to empty array if invalid data
    }
  };

  const renderExamTypeSelector = () => (
    <div className="exam-type-selector">
      <h3>Select Exam Type</h3>
      <select
        name="exam_type"
        value={paperMetadata.exam_type}
        onChange={handleMetadataChange}
        required
      >
        <option value="CIE">CIE</option>
        <option value="SEE">SEE</option>
        <option value="IMPROVEMENT">Improvement</option>
        <option value="MAKEUP">Makeup</option>
      </select>
      <div className="marks-limits-info">
        <p>Marks Limits for {paperMetadata.exam_type}:</p>
        <ul>
          <li>Part A: {EXAM_LIMITS[paperMetadata.exam_type].partA} marks</li>
          <li>Part B: {EXAM_LIMITS[paperMetadata.exam_type].partB === Infinity ? 'No limit' : `${EXAM_LIMITS[paperMetadata.exam_type].partB} marks`}</li>
        </ul>
      </div>
    </div>
  );

  const renderQuestions = () => {
    // Get the questions to display based on filters
    const displayQuestions = filters.unit || filters.co || filters.bt || filters.marks
        ? questions.filter(q => filteredQuestionIds.has(q.q_id))
        : questions;

    return displayQuestions.map((question) => {
        const isQuizQuestion = parseInt(question.marks) <= 2;
        const isTestQuestion = parseInt(question.marks) > 2;
        const isSelectedInPartA = selectedQuestionDetails.partA.has(question.q_id);
        const isSelectedInPartB = selectedQuestionDetails.partB.has(question.q_id);

        return (
            <div key={question.q_id} className="question-card">
                <div className="question-text">{question.text}</div>
                <div className="question-meta">
                    Unit: {question.unit_id} | CO: {question.co} | BT: {question.bt} | Marks: {question.marks}
                </div>
                <div className="question-actions">
                    <button
                        type="button"
                        className={`part-button ${isSelectedInPartA ? 'selected' : ''} ${!isQuizQuestion ? 'disabled' : ''}`}
                        onClick={() => handleQuestionSelect(question.q_id, 'partA')}
                        disabled={!isQuizQuestion}
                        title={!isQuizQuestion ? "Only Quiz questions (2 marks or less) can be added to Part A" : ""}
                    >
                        {isSelectedInPartA ? 'Remove from Part A' : 'Add to Part A'}
                    </button>
                    <button
                        type="button"
                        className={`part-button ${isSelectedInPartB ? 'selected' : ''} ${!isTestQuestion ? 'disabled' : ''}`}
                        onClick={() => handleQuestionSelect(question.q_id, 'partB')}
                        disabled={!isTestQuestion}
                        title={!isTestQuestion ? "Only Test questions (more than 2 marks) can be added to Part B" : ""}
                    >
                        {isSelectedInPartB ? 'Remove from Part B' : 'Add to Part B'}
                    </button>
                </div>
            </div>
        );
    });
  };

  const resetFilters = () => {
    setFilters({
        unit: '',
        co: '',
        bt: '',
        marks: ''
    });
    setFilteredQuestionIds(new Set());
  };

  if (loading) return <div className="loading">Loading questions...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!Array.isArray(questions)) return <div className="error">Invalid questions data</div>;

  return (
    <>
      <Header name="Question Paper Form" page="Create Paper" logo={Logo} />
      <div className="paper-form">
        <h2>Create Question Paper</h2>
        {error && <div className="error-message">{error}</div>}
        <div className="info-message" style={{ 
          backgroundColor: '#e3f2fd', 
          border: '1px solid #2196f3', 
          borderRadius: '4px', 
          padding: '12px', 
          marginBottom: '20px',
          color: '#1976d2'
        }}>
          <strong>💡 Tip:</strong> After generating your paper, you can send it for review to assigned reviewers.
          <button 
            onClick={() => {
              console.log('Test button clicked, opening modal...');
              setGeneratedPaperId('test_' + Date.now());
              setIsReviewModalOpen(true);
            }}
            style={{
              marginLeft: '10px',
              padding: '4px 8px',
              backgroundColor: '#2196f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Test Review Modal
          </button>
        </div>
        
        {renderExamTypeSelector()}

        {/* Question Filters */}
        <div className="filter-section">
          <h3>Filter Questions</h3>
          <div className="form-group">
            <label>Unit Numbers:</label>
            <input
              type="text"
              name="unit"
              value={filters.unit}
              onChange={handleFilterChange}
              placeholder="e.g., 1,2,3"
            />
          </div>
          <div className="form-group">
            <label>Course Outcomes:</label>
            <input
              type="text"
              name="co"
              value={filters.co}
              onChange={handleFilterChange}
              placeholder="e.g., 1,2,3"
            />
          </div>
          <div className="form-group">
            <label>Bloom's Taxonomy:</label>
            <input
              type="text"
              name="bt"
              value={filters.bt}
              onChange={handleFilterChange}
              placeholder="e.g., 1,2,3"
            />
          </div>
          <div className="form-group">
            <label>Marks:</label>
            <input
              type="text"
              name="marks"
              value={filters.marks}
              onChange={handleFilterChange}
              placeholder="e.g., 2,5,10"
            />
          </div>
          <div className="filter-buttons">
            <button type="button" onClick={applyFilters} className="filter-button">
                Apply Filters
            </button>
            <button type="button" onClick={resetFilters} className="filter-button">
                Reset Filters
            </button>
          </div>
        </div>

        {/* Marks Totals Display */}
        <div className="marks-summary">
          <div className="marks-total part-a">
            <h4>Part A Total</h4>
            <div className="marks-badge">{marksTotals.partA} marks</div>
            <div className="questions-count">
              {selectedQuestions.partA.length} questions selected
            </div>
          </div>
          <div className="marks-total part-b">
            <h4>Part B Total</h4>
            <div className="marks-badge">{marksTotals.partB} marks</div>
            <div className="questions-count">
              {selectedQuestions.partB.length} questions selected
            </div>
          </div>
          <div className="total-marks">
            <h4>Total Marks</h4>
            <div className="marks-badge total">
              {marksTotals.partA + marksTotals.partB} marks
            </div>
          </div>
        </div>

        {/* Question Selection */}
        <div className="question-selection">
          <h3>Select Questions</h3>
          <div className="questions-container">
            {renderQuestions()}
          </div>
        </div>

        {/* Paper Metadata Form */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Course Code:</label>
            <input
              type="text"
              name="course_code"
              value={paperMetadata.course_code}
              readOnly
              className="readonly-input"
            />
          </div>
          <div className="form-group">
            <label>Course Title:</label>
            <input
              type="text"
              name="course_title"
              value={paperMetadata.course_title}
              readOnly
              className="readonly-input"
            />
          </div>
          <div className="form-group">
            <label>Date:</label>
            <input
              type="date"
              name="date"
              value={paperMetadata.date}
              onChange={handleMetadataChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Maximum Marks:</label>
            <input
              type="number"
              name="max_marks"
              value={paperMetadata.max_marks}
              onChange={handleMetadataChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Duration (e.g., "3 hours"):</label>
            <input
              type="text"
              name="duration"
              value={paperMetadata.duration}
              onChange={handleMetadataChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Semester:</label>
            <input
              type="text"
              name="semester"
              value={paperMetadata.semester}
              onChange={handleMetadataChange}
              required
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Generating...' : 'Generate Paper'}
          </button>
        </form>

        <div className="filters-info">
          <p>Enter filter values and click "Apply Filters" to search questions.</p>
          <ul>
            <li key="unit">Unit Number: Enter a number (e.g., 1, 2, 3)</li>
            <li key="co">Course Outcome (CO): Enter the number (e.g., 1, 2, 3)</li>
            <li key="bt">Bloom's Taxonomy (BT): Enter the number (e.g., 1, 2, 3)</li>
            <li key="marks">Marks: Enter a number (e.g., 2, 5, 10)</li>
          </ul>
        </div>
      </div>

      {/* Send for Review Modal */}
      <SendForReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        paperId={generatedPaperId}
        onSuccess={handleReviewSuccess}
      />

      <style jsx>{`
        .part-button.disabled {
          opacity: 0.5;
          cursor: not-allowed;
          background-color: #ccc;
        }

        .part-button.disabled:hover {
          background-color: #ccc;
        }

        /* Add tooltip style */
        .part-button[title] {
          position: relative;
        }

        .part-button[title]:hover::after {
          content: attr(title);
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          padding: 5px;
          background-color: #333;
          color: white;
          border-radius: 4px;
          font-size: 12px;
          white-space: nowrap;
          z-index: 1000;
        }

        .marks-summary {
          display: flex;
          justify-content: space-around;
          padding: 1rem;
          margin: 1rem 0;
          background-color: #f8f9fa;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .marks-total {
          text-align: center;
          padding: 1rem;
          border-radius: 6px;
          background-color: white;
          min-width: 200px;
        }

        .part-a {
          border-left: 4px solid #28a745;
        }

        .part-b {
          border-left: 4px solid #007bff;
        }

        .marks-total h4 {
          margin: 0 0 0.5rem 0;
          color: #343a40;
        }

        .marks-badge {
          display: inline-block;
          padding: 0.5rem 1rem;
          background-color: #e9ecef;
          border-radius: 20px;
          font-weight: bold;
          color: #495057;
          margin: 0.5rem 0;
        }

        .marks-badge.total {
          background-color: #28a745;
          color: white;
        }

        .questions-count {
          font-size: 0.9rem;
          color: #6c757d;
        }

        .total-marks {
          text-align: center;
          padding: 1rem;
          border-radius: 6px;
          background-color: white;
          min-width: 200px;
          border-left: 4px solid #ffc107;
        }

        .exam-type-selector {
          background-color: #f8f9fa;
          padding: 1rem;
          margin-bottom: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .exam-type-selector h3 {
          margin: 0 0 1rem 0;
          color: #343a40;
        }

        .exam-type-selector select {
          width: 100%;
          padding: 0.5rem;
          margin-bottom: 1rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 1rem;
        }

        .marks-limits-info {
          background-color: #e9ecef;
          padding: 0.75rem;
          border-radius: 4px;
          margin-top: 0.5rem;
        }

        .marks-limits-info p {
          margin: 0 0 0.5rem 0;
          font-weight: bold;
          color: #495057;
        }

        .marks-limits-info ul {
          margin: 0;
          padding-left: 1.5rem;
          color: #6c757d;
        }

        .marks-limits-info li {
          margin: 0.25rem 0;
        }
      `}</style>
    </>
  );
}