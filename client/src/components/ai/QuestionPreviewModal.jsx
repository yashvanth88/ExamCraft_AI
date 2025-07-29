import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, CircularProgress, Box, Alert, Chip, Grid,
  Paper, alpha, useTheme, Divider, Zoom, IconButton
} from '@mui/material';
import { api } from '../../utils/api'; // Adjust path
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AssignmentIcon from '@mui/icons-material/Assignment';

export default function QuestionPreviewModal({ open, onClose, questionId }) {
  const [questionDetails, setQuestionDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const theme = useTheme();

  useEffect(() => {
    if (open && questionId) {
      setLoading(true);
      setError(null);
      setQuestionDetails(null);
      api.get(`/question/${questionId}/`) // Uses existing endpoint
        .then(response => {
          // The endpoint /api/question/<id> returns { question: {...} }
          setQuestionDetails(response.data.question || response.data);
        })
        .catch(err => {
          console.error("Error fetching question details:", err);
          setError(err.response?.data?.error || "Failed to load question details.");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [open, questionId]);

  const renderDetail = (label, value) => (
    <Grid item xs={12} sm={6} key={label}>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ fontWeight: 500, mb: 0.5, opacity: 0.8 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>{value || 'N/A'}</Typography>
    </Grid>
  );

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      TransitionComponent={Zoom}
      transitionDuration={300}
      PaperProps={{
        elevation: 5,
        sx: {
          borderRadius: 2,
          overflow: 'hidden',
          background: theme.palette.mode === 'dark' 
            ? `linear-gradient(to bottom, ${alpha(theme.palette.background.paper, 0.9)}, ${theme.palette.background.paper})` 
            : `linear-gradient(to bottom, ${alpha('#f7f9fc', 0.95)}, #ffffff)`,
        }
      }}
    >
      <DialogTitle 
        sx={{ 
          py: 2.5, 
          px: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: `linear-gradient(to right, ${alpha(theme.palette.primary.light, 0.1)}, ${alpha(theme.palette.background.paper, 0.1)})`,
          borderBottom: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.08)
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <AssignmentIcon sx={{ mr: 1.5, color: theme.palette.primary.main }} />
          <Typography variant="h6" component="div" fontWeight={600}>
            Question Details <Chip
              label={`QID: ${questionId}`}
              size="small"
              sx={{ 
                ml: 1.5, 
                fontWeight: 600, 
                backgroundColor: alpha(theme.palette.primary.main, 0.1),
                color: theme.palette.primary.main,
                fontSize: '0.75rem',
                height: '24px'
              }} 
            />
          </Typography>
        </Box>
        <IconButton 
          aria-label="close"
          onClick={onClose}
          sx={{ 
            color: theme.palette.text.secondary,
            '&:hover': {
              backgroundColor: alpha(theme.palette.primary.main, 0.05),
              color: theme.palette.primary.main
            }
          }}
        >
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent 
        dividers={false}
        sx={{ 
          p: 0,
          '&:first-of-type': {
            pt: 0
          }
        }}
      >
        {loading && (
          <Box display="flex" justifyContent="center" alignItems="center" my={8} py={3} sx={{ height: '200px' }}>
            <CircularProgress 
              size={40} 
              thickness={4} 
              sx={{ 
                color: theme.palette.primary.main
              }} 
            />
          </Box>
        )}
        {error && (
          <Box sx={{ p: 3 }}>
            <Alert 
              severity="error" 
              elevation={2} 
              sx={{ 
                mb: 2,
                display: 'flex',
                alignItems: 'center',
                borderRadius: 1.5
              }}
              icon={<ErrorOutlineIcon fontSize="inherit" />}
            >
              <Typography variant="body2" fontWeight={500}>{error}</Typography>
            </Alert>
          </Box>
        )}
        {questionDetails && !loading && (
          <Box>
            <Paper 
              elevation={0} 
              sx={{ 
                p: 3, 
                borderBottom: '1px solid',
                borderColor: alpha(theme.palette.divider, 0.08)
              }}
            >
              <Typography 
                variant="h6" 
                component="div" 
                gutterBottom 
                sx={{ 
                  whiteSpace: 'pre-wrap',
                  fontWeight: 500,
                  lineHeight: 1.6,
                  color: alpha(theme.palette.text.primary, 0.95)
                }}
              >
                {questionDetails.text}
              </Typography>
            </Paper>
            
            <Box sx={{ p: 3 }}>
              <Typography 
                variant="subtitle2"
                sx={{ 
                  mb: 2, 
                  fontWeight: 600, 
                  color: theme.palette.text.secondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  fontSize: '0.75rem',
                  opacity: 0.9
                }}
              >
                Question Attributes
              </Typography>
              <Divider sx={{ mb: 2, opacity: 0.6 }} />
              <Grid container spacing={3} sx={{ mt: 0 }}>
                {renderDetail("Marks", questionDetails.marks)}
                {renderDetail("Type", questionDetails.type)}
                {renderDetail("Difficulty", questionDetails.difficulty_level)}
                {renderDetail("Course Outcome (CO)", questionDetails.co)}
                {renderDetail("Bloom's Taxonomy (BT)", questionDetails.bt)}
                {renderDetail("Unit ID", questionDetails.unit_id)}
              </Grid>
            </Box>
            {/* Add rendering for images/media if available in questionDetails */}
          </Box>
        )}
      </DialogContent>
      
      <DialogActions sx={{ p: 2, justifyContent: 'flex-end', borderTop: '1px solid', borderColor: alpha(theme.palette.divider, 0.08) }}>
        <Button 
          onClick={onClose} 
          variant="outlined" 
          color="primary"
          sx={{
            px: 3,
            py: 0.8,
            borderRadius: '8px',
            fontWeight: 500,
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
} 