// client/src/components/ai/AIChatInterface.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Paper, TextField, List, ListItem,
  ListItemText, Avatar, Typography, CircularProgress,
  IconButton, Tooltip, Alert, Chip, Divider,
  alpha, useTheme, useMediaQuery, Zoom, Slide, Grow,
  Card, CardContent, Button, AppBar, Toolbar, Grid
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import InfoIcon from '@mui/icons-material/Info';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SchoolIcon from '@mui/icons-material/School';
import BookIcon from '@mui/icons-material/Book';
import AssignmentIcon from '@mui/icons-material/Assignment';
import TimerIcon from '@mui/icons-material/Timer';
import EventNoteIcon from '@mui/icons-material/EventNote';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DownloadIcon from '@mui/icons-material/Download';

import QuestionPreviewModal from './QuestionPreviewModal';
import SelectedQuestionsPreview from './SelectedQuestionsPreview';
import { api } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import SendForReviewModal from '../SendForReviewModal';

// Course details item component
const DetailItem = ({ icon, label, value, theme }) => (
  <Box sx={{ 
    display: 'flex', 
    alignItems: 'center', 
    py: 1,
    px: 1.5,
    borderRight: `1px solid ${alpha(theme.palette.common.white, 0.15)}`,
    height: '100%'
  }}>
    <Box sx={{ mr: 1.5, opacity: 0.8 }}>
      {icon}
    </Box>
    <Box>
      <Typography variant="caption" sx={{ display: 'block', opacity: 0.7, color: 'white' }}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={500} sx={{ mt: 0.3, color: 'white' }}>
        {value || 'Not specified'}
      </Typography>
    </Box>
  </Box>
);

// Course Details Grid
const CourseDetails = ({ courseDetails, theme }) => (
  <Grid container spacing={0}>
    <Grid item xs={12} sm={4} md={4}>
      <DetailItem 
        icon={<SchoolIcon fontSize="small" />} 
        label="Department" 
        value={courseDetails.department} 
        theme={theme}
      />
    </Grid>
    <Grid item xs={12} sm={4} md={4}>
      <DetailItem 
        icon={<BookIcon fontSize="small" />} 
        label="Semester" 
        value={courseDetails.semester} 
        theme={theme}
      />
    </Grid>
    <Grid item xs={12} sm={4} md={4}>
      <DetailItem 
        icon={<TimerIcon fontSize="small" />} 
        label="Exam Duration" 
        value={courseDetails.examDuration} 
        theme={theme}
      />
    </Grid>
  </Grid>
);

// Loading Indicator Component (for AI typing)
const LoadingIndicator = ({ theme }) => (
  <Box 
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      my: 2,
      ml: 6,
    }}
  >
    <Paper
      elevation={2}
      sx={{
        p: 2,
        borderRadius: '4px 20px 20px 20px',
        background: theme.palette.background.paper,
        boxShadow: `0 4px 20px ${alpha(theme.palette.grey[400], 0.15)}`,
        backdropFilter: 'blur(10px)',
        border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        minWidth: 120
      }}
    >
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
        }}
      >
        {[0, 0.5, 1].map((delay, i) => (
          <Box 
            key={i}
            sx={{ 
              width: 8, 
              height: 8, 
              borderRadius: '50%', 
              bgcolor: theme.palette.primary.main,
              animation: 'pulse 1.5s infinite ease-in-out',
              animationDelay: `${delay}s`,
              mx: 0.5,
              '@keyframes pulse': {
                '0%': { opacity: 0.4, transform: 'scale(0.8)' },
                '50%': { opacity: 1, transform: 'scale(1)' },
                '100%': { opacity: 0.4, transform: 'scale(0.8)' }
              }
            }} 
          />
        ))}
      </Box>
    </Paper>
    <Typography
      variant="caption"
      sx={{
        ml: 2,
        mt: 0.5,
        color: theme.palette.text.secondary,
        fontStyle: 'italic'
      }}
    >
      AI is typing...
    </Typography>
  </Box>
);

