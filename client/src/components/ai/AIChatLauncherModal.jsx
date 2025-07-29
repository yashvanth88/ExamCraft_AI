import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, List, ListItem, ListItemText, CircularProgress,
  Typography, Box, Divider, Alert,
  ListItemButton, ListItemIcon
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import HistoryIcon from '@mui/icons-material/History';
import { api } from '../../utils/api'; // Adjust path if necessary

export default function AIChatLauncherModal({ open, onClose, course, navigate }) {
  const [drafts, setDrafts] = useState([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && course) {
      fetchDrafts();
    } else {
      // Reset when modal is closed or no course
      setDrafts([]);
      setError(null);
    }
  }, [open, course]);

  const fetchDrafts = async () => {
    setLoadingDrafts(true);
    setError(null);
    try {
      // The backend endpoint /api/ai/drafts/ filters by faculty implicitly
      const response = await api.get('/ai/drafts/'); 
      // Filter drafts for the current selected course
      const courseSpecificDrafts = response.data.filter(draft => draft.course === course.id && draft.status === 'drafting');
      setDrafts(courseSpecificDrafts);
    } catch (err) {
      console.error("Error fetching AI drafts:", err);
      setError(err.response?.data?.detail || "Failed to load existing drafts.");
    } finally {
      setLoadingDrafts(false);
    }
  };

  const handleStartNewChat = () => {
    onClose(); // Close modal
    navigate(`/faculty/ai-chat/${course.id}`); // Navigate without draftId
  };

  const handleResumeDraft = (draftId) => {
    onClose(); // Close modal
    navigate(`/faculty/ai-chat/${course.id}/${draftId}`);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        AI Paper Generator for <Typography component="span" fontWeight="bold">{course?.name}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        
        <Button
          fullWidth
          variant="contained"
          color="primary"
          startIcon={<AddCircleOutlineIcon />}
          onClick={handleStartNewChat}
          sx={{ mb: 2, py: 1.5 }}
        >
          Start New AI-Generated Paper
        </Button>

        <Divider sx={{ my: 2 }}>
            <Typography variant="overline">Or Resume Existing Draft</Typography>
        </Divider>

        {loadingDrafts ? (
          <Box display="flex" justifyContent="center" my={2}>
            <CircularProgress />
          </Box>
        ) : drafts.length > 0 ? (
          <List>
            {drafts.map((draft) => (
              <ListItem 
                key={draft.id}
                disablePadding
                sx={{ border: '1px solid #ddd', borderRadius: 1, mb: 1 }}
              >
                <ListItemButton onClick={() => handleResumeDraft(draft.id)} sx={{ borderRadius: 1 }}>
                  <ListItemIcon sx={{minWidth: 'auto', mr: 1.5}}>
                    <HistoryIcon sx={{color: 'text.secondary'}}/>
                  </ListItemIcon>
                  <ListItemText
                    primary={`Draft (ID: ${draft.id}) - Last updated: ${new Date(draft.updated_at).toLocaleString()}`}
                    secondary={`Status: ${draft.status}`}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        ) : (
          <Typography textAlign="center" color="text.secondary">
            No active AI drafts found for this course.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
} 