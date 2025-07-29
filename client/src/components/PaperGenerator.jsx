import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../utils/api';
import QuestionFilter from './QuestionFilter';
import '../styles/paper_generator.css';

export default function PaperGenerator() {
    const { courseId } = useParams();
    const [questions, setQuestions] = useState([]);
    const [filteredQuestions, setFilteredQuestions] = useState([]);
    const [selectedQuestions, setSelectedQuestions] = useState([]);
    const [courseInfo, setCourseInfo] = useState(null);
    const [paperMetadata, setPaperMetadata] = useState({
        course_code: '',
        course_title: '',
        date: new Date().toISOString().split('T')[0],
        max_marks: '',
        duration: '',
        semester: '',
        is_improvement_cie: false
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchQuestions();
    }, [courseId]);

    useEffect(() => {
        if (courseInfo) {
            setPaperMetadata(prev => ({
                ...prev,
                course_code: courseInfo.course_id,
                course_title: courseInfo.course_name
            }));
        }
    }, [courseInfo]);

    const fetchQuestions = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/course/${courseId}/questions/`);
            if (response.data && response.data.questions) {
                setQuestions(response.data.questions);
                setFilteredQuestions(response.data.questions);
                setCourseInfo(response.data.course);
            }
        } catch (err) {
            console.error('Error fetching questions:', err);
            setError('Failed to fetch questions');
        } finally {
            setLoading(false);
        }
    };

    const handleMetadataChange = (e) => {
        const { name, value, type, checked } = e.target;
        setPaperMetadata(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleQuestionSelect = (question, part) => {
        setSelectedQuestions(prev => {
            const isAlreadySelected = prev.some(q => q.question_id === question.q_id);
            if (isAlreadySelected) {
                return prev.filter(q => q.question_id !== question.q_id);
            }
            return [...prev, { question_id: question.q_id, part, marks: question.marks }];
        });
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

    const handleGeneratePaper = async (e) => {
        e.preventDefault();
        if (selectedQuestions.length === 0) {
            alert('Please select at least one question');
            return;
        }

        setLoading(true);
        try {
            const payload = {
                ...paperMetadata,
                selected_questions: selectedQuestions
            };
            await downloadFile('/generate-question-paper/', payload, 'question_paper.docx');
            setTimeout(async () => {
                await downloadFile('/generate-answer-scheme/', payload, 'answer_scheme.docx');
            }, 3000);
        } catch (error) {
            console.error('Error generating paper:', error);
            alert('Failed to generate paper. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="loading">Loading questions...</div>;
    if (error) return <div className="error">{error}</div>;

    const totalMarks = selectedQuestions.reduce((sum, q) => sum + q.marks, 0);

    return (
        <div className="paper-generator">
            <h1>Question Paper Generator</h1>
            
            {/* Question Filter Section */}
            <section className="filter-section">
                <QuestionFilter 
                    questions={questions}
                    onQuestionsFiltered={setFilteredQuestions} 
                />
            </section>

            {/* Question Selection Section */}
            <section className="selection-section">
                <h2>Select Questions</h2>
                <div className="questions-grid">
                    {filteredQuestions.map(question => (
                        <div key={question.q_id} className="question-card">
                            <p>{question.text}</p>
                            <div className="question-details">
                                <span>Marks: {question.marks}</span>
                                <span>CO: {question.co}</span>
                                <span>BT: {question.bt}</span>
                                <span>Unit: {question.unit_id}</span>
                            </div>
                            <div className="question-actions">
                                <button 
                                    onClick={() => handleQuestionSelect(question, 'A')}
                                    className={selectedQuestions.some(q => q.question_id === question.q_id && q.part === 'A') ? 'selected' : ''}
                                >
                                    Part A
                                </button>
                                <button 
                                    onClick={() => handleQuestionSelect(question, 'B')}
                                    className={selectedQuestions.some(q => q.question_id === question.q_id && q.part === 'B') ? 'selected' : ''}
                                >
                                    Part B
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Paper Metadata Section */}
            <section className="metadata-section">
                <h2>Paper Details</h2>
                <div className="selected-summary">
                    Selected Questions: {selectedQuestions.length}
                    <br />
                    Total Marks: {totalMarks}
                </div>
                <form onSubmit={handleGeneratePaper}>
                    <div className="form-group">
                        <label>Course Code:</label>
                        <input
                            type="text"
                            name="course_code"
                            value={paperMetadata.course_code}
                            onChange={handleMetadataChange}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Course Title:</label>
                        <input
                            type="text"
                            name="course_title"
                            value={paperMetadata.course_title}
                            onChange={handleMetadataChange}
                            required
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
                        <label>Duration:</label>
                        <input
                            type="text"
                            name="duration"
                            value={paperMetadata.duration}
                            onChange={handleMetadataChange}
                            placeholder="e.g., 3 hours"
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
                    <div className="form-group">
                        <label>
                            <input
                                type="checkbox"
                                name="is_improvement_cie"
                                checked={paperMetadata.is_improvement_cie}
                                onChange={handleMetadataChange}
                            />
                            Improvement CIE
                        </label>
                    </div>
                    <button type="submit" disabled={loading || selectedQuestions.length === 0}>
                        {loading ? 'Generating Paper...' : 'Generate Paper'}
                    </button>
                </form>
            </section>
        </div>
    );
} 