# server/ai_generator/admin.py
from django.contrib import admin
from .models import PaperDraft, PaperReviewAssignment

@admin.register(PaperDraft)
class PaperDraftAdmin(admin.ModelAdmin):
    list_display = ('id', 'faculty', 'course', 'status', 'updated_at', 'created_at')
    list_filter = ('status', 'course', 'faculty')
    search_fields = ('faculty__username', 'course__course_name')
    readonly_fields = ('created_at', 'updated_at')
    # For JSON fields, you might want a custom widget or to display them as pretty JSON
    # For now, they'll be shown as raw text.

@admin.register(PaperReviewAssignment)
class PaperReviewAssignmentAdmin(admin.ModelAdmin):
    list_display = ('id', 'paper', 'reviewer', 'status', 'assigned_at', 'reviewed_at')
    list_filter = ('status', 'assigned_at', 'reviewed_at')
    search_fields = ('paper__course__course_name', 'reviewer__name')
    readonly_fields = ('assigned_at',)