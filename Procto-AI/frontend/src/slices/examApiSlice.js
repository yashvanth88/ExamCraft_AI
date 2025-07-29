import { apiSlice } from './apiSlice';

// Define the base URL for the exams API
const EXAMS_URL = '/api/users';
const COURSES_URL = '/api/users/courses';

// Inject endpoints for the exam slice
export const examApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Get all exams
    getExams: builder.query({
      query: () => ({
        url: `${EXAMS_URL}/exam`,
        method: 'GET',
      }),
    }),
    // Create a new exam
    createExam: builder.mutation({
      query: (data) => ({
        url: `${EXAMS_URL}/exam`,
        method: 'POST',
        body: data,
      }),
    }),
    // Get questions for a specific exam
    getQuestions: builder.query({
      query: (examId) => ({
        url: `${EXAMS_URL}/exam/questions/${examId}`,
        method: 'GET',
      }),
    }),
    // Get all questions for a specific course
    getQuestionsByCourseId: builder.query({
      query: (courseId) => ({
        url: `${EXAMS_URL}/exam/questions/course/${courseId}`,
        method: 'GET',
      }),
    }),
    // Create a new question for an exam
    createQuestion: builder.mutation({
      query: (data) => ({
        url: `${EXAMS_URL}/exam/questions`,
        method: 'POST',
        body: data,
      }),
    }),
    // Get all courses
    getCourses: builder.query({
      query: () => ({
        url: COURSES_URL,
        method: 'GET',
      }),
    }),
  }),
});

// Export the generated hooks for each endpoint
export const {
  useGetExamsQuery,
  useCreateExamMutation,
  useGetQuestionsQuery,
  useCreateQuestionMutation,
  useGetCoursesQuery,
  useGetQuestionsByCourseIdQuery,
} = examApiSlice;