// Message Input Component (Zone 3)
const MessageInput = ({ inputMessage, setInputMessage, handleSendMessage, isLoading, currentDraft, inputFieldRef, theme }) => (
  <Box 
    sx={{
      p: { xs: 2, sm: 2.5 },
      pt: { xs: 1.5, sm: 2 },
      background: alpha(theme.palette.background.paper, 0.95),
      backdropFilter: 'blur(10px)',
      borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
      boxShadow: `0 -4px 20px ${alpha(theme.palette.common.black, 0.05)}`
    }}
  >
    <Paper 
      elevation={3} 
      component="form" 
      onSubmit={handleSendMessage}
      sx={{ 
        p: '6px 16px 6px 20px', 
        display: 'flex', 
        alignItems: 'center',
        maxWidth: '900px',
        mx: 'auto',
        borderRadius: 3,
        border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
      }}
    >
      <TextField
        fullWidth
        variant="standard"
        placeholder="Chat with your AI Paper Assistant..."
        value={inputMessage}
        onChange={(e) => setInputMessage(e.target.value)}
        onKeyPress={(e) => { 
          if (e.key === 'Enter' && !e.shiftKey) { 
            e.preventDefault(); 
            handleSendMessage(); 
          }
        }}
        multiline
        maxRows={4}
        inputRef={inputFieldRef}
        InputProps={{
          disableUnderline: true,
          style: { 
            fontSize: '1rem',
            lineHeight: 1.6,
            padding: '10px 0',
          }
        }}
        disabled={isLoading || (currentDraft?.status === 'finalized')}
        autoFocus
      />
      <Tooltip title="Send message">
        <span>
          <IconButton 
            color="primary" 
            size="medium" 
            type="submit" 
            disabled={isLoading || !inputMessage.trim() || (currentDraft?.status === 'finalized')}
            sx={{
              ml: 1,
              background: theme.palette.primary.main,
              color: 'white',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                background: theme.palette.primary.dark,
              },
              '&.Mui-disabled': {
                background: theme.palette.grey[300],
                color: theme.palette.grey[500]
              },
            }}
          >
            <SendIcon />
          </IconButton>
        </span>
      </Tooltip>
    </Paper>
  </Box>
);

const parseQIDs = (text) => {
  const qidRegex = /QID\s*(\d+)/gi;
  const qids = [];
  let match;
  while ((match = qidRegex.exec(text)) !== null) {
    qids.push(match[1]);
  }
  return qids;
};

