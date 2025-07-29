import React, { useState, useEffect } from 'react';
import { Button, Checkbox, List, ListItem, ListItemText, ListItemIcon, Typography, Box } from '@mui/material';
import { useGetQuestionsByCourseIdQuery } from 'src/slices/examApiSlice';
import axios from 'axios';
import { toast } from 'react-toastify';

const SelectQuestionsForExam = ({ courseId, examId, onSuccess }) => {
  const { data: questions, isLoading } = useGetQuestionsByCourseIdQuery(courseId);
  const [selected, setSelected] = useState([]);

  // Debug logs
  console.log('SelectQuestionsForExam courseId:', courseId);
  console.log('SelectQuestionsForExam questions:', questions);

  useEffect(() => {
    setSelected([]); // Reset selection if course changes
  }, [courseId]);

  const handleToggle = (questionId) => {
    setSelected((prev) =>
      prev.includes(questionId)
        ? prev.filter((id) => id !== questionId)
        : [...prev, questionId]
    );
  };

  const handleAssign = async () => {
    if (!examId || selected.length === 0) {
      toast.error('Please select at least one question and ensure exam is created.');
      return;
    }
    try {
      await axios.post('/api/users/exam/questions/assign', {
        examId,
        questionIds: selected,
      });
      toast.success('Questions assigned to exam!');
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error('Failed to assign questions.');
    }
  };

  if (isLoading) return <div>Loading questions...</div>;
  if (!questions || questions.length === 0) return <div>No questions available for this course.</div>;

  return (
    <Box>
      <Typography variant="h6" mb={2}>Select Questions for Exam</Typography>
      <List>
        {questions.map((q) => (
          <ListItem key={q._id} button onClick={() => handleToggle(q._id)}>
            <ListItemIcon>
              <Checkbox edge="start" checked={selected.includes(q._id)} tabIndex={-1} />
            </ListItemIcon>
            <ListItemText
              primary={q.question}
              secondary={q.options.map((opt, idx) => `${String.fromCharCode(65+idx)}. ${opt.optionText}${opt.isCorrect ? ' (Correct)' : ''}`).join(' | ')}
            />
          </ListItem>
        ))}
      </List>
      <Button variant="contained" color="primary" onClick={handleAssign} sx={{ mt: 2 }}>
        Assign Selected Questions to Exam
      </Button>
    </Box>
  );
};

export default SelectQuestionsForExam; 