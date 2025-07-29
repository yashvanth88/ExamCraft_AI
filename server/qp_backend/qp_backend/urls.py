from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),  # Include your app's URLs
    path('api/ai/', include('ai_generator.urls')),  # New AI generator app, prefixed

]