export default function AIChatInterface() {
  const { courseId, draftId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isMediumScreen = useMediaQuery(theme.breakpoints.down('md'));

  const [messages, setMessages] = useState([]);
  const [currentDraft, setCurrentDraft] = useState(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState(null);
  const [courseName, setCourseName] = useState('');
  const [courseDetails, setCourseDetails] = useState({
    department: '',
    semester: '',
    facultyName: user?.name || 'Faculty',
    credits: '',
    examDuration: '',
    lastUpdated: new Date().toLocaleDateString()
  });
  
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [selectedQuestionIdForPreview, setSelectedQuestionIdForPreview] = useState(null);
  const [showPreview, setShowPreview] = useState(true); // Default to showing the preview
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const inputFieldRef = useRef(null);

  const scrollToBottom = (behavior = 'smooth') => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior
      });
    }
  };

  useEffect(() => {
    // Scroll to bottom a little after messages update to allow rendering
    setTimeout(() => scrollToBottom(), 100);
  }, [messages]);

  useEffect(() => {
    setPageLoading(true);
    setError(null);
    setMessages([]); // Clear previous messages on draft/course change

    const initialMessageContent = `Hi ${user?.name || 'Faculty'}! I'm ready to help you generate a question paper for course ${courseId}. ` +
                           (draftId ? `We are resuming draft ID ${draftId}.` : `Let's start a new draft.`) +
                           ` What would you like to do first? (e.g., "Set total marks to 100", "Suggest 5 easy questions for Part A")`;
    
    const initialSystemMessage = { role: 'assistant', content: initialMessageContent };

    if (draftId) {
      api.post('/ai/chat/', { draft_id: draftId, message: "SYSTEM_RESUME_SESSION_FETCH_DETAILS" })
        .then(response => {
          const { draft, ai_reply } = response.data;
          setCurrentDraft(draft);
          setCourseName(draft.course_name || courseId);
          
          // Set course details if available in draft
          if (draft.course_details) {
            setCourseDetails({
              department: draft.course_details.department || '',
              semester: draft.course_details.semester || '',
              facultyName: draft.course_details.faculty_name || user?.name || 'Faculty',
              credits: draft.course_details.credits || '',
              examDuration: draft.course_details.exam_duration || '',
              lastUpdated: new Date(draft.updated_at).toLocaleDateString() || new Date().toLocaleDateString()
            });
          }
          
          const loadedMessages = draft.conversation_history.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
          }));
          
          // Add a welcome back message based on AI's reply
          const welcomeBackMessage = {role: 'assistant', content: ai_reply || `Resumed session for draft ${draftId}. Let's continue!`}
          setMessages(loadedMessages.length > 0 ? [...loadedMessages, welcomeBackMessage] : [initialSystemMessage, welcomeBackMessage]);
          setPageLoading(false);
        })
        .catch(err => {
          console.error("Error resuming draft:", err);
          setError(err.response?.data?.error || "Failed to resume draft.");
          setMessages([initialSystemMessage]);
          setPageLoading(false);
        });
    } else {
      // Fetch course details to get course name for a new draft
      api.get(`/course/${courseId}/`)
        .then(response => {
            const courseData = response.data.course || {};
            setCourseName(courseData.course_name || courseId);
            
            // Set course details if available
            setCourseDetails({
              department: courseData.department || '',
              semester: courseData.semester || '',
              facultyName: user?.name || 'Faculty',
              credits: courseData.credits || '',
              examDuration: courseData.exam_duration || '',
              lastUpdated: new Date().toLocaleDateString()
            });
        }).catch(err => {
            console.warn("Could not fetch course name for new draft header:", err);
            setCourseName(courseId); // Fallback to courseId
        });
      setMessages([initialSystemMessage]);
      setCurrentDraft(null);
      setPageLoading(false);
    }
  }, [courseId, draftId, user]);

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault(); // Prevent form submission if called from form
    if (!inputMessage.trim()) return;

    const userMessage = { role: 'user', content: inputMessage };
    setMessages(prev => [...prev, userMessage]);
    const messageToSend = inputMessage; // Capture before clearing
    setInputMessage('');
    setIsLoading(true);
    setError(null);

    try {
      const payload = {
        message: messageToSend,
        course_id: currentDraft ? null : courseId,
        draft_id: currentDraft ? currentDraft.id : null,
      };
      const response = await api.post('/ai/chat/', payload);
      const { draft, ai_reply } = response.data;
      
      setCurrentDraft(draft);
      const aiMessage = { role: 'assistant', content: ai_reply };
      setMessages(prev => [...prev, aiMessage]);

    } catch (err) {
      console.error("Error sending message:", err);
      const errorMsg = err.response?.data?.error || "AI assistant is currently unavailable.";
      setError(errorMsg);
      setMessages(prev => [...prev, {role: 'assistant', content: `Sorry, an error occurred: ${errorMsg}`}]);
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        if (inputFieldRef.current) {
          inputFieldRef.current.focus();
        }
      }, 100);
    }
  };

  const handleOpenPreview = (qid) => {
    setSelectedQuestionIdForPreview(qid);
    setIsPreviewModalOpen(true);
  };

  const handleClosePreviewModal = () => {
    console.log("AIChatInterface: handleClosePreviewModal called"); // DEBUG
    setIsPreviewModalOpen(false);
    setSelectedQuestionIdForPreview(null); // Also clear the selected QID
  };

  const saveDraft = async () => {
    if (!currentDraft) return;
    setIsLoading(true);
    try {
      await api.post('/ai/save-draft/', { draft_id: currentDraft.id });
      setError(null);
      // Add a system message confirming save
      setMessages(prev => [...prev, {
        role: 'assistant', 
        content: `Draft ${currentDraft.id} has been saved successfully.`
      }]);
    } catch (err) {
      console.error("Error saving draft:", err);
      setError(err.response?.data?.error || "Failed to save draft.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveQuestion = async (qid, part) => {
    if (!currentDraft) return;
    setIsLoading(true);
    
    try {
      const response = await api.post('/ai/chat/', {
        draft_id: currentDraft.id,
        message: `Remove question ${qid} from part ${part}`,
        system_action: "remove_question",
        action_params: { question_id: qid, part: part }
      });
      
      const { draft, ai_reply } = response.data;
      setCurrentDraft(draft);
      
      // Add system message about removal
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: ai_reply || `Question ${qid} has been removed from Part ${part}.`
      }]);
      
      setError(null);
    } catch (err) {
      console.error("Error removing question:", err);
      setError(err.response?.data?.error || "Failed to remove question.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveQuestionFromPreview = async (qid, part) => {
    if (!currentDraft || currentDraft.status === 'finalized') return;

    const removalMessage = `Please remove QID ${qid} from Part ${part}.`;
    
    // Update local messages immediately for responsiveness
    const userSystemMessage = { role: 'user', content: removalMessage, isSystemAction: true, timestamp: new Date() };
    setMessages(prev => [...prev, userSystemMessage]);
    setInputMessage(''); // Clear input just in case
    setIsLoading(true);
    setError(null);

    try {
      const payload = {
        message: removalMessage, // AI will parse this to generate REMOVE_QUESTION action
        draft_id: currentDraft.id,
      };
      console.log("Sending REMOVE command to AI:", payload); // DEBUG
      const response = await api.post('/ai/chat/', payload); // Ensure correct endpoint
      const { draft, ai_reply } = response.data;
      
      console.log("Received DRAFT after remove attempt:", draft); // DEBUG
      console.log("Received AI REPLY after remove attempt:", ai_reply); // DEBUG
      
      setCurrentDraft(draft); // Update draft with removed question reflected
      console.log("Updated currentDraft in AIChatInterface:", draft); // DEBUG
      
      const aiMessage = { role: 'assistant', content: ai_reply, timestamp: new Date() };
      setMessages(prev => [...prev, aiMessage]);

    } catch (err) {
      console.error("Error sending removal command:", err);
      const errorMsg = err.response?.data?.error || "Failed to process removal request.";
      setError(errorMsg);
      setMessages(prev => [...prev, {role: 'assistant', content: `Sorry, an error occurred: ${errorMsg}`, timestamp: new Date()}]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearPartFromPreview = async (partToClear) => {
    if (!currentDraft || currentDraft.status === 'finalized') return;
    
    const message = `Please clear all selected questions from Part ${partToClear === 'All' ? 'A and B' : partToClear}.`;
    // Simulate user message to AI to trigger the action
    const userSystemMessage = { role: 'user', content: message, isSystemAction: true };
    setMessages(prev => [...prev, userSystemMessage]);
    setIsLoading(true);
    setError(null);
    
    try {
      const payload = { 
        message, 
        draft_id: currentDraft.id 
      };
      const response = await api.post('/ai/chat/', payload);
      setCurrentDraft(response.data.draft);
      setMessages(prev => [...prev, { role: 'assistant', content: response.data.ai_reply }]);
    } catch (err) {
      console.error("Error clearing questions:", err);
      const errorMsg = err.response?.data?.error || "Failed to clear questions.";
      setError(errorMsg);
      setMessages(prev => [...prev, {role: 'assistant', content: `Sorry, an error occurred: ${errorMsg}`}]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessageContent = (content) => {
    return content.split(/(QID\s*\d+)/gi).map((part, index) => {
      if (part.toUpperCase().startsWith('QID')) {
        const qid = part.match(/\d+/)?.[0];
        if (qid) {
          return (
            <Tooltip title={`View details for QID ${qid}`} key={index} arrow placement="top">
              <Chip
                icon={<InfoIcon fontSize="small" />} 
                label={part} 
                onClick={() => handleOpenPreview(qid)}
                size="small" 
                color="info" 
                variant="filled"
                sx={{
                  cursor: 'pointer', 
                  mx: 0.5, 
                  fontWeight: 500,
                  '&:hover': {
                    backgroundColor: alpha(theme.palette.info.main, 0.9),
                  },
                  transition: 'all 0.2s ease-in-out'
                }}
              />
            </Tooltip>
          );
        }
      }
      return part;
    });
  };

  const handleDownloadPaper = async () => {
    if (currentDraft && currentDraft.ai_meta_data?.generated_paper_path) {
        try {
            setIsLoading(true); // Show loading indicator
            const filePath = currentDraft.ai_meta_data.generated_paper_path;
            console.log("Initiating download from path:", filePath);
            
            // Use the api instance that already has auth tokens configured
            const response = await api.get(`/ai/download-paper/`, {
                params: { path: filePath },
                responseType: 'blob', // Important: Set the response type to blob
                timeout: 30000, // 30 second timeout for large files
            });
            
            // Get filename from Content-Disposition header if available, or use the path
            let filename = filePath.split('/').pop() || 'question_paper.docx';
            const contentDisposition = response.headers['content-disposition'];
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch && filenameMatch[1]) {
                    filename = filenameMatch[1];
                }
            }
            
            // Create a Blob from the response data
            const blob = new Blob([response.data], { 
                type: response.headers['content-type'] || 'application/octet-stream' 
            });
            
            // Create a URL for the blob
            const blobUrl = window.URL.createObjectURL(blob);
            
            // Create a link and trigger the download
            const link = document.createElement('a');
            link.href = blobUrl;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            
            // Clean up
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
            setIsLoading(false);
            
            console.log("Download successful");
        } catch (error) {
            console.error("Download error:", error);
            setError(error.response?.data?.error || "Failed to download the paper. Please try again.");
            setIsLoading(false);
        }
    } else {
        console.error("No generated paper path found to download.");
        setError("Could not initiate download: Paper path not found.");
    }
  };

  const handleSendForReview = () => {
    if (currentDraft && currentDraft.status === 'finalized') {
      setIsReviewModalOpen(true);
    } else {
      setError("Paper must be finalized before sending for review");
    }
  };

  const handleReviewSuccess = () => {
    setError("Paper sent for review successfully!");
    setTimeout(() => setError(null), 3000);
  };
  
  if (pageLoading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100vh',
        width: '100%',
        bgcolor: theme.palette.background.default
      }}>
        <AppBar position="static" sx={{ boxShadow: 1 }}>
          <Toolbar>
            <Typography variant="h6" fontWeight={600}>
              ExamCraft AI Assistant
            </Typography>
          </Toolbar>
        </AppBar>
        <Box 
          display="flex" 
          justifyContent="center" 
          alignItems="center" 
          flexGrow={1}
        >
          <Paper 
            elevation={3} 
            sx={{
              p: 4, 
              display: 'flex', 
              alignItems: 'center',
              borderRadius: 2,
            }}
          >
            <CircularProgress size={30} thickness={4} sx={{ color: theme.palette.primary.main }} /> 
            <Typography ml={2} variant="h6" fontWeight={500}>Loading your session...</Typography>
          </Paper>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh',
      width: '100%',
      bgcolor: theme.palette.background.default,
      overflow: 'hidden'
    }}>
      {/* Multi-row Header Structure */}
      <Paper
        elevation={3}
        sx={{
          background: `linear-gradient(90deg, ${theme.palette.primary.dark}, ${theme.palette.secondary.dark})`,
          color: 'white',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          flexShrink: 0 // Prevent header from shrinking
        }}
      >
        {/* Row 1: Back Button and Main Title */}
        <Toolbar 
          sx={{ 
            py: 1, 
            display: 'flex', 
            alignItems: 'center',
            minHeight: '64px'
          }}
        >
          <Box sx={{ flexShrink: 0, display: 'flex' }}>
            <Tooltip title="Back to Dashboard" arrow>
              <IconButton
                edge="start"
                onClick={() => navigate('/faculty-dashboard')}
                sx={{ 
                  mr: 2, 
                  flexShrink: 0,
                  display: 'inline-flex',
                  width: 40, 
                  height: 40,
                  color: 'white',
                  '&:hover': { 
                    bgcolor: alpha(theme.palette.common.white, 0.15) 
                  }
                }}
                size="medium"
              >
                <ArrowBackIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            AI Chat: {courseName || courseId}{draftId ? ` - Draft ${draftId}` : ''}
          </Typography>

          {currentDraft && currentDraft.status !== 'finalized' && (
            <Tooltip title="Finalize Paper" arrow>
              <Button
                variant="contained"
                color="success"
                size="small"
                onClick={() => setMessages(prev => [...prev, {
                  role: 'user',
                  content: "Please finalize this paper"
                }])}
                sx={{ 
                  ml: 1.5,
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 500,
                }}
              >
                Finalize Paper
              </Button>
            </Tooltip>
          )}
        </Toolbar>

        {/* Row 2: Course Details */}
        <Divider sx={{ opacity: 0.3 }} />
        <Box sx={{ px: { xs: 1, sm: 2 }, py: 1 }}>
          <CourseDetails courseDetails={courseDetails} theme={theme} />
        </Box>

        {/* Row 3: Secondary Actions and Status */}
        <Divider sx={{ opacity: 0.3 }} />
        <Toolbar variant="dense" sx={{ 
          bgcolor: alpha(theme.palette.primary.main, 0.95),
          color: 'white',
          px: { xs: 1, sm: 2 },
          py: 0.5,
          minHeight: '48px !important'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {currentDraft && currentDraft.status !== 'finalized' && (
              <Button
                startIcon={<SaveIcon />}
                onClick={saveDraft}
                variant="outlined"
                size="small"
                sx={{ 
                  color: 'white',
                  borderColor: alpha(theme.palette.common.white, 0.3),
                  '&:hover': { 
                    borderColor: alpha(theme.palette.common.white, 0.6),
                    backgroundColor: alpha(theme.palette.common.white, 0.1) 
                  }
                }}
              >
                Save Draft
              </Button>
            )}
            
            <Button
              startIcon={showPreview ? <VisibilityOffIcon /> : <VisibilityIcon />}
              onClick={() => setShowPreview(prev => !prev)}
              variant="outlined"
              size="small"
              sx={{ 
                color: 'white',
                borderColor: alpha(theme.palette.common.white, 0.3),
                '&:hover': { 
                  borderColor: alpha(theme.palette.common.white, 0.6),
                  backgroundColor: alpha(theme.palette.common.white, 0.1) 
                }
              }}
            >
              {showPreview ? "Hide Preview" : "Show Preview"}
            </Button>
            
            <Button
              startIcon={<HelpOutlineIcon />}
              variant="outlined"
              size="small"
              onClick={() => setMessages(prev => [...prev, {
                role: 'assistant',
                content: "You can ask me to:\n- Generate questions of specific difficulty\n- Set marks for sections\n- Create sections (e.g., Part A, B)\n- Finalize the paper\n- Show the current question paper structure"
              }])}
              sx={{ 
                color: 'white',
                borderColor: alpha(theme.palette.common.white, 0.3),
                '&:hover': { 
                  borderColor: alpha(theme.palette.common.white, 0.6),
                  backgroundColor: alpha(theme.palette.common.white, 0.1) 
                }
              }}
            >
              Help
            </Button>
            
            {currentDraft?.status === 'finalized' && currentDraft.ai_meta_data?.generated_paper_path && (
              <Button
                startIcon={<SendIcon />}
                variant="outlined"
                size="small"
                onClick={handleSendForReview}
                sx={{ 
                  color: 'white',
                  borderColor: alpha(theme.palette.common.white, 0.3),
                  '&:hover': { 
                    borderColor: alpha(theme.palette.common.white, 0.6),
                    backgroundColor: alpha(theme.palette.common.white, 0.1) 
                  }
                }}
              >
                Send for Review
              </Button>
            )}
          </Box>
          
          <Box sx={{ flexGrow: 1 }} /> {/* Spacer */}
          
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="body2" sx={{ mr: 1, fontWeight: 500 }}>
              Status:
            </Typography>
            <Chip 
              label={currentDraft?.status === 'finalized' 
                ? 'Paper Finalized' 
                : currentDraft 
                  ? 'Draft In Progress' 
                  : 'New Paper Draft'
              }
              size="small"
              sx={{ 
                backgroundColor: currentDraft?.status === 'finalized'
                  ? alpha(theme.palette.success.main, 0.8)
                  : alpha(theme.palette.common.white, 0.2),
                color: 'white',
                fontWeight: 500,
              }} 
            />
            {currentDraft && (
              <Chip 
                label={`Draft #${currentDraft.id}`}
                size="small"
                sx={{ 
                  ml: 1, 
                  bgcolor: alpha(theme.palette.common.white, 0.15),
                  color: 'white',
                  fontWeight: 500,
                }} 
              />
            )}
          </Box>
        </Toolbar>
      </Paper>
      
      {/* Main Content Area - Two-column layout with Grid container */}
      <Grid container sx={{ flexGrow: 1, overflow: 'hidden' }}>
        {/* Left Column: Chat Messages */}
        <Grid 
          item xs={12} md={showPreview ? 8 : 12}
          sx={{ 
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            borderRight: showPreview ? { md: `1px solid ${theme.palette.divider}` } : 'none'
          }}
        >
          {/* Messages Container */}
          <Box 
            ref={chatContainerRef}
            sx={{ 
              flexGrow: 1, 
              overflowY: 'auto', 
              p: { xs: 2, sm: 3 },
              background: alpha(theme.palette.primary.light, 0.03),
              scrollBehavior: 'smooth',
              height: '100%' // Take full height of parent
            }}
          >
            <Box maxWidth={isMediumScreen ? "100%" : "800px"} mx="auto">
              <List sx={{ p: 0 }}>
                {messages.map((msg, index) => (
                  <Grow
                    in={true}
                    key={index}
                    timeout={300}
                    style={{ transformOrigin: msg.role === 'user' ? 'right center' : 'left center' }}
                  >
                    <ListItem 
                      sx={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        mb: 2,
                        px: 0,
                      }}
                      disableGutters
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                          alignItems: 'flex-start',
                          maxWidth: '85%',
                          width: isMobile && msg.role === 'assistant' ? '88%' : 'auto',
                        }}
                      >
                        <Avatar 
                          sx={{ 
                            bgcolor: msg.role === 'user' 
                              ? theme.palette.primary.main
                              : theme.palette.secondary.main, 
                            ml: msg.role === 'user' ? 1.5 : 0, 
                            mr: msg.role === 'user' ? 0 : 1.5,
                            mt: 0.5,
                            width: 38, 
                            height: 38,
                          }}
                        >
                          {msg.role === 'user' 
                            ? (user?.name ? user.name.charAt(0).toUpperCase() : <PersonIcon fontSize="small" />) 
                            : <SmartToyIcon fontSize="small" />
                          }
                        </Avatar>
                        <Paper
                          elevation={1}
                          sx={{
                            p: '14px 18px',
                            borderRadius: msg.role === 'user' 
                              ? '20px 4px 20px 20px' 
                              : '4px 20px 20px 20px',
                            background: msg.role === 'user'
                              ? theme.palette.primary.main
                              : theme.palette.background.paper,
                            color: msg.role === 'user' 
                              ? theme.palette.primary.contrastText 
                              : theme.palette.text.primary,
                            wordBreak: 'break-word',
                            whiteSpace: 'pre-wrap',
                            border: msg.role === 'assistant' 
                              ? `1px solid ${alpha(theme.palette.divider, 0.1)}` 
                              : 'none'
                          }}
                        >
                          <ListItemText 
                            primary={renderMessageContent(msg.content)} 
                            primaryTypographyProps={{
                              variant: 'body1',
                              component: 'div',
                              sx: { lineHeight: 1.6 }
                            }}
                            sx={{ m: 0 }}
                          />
                        </Paper>
                      </Box>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          mt: 0.5,
                          ml: msg.role === 'assistant' ? 7 : 0,
                          mr: msg.role === 'user' ? 7 : 0,
                        }}
                      >
                        <Typography 
                          variant="caption" 
                          sx={{
                            color: alpha(theme.palette.text.primary, 0.6),
                            fontWeight: 500,
                            fontSize: '0.7rem'
                          }}
                        >
                          {msg.role === 'user' ? (user?.name || 'You') : 'AI Assistant'}
                        </Typography>
                        <Box 
                          sx={{ 
                            width: 3, 
                            height: 3, 
                            borderRadius: '50%', 
                            bgcolor: alpha(theme.palette.text.primary, 0.3),
                            mx: 0.8
                          }} 
                        />
                        <Typography 
                          variant="caption" 
                          sx={{
                            color: alpha(theme.palette.text.primary, 0.5),
                            fontSize: '0.7rem'
                          }}
                        >
                          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                      </Box>
                    </ListItem>
                  </Grow>
                ))}
              </List>
            
              <div ref={messagesEndRef} />
            
              {isLoading && <LoadingIndicator theme={theme} />}
            </Box>
          </Box>

          {/* Error alert */}
          {error && (
            <Alert 
              severity="error" 
              sx={{ 
                m: 1, 
                mx: { xs: 1, sm: 2, md: 3 } 
              }}
            >
              {error}
            </Alert>
          )}

          {/* Message Input Area */}
          <MessageInput
            inputMessage={inputMessage}
            setInputMessage={setInputMessage}
            handleSendMessage={handleSendMessage}
            isLoading={isLoading}
            currentDraft={currentDraft}
            inputFieldRef={inputFieldRef}
            theme={theme}
          />
        </Grid>

        {/* Right Column: Selected Questions Preview */}
        <Grid 
            item xs={12} md={showPreview ? 4 : false}
            sx={{ 
                display: showPreview ? 'flex' : 'none',
                flexDirection: 'column',
                height: '100%', 
                overflowY: 'auto', 
                p: 2, 
                bgcolor: alpha(theme.palette.background.default, 0.98),
                borderTop: { xs: `1px solid ${theme.palette.divider}`, md: 'none' },
                borderLeft: { md: `1px solid ${theme.palette.divider}` }
            }}
        >
            {pageLoading && !currentDraft ? ( 
                <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" height="100%" textAlign="center">
                    <CircularProgress sx={{mb: 2}} />
                    <Typography color="text.secondary">Loading Preview Data...</Typography>
                </Box>
            ) : currentDraft ? ( // currentDraft is loaded (could be new with empty arrays or existing)
                <SelectedQuestionsPreview 
                    currentDraft={currentDraft} 
                    onPreviewQuestion={handleOpenPreview}
                    onRemoveQuestion={handleRemoveQuestionFromPreview} 
                    onClearPart={handleClearPartFromPreview}
                />
            ) : ( // Not pageLoading, but currentDraft is still null (e.g., new session before first AI interaction)
                <Paper 
                    elevation={0} 
                    sx={{
                        p:3, height: '100%', 
                        display: 'flex', flexDirection: 'column', 
                        justifyContent: 'center', alignItems: 'center', 
                        textAlign: 'center',
                        bgcolor: 'transparent'
                    }}
                >
                    <InfoIcon sx={{fontSize: 48, color: 'text.disabled', mb: 2, opacity: 0.5}}/>
                    <Typography variant="h6" color="text.secondary" gutterBottom sx={{fontWeight: 500}}>
                        Selected Questions
                    </Typography>
                    <Typography variant="body2" color="text.disabled">
                        As you add questions with the AI for Part A and Part B, they will appear here.
                        You can also manage them directly from this panel.
                    </Typography>
                </Paper>
            )}
        </Grid>
      </Grid>

      {/* Question Preview Modal */}
      <QuestionPreviewModal
        open={isPreviewModalOpen}
        onClose={handleClosePreviewModal}
        questionId={selectedQuestionIdForPreview}
      />

      {/* Finalized Alert */}
      {currentDraft?.status === 'finalized' && (
        <Alert 
          severity="success" 
          icon={<CheckCircleIcon />}
          action={
            currentDraft.ai_meta_data?.generated_paper_path && (
              <Button 
                color="inherit" 
                size="small" 
                startIcon={<DownloadIcon />}
                onClick={handleDownloadPaper}
                sx={{ mt: 0.5 }}
              >
                Download Paper
              </Button>
            )
          }
          sx={{
            m: 2, 
            mb: 2,
            position: 'fixed', 
            bottom: 0, 
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: '600px',
            width: '90%',
            borderRadius: 2,
            boxShadow: 3,
            zIndex: 1000
          }}
        >
          <Typography variant="body1" fontWeight={500}>
            Paper has been finalized successfully!
          </Typography>
          {currentDraft.ai_meta_data?.generated_paper_path && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Document: {currentDraft.ai_meta_data.generated_paper_path.split('/').pop()}
            </Typography>
          )}
        </Alert>
      )}

      {/* Send for Review Modal */}
      <SendForReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        paperId={currentDraft?.id}
        onSuccess={handleReviewSuccess}
      />
    </Box>
  );
} 