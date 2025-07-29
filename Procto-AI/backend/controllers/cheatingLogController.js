import asyncHandler from "express-async-handler";
import CheatingLog from "../models/cheatingLogModel.js";

// @desc Save cheating log data
// @route POST /api/cheatingLogs
// @access Private
const saveCheatingLog = asyncHandler(async (req, res) => {
  const {
    noFaceCount,
    multipleFaceCount,
    cellPhoneCount,
    prohibitedObjectCount,
    examId,
    username,
    email,
  } = req.body;
  console.log('saveCheatingLog received:', { noFaceCount, multipleFaceCount, cellPhoneCount, prohibitedObjectCount, examId, username, email });

  const cheatingLog = new CheatingLog({
    noFaceCount,
    multipleFaceCount,
    cellPhoneCount,
    prohibitedObjectCount,
    examId,
    username,
    email,
  });

  const savedLog = await cheatingLog.save();
  console.log('saveCheatingLog saved:', savedLog);

  if (savedLog) {
    res.status(201).json(savedLog);
  } else {
    res.status(400);
    throw new Error("Invalid Cheating Log Data");
  }
});

// @desc Get all cheating log data for a specific exam
// @route GET /api/cheatingLogs/:examId
// @access Private
const getCheatingLogsByExamId = asyncHandler(async (req, res) => {
  const examId = req.params.examId;
  console.log('getCheatingLogsByExamId examId:', examId);
  const cheatingLogs = await CheatingLog.find({ examId });
  console.log('getCheatingLogsByExamId found:', cheatingLogs);
  res.status(200).json(cheatingLogs);
});

export { saveCheatingLog, getCheatingLogsByExamId };
