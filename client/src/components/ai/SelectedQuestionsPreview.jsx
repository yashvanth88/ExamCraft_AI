import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, List, ListItem, ListItemText, Chip, 
    IconButton, Tooltip, Collapse, Button, Divider,
    ListItemIcon, alpha, useTheme, Stack
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'; // For title
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'; // For filled part
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined'; // For part needing attention

// Re-using QuestionItem from Prompt 36, ensure it's robust
const QuestionItem = ({ qId, questionObject, onPreview, onRemove, part, theme }) => {
    // questionObject is the full Question model data, if available
    // This avoids fetching text for each item individually if parent can provide it
    const displayText = questionObject 
        ? `${questionObject.text.substring(0, 60)}${questionObject.text.length > 60 ? '...' : ''} (M:${questionObject.marks}, T:${questionObject.type})`
        : `QID ${qId}`;

    return (
        <ListItem
            disablePadding
            secondaryAction={
                <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Preview Full Question">
                        <IconButton edge="end" aria-label="preview" onClick={() => onPreview(qId)} size="small">
                            <VisibilityIcon fontSize="inherit" />
                        </IconButton>
                    </Tooltip>
                    {onRemove && (
                        <Tooltip title="Remove Question from Draft">
                            <IconButton edge="end" aria-label="delete" onClick={() => onRemove(qId, part)} size="small" color="error">
                                <DeleteIcon fontSize="inherit" />
                            </IconButton>
                        </Tooltip>
                    )}
                </Stack>
            }
            sx={{ 
                mb: 0.5, 
                bgcolor: alpha(theme.palette.background.default, 0.4),
                borderRadius: '8px',
                '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.6) },
            }}
        >
            <ListItemText 
                primary={displayText} 
                secondary={`QID: ${qId}`} 
                primaryTypographyProps={{variant: 'body2', fontWeight: 500, noWrap: true}}
                secondaryTypographyProps={{variant: 'caption'}}
                sx={{pl:1.5, py: 0.75}}
            />
        </ListItem>
    );
};

export default function SelectedQuestionsPreview({ currentDraft, onPreviewQuestion, onRemoveQuestion, onClearPart }) {
  const theme = useTheme();
  const [openPartA, setOpenPartA] = useState(true);
  const [openPartB, setOpenPartB] = useState(true);
  
  // State to hold fetched question details for preview items
  const [questionDetailsMap, setQuestionDetailsMap] = useState({});

  const partA_IDs = currentDraft?.part_a_question_ids || [];
  const partB_IDs = currentDraft?.part_b_question_ids || [];
  
  const partAMarksCurrent = currentDraft?.constraints?.part_a_current_marks || 0;
  const partBMarksCurrent = currentDraft?.constraints?.part_b_current_marks || 0;
  const partAMarksTarget = currentDraft?.constraints?.part_a_total_marks || 0;
  const partBMarksTarget = currentDraft?.constraints?.part_b_total_marks || 0;

  // Effect to fetch brief details for questions in the preview (optional optimization)
  // This avoids N calls if we don't need full details for the list item immediately.
  // For now, QuestionItem can fetch its own details if needed, or we can pass them.
  // Let's assume we pass full question objects if available, or QIDs if not.

  const renderPartSection = (title, qIds, questionObjects, isOpen, toggleOpen, partChar, currentMarks, targetMarks) => {
    const isFilled = currentMarks >= targetMarks && targetMarks > 0;
    const needsAttention = currentMarks < targetMarks && targetMarks > 0;

    return (
        <Paper elevation={2} sx={{ mb: 2.5, borderRadius: '12px', overflow: 'hidden' }}>
            <Box 
                onClick={toggleOpen} 
                sx={{ 
                    p: '12px 16px', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    bgcolor: isFilled ? alpha(theme.palette.success.light, 0.2) : needsAttention ? alpha(theme.palette.warning.light, 0.2) : 'grey.200',
                    borderBottom: isOpen ? `1px solid ${theme.palette.divider}` : 'none',
                    '&:hover': { bgcolor: isOpen ? (isFilled ? alpha(theme.palette.success.light, 0.3) : needsAttention ? alpha(theme.palette.warning.light, 0.3) : 'grey.300') : undefined }
                }}
            >
                <Stack direction="row" alignItems="center" spacing={1}>
                    {isFilled && <CheckCircleOutlineIcon fontSize="small" color="success" />}
                    {needsAttention && <ReportProblemOutlinedIcon fontSize="small" color="warning" />}
                    <Typography variant="subtitle1" fontWeight="600">
                        {title}
                    </Typography>
                    <Chip 
                        label={`${qIds.length} Qs | ${currentMarks}/${targetMarks} M`} 
                        size="small" 
                        color={isFilled ? "success" : needsAttention ? "warning" : "default"}
                        variant="outlined"
                        sx={{fontWeight: 500}}
                    />
                </Stack>
                <Box>
                    {qIds.length > 0 && onClearPart && (
                        <Tooltip title={`Clear all from ${title}`}>
                            <IconButton 
                                onClick={(e) => { e.stopPropagation(); onClearPart(partChar); }} 
                                size="small" 
                                color="error"
                                sx={{mr:1, '&:hover': {bgcolor: alpha(theme.palette.error.main, 0.1)}}}
                            >
                                <ClearAllIcon fontSize="small"/>
                            </IconButton>
                        </Tooltip>
                    )}
                    <IconButton size="small">{isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}</IconButton>
                </Box>
            </Box>
            <Collapse in={isOpen} timeout="auto" unmountOnExit>
                <List dense sx={{p:1.5, bgcolor: alpha(theme.palette.background.paper, 0.7)}}>
                    {qIds.length > 0 ? (
                        qIds.map(qId => (
                            <QuestionItem 
                                key={qId} 
                                qId={qId} 
                                questionObject={questionDetailsMap[qId]} // Pass details if fetched
                                onPreview={onPreviewQuestion} 
                                onRemove={onRemoveQuestion} 
                                part={partChar}
                                theme={theme}
                            />
                        ))
                    ) : (
                        <ListItem><ListItemText secondary={`No questions selected for ${title}.`} sx={{textAlign: 'center', color: 'text.secondary', fontStyle: 'italic'}} /></ListItem>
                    )}
                </List>
            </Collapse>
        </Paper>
    );
  };

  return (
    <Box sx={{ p: {xs: 1, sm: 1.5}, width: '100%', height: '100%'}}> 
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} px={1}>
        <Stack direction="row" alignItems="center" spacing={1}>
            <PlaylistAddCheckIcon color="primary" />
            <Typography variant="h6" fontWeight={600}>Selected Questions</Typography>
        </Stack>
        {onClearPart && (partA_IDs.length > 0 || partB_IDs.length > 0) && (
          <Button 
            size="small" 
            variant="outlined"
            color="error" 
            startIcon={<ClearAllIcon/>}
            onClick={() => onClearPart('All')}
            sx={{fontWeight: 500}}
          >
            Clear Draft
          </Button>
        )}
      </Box>
      <Divider sx={{mb:2}}/>
      {renderPartSection("Part A (Quiz / MCQ)", partA_IDs, questionDetailsMap, openPartA, () => setOpenPartA(!openPartA), 'A', partAMarksCurrent, partAMarksTarget)}
      {renderPartSection("Part B (Test)", partB_IDs, questionDetailsMap, openPartB, () => setOpenPartB(!openPartB), 'B', partBMarksCurrent, partBMarksTarget)}
    </Box>
  );
} 