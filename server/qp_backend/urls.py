from django.urls import path, include
 
urlpatterns = [
    path('ai/', include('ai_generator.urls')),
    path('api/ai/', include('ai_generator.urls')),
] 