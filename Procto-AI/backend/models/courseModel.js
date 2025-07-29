import mongoose from "mongoose";

const courseSchema = mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  // Add other fields as needed
});

const Course = mongoose.model("Course", courseSchema);

export default Course; 