import asyncHandler from "express-async-handler";
import Question from "../models/quesModel.js";

const getQuestionsByExamId = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  console.log("Question Exam id ", examId);

  if (!examId) {
    return res.status(400).json({ error: "examId is missing or invalid" });
  }

  const questions = await Question.find({ examId });
  console.log("Question Exam  ", questions);

  res.status(200).json(questions);
});

const createQuestion = asyncHandler(async (req, res) => {
  const { question, options, examId, courseId } = req.body;

  // Debug log
  console.log('createQuestion req.body:', req.body);

  if (!courseId) {
    console.error('courseId is missing or invalid');
    return res.status(400).json({ error: "courseId is missing or invalid" });
  }

  try {
    const newQuestion = new Question({
      question,
      options,
      examId, // will be undefined for course MCQ bank
      courseId,
    });

    const createdQuestion = await newQuestion.save();

    if (createdQuestion) {
      res.status(201).json(createdQuestion);
    } else {
      console.error('Invalid Question Data');
      res.status(400);
      throw new Error("Invalid Question Data");
    }
  } catch (err) {
    console.error('Mongoose validation or save error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

const getQuestionsByCourseId = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  if (!courseId) {
    return res.status(400).json({ error: "courseId is missing or invalid" });
  }
  const questions = await Question.find({ courseId });
  res.status(200).json(questions);
});

// New: Associate questions with an exam
const assignQuestionsToExam = asyncHandler(async (req, res) => {
  const { examId, questionIds } = req.body;
  if (!examId || !Array.isArray(questionIds) || questionIds.length === 0) {
    return res.status(400).json({ error: 'examId and questionIds are required' });
  }
  await Question.updateMany(
    { _id: { $in: questionIds } },
    { $set: { examId } }
  );
  res.status(200).json({ message: 'Questions assigned to exam successfully' });
});

export { getQuestionsByExamId, createQuestion, getQuestionsByCourseId, assignQuestionsToExam };
