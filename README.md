# VYKAS_EduAIthon

## Overview

**VYKAS_EduAIthon** is a modular educational platform designed to automate exam creation, proctoring, and evaluation using AI. It features:
- **AI-powered question generation** from textbooks and PDFs, mapped to course outcomes and Bloom’s taxonomy.
- **AI-powered question generation** from textbooks and PDFs, mapped to course outcomes and Bloom's taxonomy.
- **Proctoring system** for secure online exams.
- **Student and faculty dashboards** for managing courses, exams, and results.
- **Microservices architecture** with Django, Flask, Node.js, and React.

---

## Project Structure

```
.
├── client/                # Student/Faculty dashboard (React + Vite)
├── server/                # Main backend (Django + DRF)
├── flask-server/          # AI question generation microservice (Flask)
├── Procto-AI/             # Proctoring system (Node.js/Express + React)
│   ├── backend/
│   └── frontend/
└── README.md
```

---

## Features

### 1. AI Question Generation
- Upload PDFs or PPTs to generate MCQs, short/long answer, and numerical questions.
- Questions are mapped to Course Outcomes (COs) and Bloom’s Taxonomy levels.
- Questions are mapped to Course Outcomes (COs) and Bloom's Taxonomy levels.
- Powered by Google Gemini API (via Flask microservice).

### 2. Exam Management (Django)
- Manage departments, courses, units, and users (faculty, students).
- REST API for exam creation, assignment, and evaluation.
- Authentication via Django REST Framework.

### 3. Proctoring (Procto-AI)
- Real-time proctoring using webcam and AI (TensorFlow.js).
- JWT-based authentication and user management.
- Separate backend (Node.js/Express) and frontend (React).

### 4. Student/Faculty Dashboard
- View and take exams, see results, and manage profiles.
- Faculty can assign courses, upload content, and review analytics.

---

## Setup Instructions

### 1. Client (React Dashboard)
```bash
cd client
npm install
npm run dev
```

### 2. Django Server (Exam Management)
```bash
cd server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

### 3. Flask Server (AI Question Generation)
```bash
cd flask-server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

### 4. Proctoring System (Procto-AI)
#### Backend
```bash
cd Procto-AI/backend
npm install
npm run server
```
#### Frontend
```bash
cd Procto-AI/frontend
npm install
npm start
```
Or run both with:
```bash
cd Procto-AI
npm run dev
```

---

## Configuration

- **Django**: Edit `server/qp_backend/qp_backend/settings.py` for DB and email settings.
- **Flask**: Set your Google Gemini API key in the environment or script.
- **Procto-AI**: Configure MongoDB and JWT secrets in backend `.env`.

---

## Dependencies

- **Django/DRF**: See `server/requirements.txt`
- **Flask**: See `flask-server/requirements.txt`
- **React (client & Procto-AI/frontend)**: See respective `package.json`
- **Node.js/Express (Procto-AI/backend)**: See `Procto-AI/package.json`

---

## Example Usage

1. **Faculty uploads a textbook PDF** via the dashboard.
2. **Flask microservice** generates a question bank, mapped to COs and Bloom’s levels.
2. **Flask microservice** generates a question bank, mapped to COs and Bloom's levels.
3. **Faculty reviews and assigns the exam** to students.
4. **Students take the exam** via the dashboard, with proctoring enabled.
5. **Results and analytics** are available to both students and faculty.

---

## Contributing

1. Fork the repo and create your branch.
2. Commit your changes.
3. Open a Pull Request.

---

## License

This project is for educational and research purposes.
