# server/ai_generator/serializers.py
from rest_framework import serializers
from .models import PaperDraft
from api.models import Question # For potentially embedding question details later
from api.serializers import QuestionSerializer # If you want to reuse existing QuestionSerializer

class PaperDraftSerializer(serializers.ModelSerializer):
    # You might want to expand this later to include serialized question details
    # For now, it will just show question IDs.
    class Meta:
        model = PaperDraft
        fields = [
            'id', 'faculty', 'course', 'constraints', 
            'part_a_question_ids', 'part_b_question_ids', 
            'conversation_history', 'ai_meta_data', 'status', 
            'created_at', 'updated_at'
        ]
        read_only_fields = ('id', 'faculty', 'created_at', 'updated_at') # Faculty set by view

class AIChatRequestSerializer(serializers.Serializer):
    draft_id = serializers.IntegerField(required=False, allow_null=True)
    course_id = serializers.CharField(required=False, allow_null=True, max_length=50) # e.g., from your Course model PK
    message = serializers.CharField()

    def validate(self, data):
        if not data.get('draft_id') and not data.get('course_id'):
            raise serializers.ValidationError("Either draft_id or course_id must be provided for a new chat.")
        if data.get('draft_id') and data.get('course_id'):
            # Could allow this if we want to change course, but simpler to disallow for now
            pass # Or raise serializers.ValidationError("Cannot provide both draft_id and course_id.") 
        return data

class AIChatResponseSerializer(serializers.Serializer):
    draft = PaperDraftSerializer()
    ai_reply = serializers.CharField()
    # Potentially add structured data here for the frontend to use directly
    # e.g., suggested_questions = QuestionSerializer(many=True, read_only=True)