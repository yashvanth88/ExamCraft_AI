import React, { useEffect, useState } from 'react';
import { Box, Typography, Card, Button, List, ListItem, ListItemText, CircularProgress } from '@mui/material';
import AddCourseQuestionForm from './components/AddCourseQuestionForm';
import { useGetCoursesQuery } from 'src/slices/examApiSlice';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const AddCourseMCQBank = () => {
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get('courseId');
  const navigate = useNavigate();
  const { data: courses, isLoading, refetch } = useGetCoursesQuery();
  const [ensured, setEnsured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ensureCourse = async () => {
      if (courseId) {
        setLoading(true);
        setError(null);
        try {
          await axios.post('/api/users/courses/ensure', {
            code: courseId,
            name: courseId,
          });
          await refetch();
          setEnsured(true);
        } catch (err) {
          setError('Failed to ensure course');
        } finally {
          setLoading(false);
        }
      }
    };
    if (courseId) {
      ensureCourse();
    }
  }, [courseId]);

  if (!courseId) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <Card sx={{ p: 4, width: '100%', maxWidth: 600 }}>
          <Typography variant="h4" textAlign="center" mb={3}>
            Select a Course to Add MCQs
          </Typography>
          {isLoading ? (
            <Typography>Loading courses...</Typography>
          ) : (
            <List>
              {courses && courses.length > 0 ? (
                courses.map((course) => (
                  <ListItem button key={course._id} onClick={() => navigate(`/course-mcq-bank?courseId=${course.code}`)}>
                    <ListItemText primary={course.name} secondary={course.code} />
                  </ListItem>
                ))
              ) : (
                <Typography>No courses found.</Typography>
              )}
            </List>
          )}
        </Card>
      </Box>
    );
  }

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}><CircularProgress /></Box>;
  }
  if (error) {
    return <Box color="error.main">{error}</Box>;
  }
  if (!ensured) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <Card sx={{ p: 4, width: '100%', maxWidth: 600 }}>
        <Typography variant="h4" textAlign="center" mb={3}>
          Add MCQs to Course
        </Typography>
        <AddCourseQuestionForm />
      </Card>
    </Box>
  );
};

export default AddCourseMCQBank; 