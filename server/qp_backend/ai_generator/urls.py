# server/ai_generator/urls.py
from django.urls import path
from . import views

app_name = 'ai_generator'

urlpatterns = [
    path('chat/', views.AIChatView.as_view(), name='ai_chat'),
    path('drafts/', views.ListFacultyPaperDraftsView.as_view(), name='list_faculty_paper_drafts'),
    path('save-draft/', views.SavePaperDraftView.as_view(), name='save_paper_draft'),
    path('create-draft/', views.CreatePaperDraftView.as_view(), name='create_paper_draft'),
    path('download-paper/', views.DownloadGeneratedPaperView.as_view(), name='download_paper'),
    path('save-annotated-pdf/', views.SaveAnnotatedPDFView.as_view(), name='save_annotated_pdf'),
    path('save-annotations/', views.SaveAnnotationsView.as_view(), name='save_annotations'),
    path('load-annotations/', views.LoadAnnotationsView.as_view(), name='load_annotations'),
    path('health/', views.CheckHealth.as_view(), name='health_check'),
    path('health', views.CheckHealth.as_view(), name='health_check_no_slash'),
    path('faculty-reviewed-papers/', views.faculty_reviewed_papers, name='faculty_reviewed_papers'),
]