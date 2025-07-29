import express from "express";
import {
  authUser,
  getUserProfile,
  logoutUser,
  registerUser,
  updateUserProfile,
} from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js";
import { createExam, getExams } from "../controllers/examController.js";
import Course from '../models/courseModel.js';
const userRoutes = express.Router();
userRoutes.get("/", async (req, res) => {
  res.send("Server is running!");
});
userRoutes.post("/", registerUser);
userRoutes.post("/auth", authUser);
userRoutes.post("/logout", logoutUser);
userRoutes.post("/register", registerUser);
// protecting profile route using auth middleware protect
userRoutes.route("/profile").get(getUserProfile).put(updateUserProfile);

// Get all courses
userRoutes.get('/courses', async (req, res) => {
  try {
    const courses = await Course.find();
    res.status(200).json(courses);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

// Ensure a course exists by code (courseId), create if not
userRoutes.post('/courses/ensure', async (req, res) => {
  const { code, name } = req.body;
  if (!code || !name) {
    return res.status(400).json({ error: 'code and name are required' });
  }
  try {
    let course = await Course.findOne({ code });
    if (!course) {
      course = await Course.create({ code, name });
    }
    res.status(200).json(course);
  } catch (err) {
    res.status(500).json({ error: 'Failed to ensure course' });
  }
});

export default userRoutes;
