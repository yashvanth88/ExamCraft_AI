import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import AIChatLauncherModal from './ai/AIChatLauncherModal';

import { Accordion, AccordionSummary, AccordionDetails, Button } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { api } from '../utils/api';
import '../styles/dashboard.css';

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLauncherModalOpen, setIsLauncherModalOpen] = useState(false);
  const [selectedCourseForAI, setSelectedCourseForAI] = useState(null);
  const [reviewedPapers, setReviewedPapers] = useState([]);
  const [loadingReviewed, setLoadingReviewed] = useState(true);
  const [errorReviewed, setErrorReviewed] = useState(null);

  useEffect(() => {
    // Check authentication on mount
    const token = localStorage.getItem('token');
    const userRole = localStorage.getItem('userRole');
    
    if (!token || userRole !== 'faculty') {
      navigate('/login-faculty');
      return;
    }

    // Fetch courses
    fetchCourses();
    // Fetch reviewed/annotated papers
    fetchReviewedPapers();
  }, [navigate]);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const response = await api.get('/faculty-dashboard/');
      localStorage.setItem('name', response.data.name);
      console.log('API Response:', response.data); // Debug log
      if (response.data.courses && response.data.courses.length > 0) {
        setCourses(response.data.courses);
        console.log('Fetched courses:', response.data.courses); // Debug: log all courses
      } else {
        setError('No courses found.');
      }
    } catch (error) {
      console.error('Error fetching courses:', error);
      if (error.response?.status === 403) {
        // Forbidden - likely a role/permission issue
        navigate('/login-faculty');
      } else {
        setError('Failed to load courses. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchReviewedPapers = async () => {
    try {
      setLoadingReviewed(true);
      const response = await api.get('/ai/faculty-reviewed-papers/');
      setReviewedPapers(response.data.reviewed_papers || []);
    } catch (err) {
      setErrorReviewed('Failed to load reviewed papers');
    } finally {
      setLoadingReviewed(false);
    }
  };

  const downloadAnnotatedPaper = async (annotatedPaperPath) => {
    if (!annotatedPaperPath) {
      alert('Annotated paper not available');
      return;
    }
    let safePath = annotatedPaperPath;
    if (!safePath.startsWith('media/') && !safePath.startsWith('generated_papers/')) {
      safePath = 'media/' + safePath.replace(/^\/+/,'');
    }
    try {
      const response = await api.get(`/ai/download-paper/`, {
        params: { path: safePath },
        responseType: 'blob',
      });
      let filename = safePath.split('/').pop() || 'annotated_paper.pdf';
      const contentDisposition = response.headers['content-disposition'];
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match && match[1]) filename = match[1];
      }
      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download annotated paper.');
    }
  };

  const handleNavigation = (courseId, action) => {
    const token = localStorage.getItem('token');
    const userRole = localStorage.getItem('userRole');
    
    if (!token || userRole !== 'faculty') {
      navigate('/login-faculty');
      return;
    }

    if (action === 'manage') {
      navigate(`/manage-question-bank/${courseId}`);
    } else if (action === 'create') {
      navigate(`/create-question-paper/${courseId}`);
    }
    else if (action === 'quiz') {
      navigate(`/quiz/${courseId}`);
    }

  };



  const handleOpenAIChatLauncher = (course) => {
    setSelectedCourseForAI(course);
    setIsLauncherModalOpen(true);
  };

  const handleCloseAIChatLauncher = () => {
    setIsLauncherModalOpen(false);
    setSelectedCourseForAI(null);
  };


  if (loading) {
    return (
      <>
        <Header page="Dashboard" />
        <div className="dashboard-page">
          <div className="loading">Loading courses...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header page="Faculty Dashboard" />
      <div className="dashboard-page">
        <div className="dashboard">
          <h1>Teacher Dashboard</h1>
          {error && <div className="error-message">{error}</div>}

          {/* Reviewed/Annotated Papers Section */}
          <div className="reviewed-papers-section" style={{ marginBottom: '2rem', background: '#f8f9fa', borderRadius: 8, padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <h2>Reviewed/Annotated Papers</h2>
            {loadingReviewed ? (
              <div>Loading reviewed papers...</div>
            ) : errorReviewed ? (
              <div className="error-message">{errorReviewed}</div>
            ) : reviewedPapers.length === 0 ? (
              <div>No reviewed/annotated papers yet.</div>
            ) : (
              <div className="reviewed-papers-list">
                {reviewedPapers.map((paper) => {
                  console.log('Reviewed paper:', paper); // DEBUG: log paper object
                  return (
                    <div key={paper.paper_id} className="reviewed-paper-card" style={{ background: 'white', borderRadius: 6, marginBottom: 16, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                      <div><strong>Course:</strong> {paper.course_name} ({paper.course_code})</div>
                      <div><strong>Paper ID:</strong> {paper.paper_id}</div>
                      <div><strong>Status:</strong> {paper.status}</div>
                      <div><strong>Reviewed At:</strong> {paper.reviewed_at ? new Date(paper.reviewed_at).toLocaleString() : 'N/A'}</div>
                      <div><strong>Annotated Path:</strong> {paper.annotated_paper_path || 'None'}</div>
                      <div style={{ marginTop: 8 }}>
                        <Button variant="contained" color="primary" size="small" onClick={() => downloadAnnotatedPaper(paper.annotated_paper_path)} disabled={!paper.annotated_paper_path}>
                          📥 Download Annotated PDF
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="course-list">
            {courses.map((course) => {
              console.log('Course object:', course); // Debug: log each course
              return (
                <Accordion key={course._id || course.id || course.course_id}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls={`panel-${course._id || course.id || course.course_id}-content`} id={`panel-${course._id || course.id || course.course_id}-header`}>
                    <div className="course-name">{course.name}</div>
                  </AccordionSummary>
                  <AccordionDetails>
                    <div>
                      <div className="dropdown">
                        <button onClick={() => handleNavigation(course._id || course.id || course.course_id, 'manage')}>Manage Question Bank</button>
                        <button onClick={() => handleNavigation(course._id || course.id || course.course_id, 'create')}>Create Question Paper</button>
                        <button onClick={() => handleOpenAIChatLauncher(course)}>Generate with AI Assistant</button>

                        <button onClick={() => {
                          // Prefer _id, fallback to id or course_id
                          const id = course._id || course.id || course.course_id;
                          window.open(`http://localhost:3000/create-exam?courseId=${id}`, '_self');
                        }}>Create Quiz</button>
                      </div>
                      <ul className="unit-list">
                        {course.units?.map((unit, index) => (
                          <li key={index} className="unit-item">{unit}</li>
                        ))}
                      </ul>
                    </div>
                  </AccordionDetails>
                </Accordion>
              );
            })}
          {selectedCourseForAI && (
        <AIChatLauncherModal
          open={isLauncherModalOpen}
          onClose={handleCloseAIChatLauncher}
          course={selectedCourseForAI}
          navigate={navigate}
        />
      )}
          </div>
        </div>
      </div>
    </>
  );
}