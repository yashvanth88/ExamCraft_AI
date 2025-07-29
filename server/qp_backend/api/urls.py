from django.urls import path
from . import views

urlpatterns = [
    # Authentication
    path('login/', views.login_view, name='login'),
    path('logout/', views.LogoutView.as_view(), name='logout'),
    path('logout/all/', views.LogoutAllDevicesView.as_view(), name='logout_all'),
    path('profile/', views.UserProfileView.as_view(), name='user_profile'),

    #Student
    path('register-student/', views.register_student, name='register-student'),

    #Reviewer
    path('register-reviewer/', views.register_reviewer, name='register-reviewer'),

    # Role-based dashboards
    path('admin-dashboard/', views.admin_dashboard_view, name='admin-dashboard'),
    path('faculty-dashboard/', views.FacultyDashboardView.as_view(), name='faculty_dashboard'),
    path('reviewer-dashboard/', views.ReviewerDashboardView.as_view(), name='reviewer_dashboard'),
    # Profile management
    path('profile/', views.UserProfileView.as_view(), name='user_profile'),

    # Admin CRUD endpoints
    path('department/', views.department_view, name='department-list'),
    path('department/<str:dept_id>/', views.department_view, name='department-detail'),
    path('course/', views.course_view, name='course-list'),
    path('course/<str:course_id>/', views.course_view, name='course-detail'),
    path('faculty-course-mapping/<str:faculty_id>/<str:course_id>/', 
         views.faculty_course_mapping, 
         name='faculty-course-mapping'),
    path('unit/', views.UnitCRUDView.as_view(), name='unit'),
    # Question Management
    path('questions/', views.question_view, name='question-list'),
    path('questions/<int:q_id>/', views.question_view, name='question-detail'),
    path('course/<str:course_id>/questions/', views.course_questions_view, name='course-questions'),
    path('add-question/', views.question_view, name='add-question'),
    path('upload-question/', views.FileUploadView.as_view(), name='upload_question'),
    path('course/<str:course_id>/filter-questions/', views.FilterQuestionsView.as_view(), name='filter-questions'),
    path('questions/', views.QuestionListView.as_view(), name='list_questions'),

    # Department Management
    path('departments/', views.ListEntitiesView.as_view(), name='view_departments'),

    # Course Management
    path('courses/', views.ListEntitiesView.as_view(), name='view_courses'),

    # Unit Management
    path('units/', views.ListEntitiesView.as_view(), name='view_units'),

    # Admin Management
    path('users/', views.UserListView.as_view(), name='user_list'),

    path('faculty/', views.faculty_view, name='faculty-list'),
    path('reviewer/', views.reviewer_view, name='reviewer-list'),
    path('reviewer/<str:r_id>/', views.reviewer_view, name='reviewer-detail'),
    path('faculty/<str:f_id>/', views.faculty_view, name='faculty-detail'),
    # Faculty course management
    path('faculty-courses/', views.faculty_course_view, name='faculty-courses'),

    # Individual question operations
    path('question/', views.question_view, name='question'),
    path('question/<str:q_id>/', views.question_view, name='question-detail'),

    path('paper/<int:paper_id>/answer-scheme/', views.get_answer_scheme, name='get_answer_scheme'),

    path('generate-question-paper/', views.GenerateQuestionPaperView.as_view(), name='generate_question_paper'),
    path('generate-answer-scheme/', views.GenerateAnswerSchemeView.as_view(), name='generate_answer_scheme'),
    
    # Review Assignment endpoints
    path('assign-paper-review/', views.assign_paper_review, name='assign_paper_review'),
    path('reviewer-assigned-papers/', views.reviewer_assigned_papers, name='reviewer_assigned_papers'),
    path('mark-paper-reviewed/<int:assignment_id>/', views.mark_paper_reviewed, name='mark_paper_reviewed'),
]
