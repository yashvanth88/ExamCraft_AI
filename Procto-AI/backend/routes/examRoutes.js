import express from "express";

import { protect } from "../middleware/authMiddleware.js";
import { createExam, getExams } from "../controllers/examController.js";
import {
  createQuestion,
  getQuestionsByExamId,
  getQuestionsByCourseId,
  assignQuestionsToExam,
} from "../controllers/quesController.js";
import {
  getCheatingLogsByExamId,
  saveCheatingLog,
} from "../controllers/cheatingLogController.js";
import { getResultLogs, saveResult } from "../controllers/resultsController.js"
const examRoutes = express.Router();

// protecting Exam route using auth middleware protect /api/users/
// examRoutes.route("/exam").get(protect, getExams).post(protect, createExam);
// examRoutes.route("/exam/questions").post(protect, createQuestion);
// examRoutes.route("/exam/questions/:examId").get(protect, getQuestionsByExamId);
// examRoutes.route("/cheatingLogs/:examId").get(protect, getCheatingLogsByExamId);
// examRoutes.route("/cheatingLogs/").post(protect, saveCheatingLog);
// examRoutes.route("/result").post(protect, saveResult);
// examRoutes.route("/result/:examId").get(protect, getResultLogs);
examRoutes.route("/exam").get(getExams).post(createExam);
examRoutes.route("/exam/questions").post(createQuestion);
examRoutes.route("/exam/questions/:examId").get(getQuestionsByExamId);
examRoutes.route("/exam/questions/course/:courseId").get(getQuestionsByCourseId);
examRoutes.route("/exam/questions/assign").post(assignQuestionsToExam);
examRoutes.route("/cheatingLogs/:examId").get(getCheatingLogsByExamId);
examRoutes.route("/cheatingLogs/").post(saveCheatingLog);
examRoutes.route("/result").post(saveResult);
examRoutes.route("/result/:examId").get(getResultLogs);

export default examRoutes;
