# server/ai_generator/views.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.generics import ListAPIView # For a simple list view
from django.utils.decorators import method_decorator # For applying decorator to class method
import json  # For JSON formatting in system prompt
import os  # For file path operations
from django.conf import settings  # For accessing Django settings
from django.utils import timezone
from django.http import FileResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.parsers import MultiPartParser, FormParser
from django.contrib.auth.decorators import login_required
import mimetypes
from datetime import datetime
import uuid

from .models import PaperDraft, PaperReviewAssignment
from .serializers import AIChatRequestSerializer, AIChatResponseSerializer, PaperDraftSerializer
from .services import GeminiService, PaperConstructionService
from api.models import Course, Reviewer # Assuming Course model is in api.models
from api.middleware import role_required # Re-use your existing role middleware

class AIChatView(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(role_required(allowed_roles=['faculty']))
    def post(self, request, *args, **kwargs):
        request_serializer = AIChatRequestSerializer(data=request.data)
        if not request_serializer.is_valid():
            return Response(request_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated_data = request_serializer.validated_data
        user = request.user
        faculty_message = validated_data.get('message')
        draft_id = validated_data.get('draft_id')
        course_id_from_request = validated_data.get('course_id')

        is_new_ui_session_flag = not draft_id  # True if no draft_id from URL, implying UI intends "new"

        draft, created = PaperConstructionService.get_or_create_draft(
            user=user,
            course_id=course_id_from_request,
            draft_id=draft_id,
            is_new_ui_session=is_new_ui_session_flag  # Pass the flag
        )

        if not draft:
            if draft_id: return Response({"error": "Draft not found or access denied."}, status=status.HTTP_404_NOT_FOUND)
            if course_id_from_request: return Response({"error": f"Course with ID {course_id_from_request} not found."}, status=status.HTTP_404_NOT_FOUND)
            return Response({"error": "Could not load or create a draft."}, status=status.HTTP_400_BAD_REQUEST)

        # Handle special case for resuming a session
        if faculty_message == "SYSTEM_RESUME_SESSION_FETCH_DETAILS" and draft:
            # This is a system call to fetch draft details on resume.
            ai_reply_text = f"Welcome back to your session for {draft.course.course_name}! How would you like to continue with your question paper?"
            
            # No need to process this system message - just provide a welcome and current draft state
            response_serializer = AIChatResponseSerializer({
                "draft": draft, # The loaded draft
                "ai_reply": ai_reply_text
            })
            return Response(response_serializer.data, status=status.HTTP_200_OK)

        # For regular messages, continue with the standard flow
        # Append user message to conversation history *before* processing by PaperConstructionService for this turn
        # because the service might react to the AI's *previous* turn's actions.
        # The faculty_message is for the *current* turn AI needs to respond to.
        
        # Process AI's *previous* response (if any) to update draft state based on its actions
        # This happens if the AI's last response contained an ACTION.
        # For the very first message from user in a draft, there's no previous AI reply to process actions from.
        if draft.conversation_history and draft.conversation_history[-1]['role'] == 'assistant':
            last_ai_reply_content = draft.conversation_history[-1]['content']
            # The PaperConstructionService instance is fresh, so its __init__ clears pending narration
            # from *its own state*, but the draft from DB might still have it from a *previous* HTTP request's service instance.
            # We re-instantiate the service here, so it processes the *current state of the draft* including any actions
            # triggered by the AI's *last* response.
            # This is subtle: actions from AI's turn N are processed before AI generates response for turn N+1.
            # Construction service clears its own temporary pending flags, but the main processing happens here.
            temp_construction_service = PaperConstructionService(draft) # uses current draft state
            temp_construction_service.process_faculty_request(
                faculty_message_content="N/A - Processing previous AI actions", # Not directly relevant here
                ai_reply_content=last_ai_reply_content
            )
            # The draft is now updated by actions from AI's last turn.

        draft.conversation_history.append({"role": "user", "content": faculty_message})
        
        # --- REFINED SYSTEM PROMPT with dynamic data injection ---
        current_constraints = draft.constraints
        part_a_total_marks = current_constraints.get('part_a_total_marks', 10)
        part_b_total_marks = current_constraints.get('part_b_total_marks', 50)
        total_marks = current_constraints.get('total_marks', 60)
        part_a_qs_str = ", ".join(map(str, draft.part_a_question_ids)) if draft.part_a_question_ids else "None"
        part_b_qs_str = ", ".join(map(str, draft.part_b_question_ids)) if draft.part_b_question_ids else "None"
        part_a_current_marks_from_constraints = current_constraints.get('part_a_current_marks', 0)
        part_b_current_marks_from_constraints = current_constraints.get('part_b_current_marks', 0)
        part_a_total_marks_from_constraints = part_a_total_marks  # For example use
        part_b_total_marks_from_constraints = part_b_total_marks  # For example use

        # Variables for the examples in the system prompt with clearer names
        part_a_target_marks_val = part_a_total_marks  # Renamed for clarity in examples
        part_a_current_marks_val = part_a_current_marks_from_constraints  # Renamed for clarity in examples
        part_b_target_marks_val = part_b_total_marks  # Renamed for clarity in examples
        part_b_current_marks_val = part_b_current_marks_from_constraints  # Renamed for clarity in examples
        
        # Dynamically add narration data to the prompt if available
        narration_prompt_addition = ""
        
        # Simple Action Acknowledgment for immediate feedback
        if draft.ai_meta_data.get('pending_ai_narration_data_simple_ack'):
            ack_msg = draft.ai_meta_data.get('pending_ai_narration_data_simple_ack')
            narration_prompt_addition += f"\n**System Note (Action Acknowledgment):** Please confirm the following to the faculty: \"{ack_msg}\"\n"
        
        # Suggestions Narration
        if draft.ai_meta_data.get('pending_ai_narration_data_suggestions'):
            suggestion_data = draft.ai_meta_data.get('pending_ai_narration_data_suggestions', {})
            questions = suggestion_data.get('questions', [])
            for_part_hint = suggestion_data.get('for_part_hint')
            for_type = suggestion_data.get('for_type')
            total_suggested_marks = suggestion_data.get('total_suggested_marks')

            # Extract just the QIDs for AI memory
            qids_only_for_ai_memory = [s['q_id'] for s in questions]
            
            suggestions_str = "\n".join([
                f"- QID {s['q_id']}: {s['text_summary']} (Type: {s['type']}, Unit: {s.get('unit_name', 'N/A')}, Marks: {s['marks']}, Diff: {s['difficulty']}, CO: {s['co']}, BT: {s['bt']})" 
                for s in questions
            ])
            aimed_for_marks = suggestion_data.get('target_marks_for_part_when_suggested')
            narration_prompt_addition += f"\n**System Note (Suggestions Found):** For your request for Part {for_part_hint} (aiming for {aimed_for_marks} marks), I found the following {for_type or ''} questions, totaling {total_suggested_marks} marks:\n{suggestions_str}\n"
            if total_suggested_marks < aimed_for_marks:
                narration_prompt_addition += f"This set is {aimed_for_marks - total_suggested_marks} marks short of the aim. "
            elif total_suggested_marks > aimed_for_marks: # Should be less likely with new backend logic for balanced
                narration_prompt_addition += f"This set is {total_suggested_marks - aimed_for_marks} marks over the aim. "
            narration_prompt_addition += "Please review and tell me which QIDs you'd like to add. If the total isn't perfect, we can try to adjust or find more.\n"
            narration_prompt_addition += f"QIDs for your reference: {qids_only_for_ai_memory}\n"
            narration_prompt_addition += f"target_marks_for_part: {current_constraints.get(f'part_{for_part_hint.lower()}_total_marks') if for_part_hint else None}\n"

        # Violation Narration
        elif draft.ai_meta_data.get('pending_ai_narration_data_violation'):
            violation_msg = draft.ai_meta_data.get('pending_ai_narration_data_violation')
            narration_prompt_addition += f"\n**System Note (Constraint Violation):** Please inform the faculty: \"{violation_msg}\"\n"

        # Coverage Summary Narration
        if draft.ai_meta_data.get('pending_ai_narration_data_coverage_summary'):
            coverage_summary = draft.ai_meta_data.get('pending_ai_narration_data_coverage_summary')
            coverage_str = json.dumps(coverage_summary, indent=2) # Pretty print JSON
            narration_prompt_addition += f"\n**System Note (Coverage Summary):** Here's the calculated coverage. Please present it to the faculty:\n{coverage_str}\n"

        # Question Details Narration
        if draft.ai_meta_data.get('pending_ai_narration_data_question_details'):
            q_details = draft.ai_meta_data.get('pending_ai_narration_data_question_details')
            details_str = json.dumps(q_details, indent=2)
            narration_prompt_addition += f"\n**System Note (Question Details):** Here are the details for QID {q_details.get('q_id', 'N/A')}. Please present them:\n{details_str}\n"

        # Question Swap Result Narration
        if draft.ai_meta_data.get('pending_ai_narration_data_swap_result'):
            swap_result = draft.ai_meta_data.get('pending_ai_narration_data_swap_result')
            narration_prompt_addition += f"\n**System Note (Question Swap Result):** Please inform the faculty about the question swap: \"{swap_result}\"\n"

        # Difficulty Tuning Result Narration
        if draft.ai_meta_data.get('pending_ai_narration_data_tune_result'):
            tune_result = draft.ai_meta_data.get('pending_ai_narration_data_tune_result')
            narration_prompt_addition += f"\n**System Note (Difficulty Tune Result):** Please inform the faculty about the difficulty tuning: \"{tune_result}\"\n"

        # Finalize Paper Result Narration
        if draft.ai_meta_data.get('pending_ai_narration_data_finalize_result'):
            finalize_result = draft.ai_meta_data.get('pending_ai_narration_data_finalize_result')
            narration_prompt_addition += f"\n**System Note (Finalize Paper Result):** Please inform the faculty: \"{finalize_result}\"\n"

        system_prompt = f"""You are an AI assistant helping a faculty member create a question paper for the course '{draft.course.course_name}' (Course ID: {draft.course.pk}).
Your primary role is to understand the faculty's requirements and suggest actions or questions.
I (the backend application) will handle the actual database queries and paper modifications based on your structured suggestions.
{narration_prompt_addition}

**IMMEDIATE TASK & CONTEXT AWARENESS (VERY IMPORTANT!):**
1.  **IF a 'System Note (Action Acknowledgment)' is present above:**
    *   Your *first sentence* MUST be to relay this acknowledgment to the faculty (e.g., "Constraints updated. Part A is now X/Y marks."). 
    *   After relaying the acknowledgment, THEN address the faculty's current message: "{faculty_message}".

2.  **IF a 'System Note (Suggestions Found)' is present above (and no overriding Acknowledgment):**
    *   Let `suggestion_data` be the content of this System Note. It includes `questions`, `for_part_hint`, `total_suggested_marks`, and `target_marks_for_part_when_suggested`.
    *   Present these suggestions clearly. State the intended Part, the `total_suggested_marks`, and the `target_marks_for_part_when_suggested`.
    *   **If `total_suggested_marks` does not exactly match `target_marks_for_part_when_suggested`:** Acknowledge this (e.g., "This set totals X marks, we were aiming for Y.").
    
    *   **Intelligent Handling of User Confirmation (e.g., "proceed", "add them all"):**
        *   **IF `total_suggested_marks` IS LESS THAN OR EQUAL TO `target_marks_for_part_when_suggested`:**
            If the faculty gives a general confirmation, state you will add ALL suggested QIDs from the System Note to the specified part. Generate `[ACTION: ADD_QUESTIONS]` with all those QIDs. Then, if appropriate (multi-part initial request), proceed to suggest for the next part.
            Example: "Okay, I found these [N] questions for Part A totaling [total_suggested_marks] marks, which is within your target of [target_marks_for_part_when_suggested]. Since you said 'proceed', I'll add them all. Now, moving to Part B... 
            `[ACTION: ADD_QUESTIONS {{\"part\":\"A\", \"q_ids\":[...]}}]` 
            `[ACTION: SUGGEST_BALANCED_QUESTIONS {{\"part\":\"B\", ...}}]`"

        *   **IF `total_suggested_marks` IS GREATER THAN `target_marks_for_part_when_suggested`:**
            Inform the faculty: "I found a good set of questions totaling [total_suggested_marks] marks, but the target for Part [X] was [target_marks_for_part_when_suggested] marks."
            Then, offer choices:
            1.  "Shall I add questions from this list sequentially until the [target_marks_for_part_when_suggested] mark limit is reached?" (If they say yes, your `ADD_QUESTIONS` action should contain only a subset of QIDs from the suggestions that fit).
            2.  "Or would you prefer to select specific QIDs from this list yourself?"
            3.  "Or should I try to find a different set of suggestions that more closely matches the [target_marks_for_part_when_suggested] mark target?"
            Await their decision before generating an `ADD_QUESTIONS` or new `SUGGEST_BALANCED_QUESTIONS` action. Do NOT automatically try to add all if it overflows.
            
        *   **IF `total_suggested_marks` IS SLIGHTLY UNDER `target_marks_for_part_when_suggested` (e.g., by 1-5 marks):**
            If the faculty gives general confirmation, you may:
            1. Add all questions and explain that we're slightly under the target, but can look for more if needed
            2. Offer to try again for a more precise match
            3. Ask if they'd like to select a different question to add to these to get closer to the target

        *   **If faculty's current message specifies *particular* QIDs from your list:** Follow that specific instruction and generate the appropriate `ADD_QUESTIONS`.

    *   Do NOT ask for QIDs again if they are in the System Note unless offering choices as above.

3.  **IF a 'System Note (Constraint Violation)' is present (and no overriding Acknowledgment or Suggestions Note):**
    *   Relay the violation message accurately.
    *   **Keyword Search Fallback (If violation was due to `text__icontains`):**
        *   Refer to the faculty's *previous message* that triggered this failed keyword search (it's in the conversation history you have).
        *   Identify the original keywords (e.g., if they asked for "X and Y" and it failed).
        *   Propose searching for *each keyword individually* (e.g., "search for 'X' only?", "search for 'Y' only?").
        *   When they pick a simpler keyword, your *new* `SUGGEST_QUESTIONS` action MUST use that simpler keyword for `text__icontains` AND *reuse all other criteria* (part, type, difficulty, count, marks, unit) from their *original message* that led to the failed combined search. You need to "remember" these other criteria.
    *   **Other Violations:** Suggest 1-2 specific, actionable changes to other criteria (difficulty, marks, unit).
    *   Await faculty's instruction for the revised search criteria before sending a new ACTION.

4.  **IF NO 'System Note' with pending data is present:** Interpret the faculty's current message "{faculty_message}" to determine the next action.

MEMORY AID: QIDs available from last System Note (Suggestions Found): {[s["q_id"] for s in draft.ai_meta_data.get("pending_ai_narration_data_suggestions", {}).get("questions", [])] if draft.ai_meta_data.get('pending_ai_narration_data_suggestions') else 'None currently pending'}.

**Current Paper State:**
{chr(10)} Course: {draft.course.course_name} (ID: {draft.course.pk})
{chr(10)} Target Total Marks: {total_marks}
{chr(10)} Part A Target Marks: {part_a_total_marks}, Current Questions (IDs): [{part_a_qs_str}] (Currently {part_a_current_marks_from_constraints} Marks)
{chr(10)} Part B Target Marks: {part_b_total_marks}, Current Questions (IDs): [{part_b_qs_str}] (Currently {part_b_current_marks_from_constraints} Marks)
{chr(10)} Current Constraints Defined: {current_constraints}
The Selected Questions Preview panel on the faculty's screen always shows the current content of Part A and Part B based on the 'Current Questions (IDs)' listed above. When you confirm questions are added, tell the faculty they can see them in the preview.

**CRITICAL FOR ACTION GENERATION: Utilizing Current Paper State**
When you generate an ACTION tag, especially for `SUGGEST_BALANCED_QUESTIONS` or `SUGGEST_QUESTIONS`:
- If the faculty asks to generate questions for a part (e.g., "suggest for Part B") without specifying a target_marks for that action,
  you MUST use the `Part X Target Marks` value provided above in the "Current Paper State" section for the `target_marks` field in your JSON payload.
- Similarly, always use the `course_id` from the "Current Paper State" in your action payloads.
- Be aware of the "Currently X Marks" filled for a part to inform your suggestions or if the part is already full.

**Available Question Attributes in Database:**
q_id (PK), unit_id (FK to Unit model, which has unit_name and its own unit_id which is the unit number like 1,2,3), course_id (FK to Course), text (string),
co (string, e.g., 'CO1', 'CO2'), bt (string, e.g., 'Remember', 'Understand', 'Apply'),
marks (integer), type (string: 'Quiz', 'Test', 'MCQ'),
difficulty_level (string: 'Easy', 'Medium', 'Hard').

**Your Tasks & How to Respond (Examples):**
1.  Understanding & Updating Paper Constraints:
    Faculty: "Set total marks to 75. Part A should be 15 marks, and Part B 60 marks."
    You: "Okay, I've updated the paper constraints:
    - Total Marks: 75
    - Part A Target: 15 marks (Currently {part_a_current_marks_from_constraints}/{part_a_total_marks_from_constraints} filled)
    - Part B Target: 60 marks (Currently {part_b_current_marks_from_constraints}/{part_b_total_marks_from_constraints} filled)
    [ACTION: UPDATE_CONSTRAINTS {{\"total_marks\": 75, \"part_a_total_marks\": 15, \"part_b_total_marks\": 60}}]"
    (The backend will provide the 'Currently X/Y filled' part in a 'System Note (Action Acknowledgment)' after processing. Your job is to relay that clearly.)

    Faculty: "The exam is on 2024-11-20, duration 2.5 hours, semester IV, and it's a SEE exam."
    You: "Got it. Exam details updated: Date 2024-11-20, Duration 2.5 hours, Semester IV, Type SEE.
    [ACTION: UPDATE_CONSTRAINTS {{\"date\": \"2024-11-20\", \"duration\": \"2.5 hours\", \"semester\": \"IV Sem\", \"exam_type\": \"SEE\"}}]"

    Faculty: "For Part A, make questions 1 mark each and Quiz type. For Part B, ensure Test type and questions should be at least 10 marks."
    You: "Understood. For Part A, questions will generally be 1 mark and Quiz type. For Part B, they will be Test type, with a minimum of 10 marks if not otherwise specified.
    [ACTION: UPDATE_CONSTRAINTS {{\"part_a_question_marks\": 1, \"part_a_question_type\": \"Quiz\", \"part_b_question_type\": \"Test\", \"part_b_min_marks\": 10}}]"

2.  Suggesting Specific Questions by Criteria & Topic (`SUGGEST_QUESTIONS` action):
    Your goal is to translate the faculty's request into the most effective search criteria.

    *   **Simple Keyword Search:**
        Faculty: "Find questions on 'finite automata' for Part A."
        You: "Okay, looking for Part A questions (Quiz/MCQ type) about 'finite automata'. How many should I look for?
        [ACTION: SUGGEST_QUESTIONS {{\"part\": \"A\", \"text__icontains\": \"finite automata\", \"course_id\": \"{draft.course.pk}\"}}]"

    *   **Multiple Keywords (Interpreting "AND"):**
        Faculty: "Suggest 2 easy Quiz questions for Part A about 'regular languages' AND 'regular expressions'."
        You (Attempt 1): "Okay, I'll look for 2 easy Quiz questions for Part A that cover both 'regular languages' AND 'regular expressions'. This combined search can be quite specific.
        [ACTION: SUGGEST_QUESTIONS {{\"part\": \"A\", \"count\": 2, \"difficulty_level\": \"Easy\", \"type\": \"Quiz\", \"text__icontains\": \"regular language regular expression\", \"course_id\": \"{draft.course.pk}\"}}]"
        
        *   **Keyword Search Fallback Example (after the above fails and faculty is informed via System Note):**
            (System Note to AI for this turn: "Constraint Violation: No questions found for keywords 'regular language regular expression'...")
            Faculty (current message): "Okay, what should I do?"
            You (AI response based on System Note & new fallback logic): "I couldn't find easy Quiz questions for Part A matching both 'regular language' and 'regular expression'. 
            Would you like me to try searching for:
            1. 'regular languages' only?
            2. 'regular expressions' only?
            Please let me know, and I'll keep the other criteria (2 questions, easy, Quiz, Part A) the same."

            Faculty (current message, after AI offered fallback): "Try 'regular languages' only."
            You (AI response): "Okay, searching for 2 easy Quiz questions for Part A about 'regular languages'.
            [ACTION: SUGGEST_QUESTIONS {{\"part\": \"A\", \"count\": 2, \"difficulty_level\": \"Easy\", \"type\": \"Quiz\", \"text__icontains\": \"regular language\", \"course_id\": \"{draft.course.pk}\"}}]"
            **(AI correctly remembered and reused count, difficulty, type, and part from the original failed request).**

    *   **Interpreting Broader Topics or Potential "OR" (AI Decides Initial Strategy):**
        Faculty: "I need questions related to context-free grammars, maybe something on parsing or derivations."
        You (Thought Process - internal):
             1. Main topic: "context-free grammars".
             2. Related sub-topics: "parsing", "derivations".
             3. Searching for all three together might be too narrow. I'll start with the main topic and see what comes up.
             4. If that fails or faculty wants more, I can try the sub-topics.
        You (Response): "Okay, I'll search for questions related to 'context-free grammars'. For which part, and any other criteria like difficulty or number of questions?
        [ACTION: SUGGEST_QUESTIONS {{\"text__icontains\": \"context-free grammar\", \"course_id\": \"{draft.course.pk}\"}}]"
        --- (IF THIS SEARCH IS SUCCESSFUL and faculty wants more specifics) ---
        Faculty: "Good. Now, anything specific on 'parsing' within CFGs?"
        You: "Sure, let's narrow down to 'parsing' within 'context-free grammars'.
        [ACTION: SUGGEST_QUESTIONS {{\"text__icontains\": \"context-free grammar parsing\", \"course_id\": \"{draft.course.pk}\"}}]"

    *   **Handling Vague Topic Searches (AI clarifies and then searches):**
        Faculty: "What kind of questions do we have on undecidability?"
        You: "Questions on 'undecidability' can cover various aspects. Are you interested in general concepts, specific undecidable problems, or perhaps proofs of undecidability? And for which Part of the paper?
        (Awaiting clarification before forming a SUGGEST_QUESTIONS action, or I could try a broad search first if preferred:
        You: "I can do a broad search for 'undecidability'. For which Part and how many questions?
        [ACTION: SUGGEST_QUESTIONS {{\"text__icontains\": \"undecidability\", \"course_id\": \"{draft.course.pk}\"}}]" )

    # Note: This section has been updated to implement AI-Powered Query Refinement Strategy (Prompt 53)
    # The AI now provides more sophisticated natural language understanding, break down complex queries
    # and offer fallback strategies when combined searches fail.

3.  Suggesting a Balanced Set of Questions (`SUGGEST_BALANCED_QUESTIONS` action):
    Faculty: "Suggest questions for Part B."
    You (AI, knowing Part B Target is {part_b_total_marks} from Current Paper State): 
    "Okay, I'll try to find a balanced set of Test questions for Part B, aiming for the configured target of {part_b_total_marks} marks.
    [ACTION: SUGGEST_BALANCED_QUESTIONS {{\"part\": \"B\", \"target_marks\": {part_b_total_marks}, \"course_id\": \"{draft.course.pk}\"}}]"

    Faculty: "Give me a balanced set of questions for Part A."
    You (AI, knowing Part A Target is {part_a_total_marks} from Current Paper State): 
    "Alright, I'll assemble a balanced set of Quiz/MCQ questions for Part A, aiming for your target of {part_a_total_marks} marks.
    [ACTION: SUGGEST_BALANCED_QUESTIONS {{\"part\": \"A\", \"target_marks\": {part_a_total_marks}, \"course_id\": \"{draft.course.pk}\"}}]"

    Faculty: "Suggest questions for Part B to make a total of 20 marks, focusing on 'Turing machines'."
    You: "Okay, I'll try to find a balanced set of Test questions for Part B related to 'Turing machines' to reach a total of 20 marks.
    [ACTION: SUGGEST_BALANCED_QUESTIONS {{\"part\": \"B\", \"target_marks\": 20, \"text__icontains\": \"Turing machine\", \"course_id\": \"{draft.course.pk}\"}}]"

4.  Adding Questions (`ADD_QUESTIONS` action):
    *   **Scenario 4.1: Adding from AI's recent suggestions (Faculty confirms by QID or generally):**
        (Context: You just listed QID 101 (5m), QID 102 (5m), QID 103 (3m) as suggestions for Part A which has a target of 10 marks. Total suggested: 13 marks)
        Faculty: "Proceed."
        You (AI using new logic): "I found these questions for Part A: [list Q101, Q102, Q103], totaling 13 marks, but your target is 10 marks. 
        Shall I add QID 101 and QID 102 (totaling 10 marks)? Or would you like to select different ones, or should I try for a new set of suggestions closer to 10 marks?" 
        (Awaits further instruction before sending ADD_QUESTIONS)

        (Context: You just listed QID 201 (8m), QID 202 (2m) for Part A (target 10m). Total suggested: 10 marks)
        Faculty: "Yes, add them all to Part A."
        You: "Okay, adding the suggested QID 201 and QID 202 to Part A (total 10 marks). These will now appear in your Selected Questions Preview.
        [ACTION: ADD_QUESTIONS {{\"part\": \"A\", \"q_ids\": [201, 202]}}]"
        (Then, if multi-part, proceed to suggest for Part B)

    *   **Scenario 4.2: Faculty asks to add questions by criteria/keywords (AI translates to SUGGEST then ADD):**
        This is a two-step process for you (AI). First suggest, then on confirmation, add.
        Faculty: "Add two easy 5-mark questions about 'DFA' to Part B."
        You (Step 1 - Suggest): "Okay, first I'll find two easy 5-mark questions about 'DFA' for Part B.
        [ACTION: SUGGEST_QUESTIONS {{\"part\": \"B\", \"count\": 2, \"difficulty_level\": \"Easy\", \"marks\": 5, \"type\": \"Test\", \"text__icontains\": \"DFA\", \"course_id\": \"{draft.course.pk}\"}}]"
        --- (After backend processes and provides suggestions in next System Note) ---
        You (Step 2 - Present & Await Add Confirmation): "I found these questions about 'DFA': [Lists QID X, QID Y]. Would you like to add them to Part B?"
        Faculty: "Yes."
        You (Step 3 - Add): "Adding QID X and QID Y to Part B.
        [ACTION: ADD_QUESTIONS {{\"part\": \"B\", \"q_ids\": [X, Y]}}]"

    *   **Scenario 4.3: Faculty asks to fill remaining marks for a part:**
        Faculty: "Fill the remaining marks for Part A with easy questions."
        You: "Okay, Part A needs {part_a_target_marks_val - part_a_current_marks_val} more marks. I'll suggest easy Quiz/MCQ questions to fill this.
        [ACTION: SUGGEST_BALANCED_QUESTIONS {{\"part\": \"A\", \"target_marks\": {part_a_target_marks_val - part_a_current_marks_val}, \"difficulty_level\": \"Easy\", \"course_id\": \"{draft.course.pk}\"}}]"
        (Then follow the suggestion-presentation-confirmation flow)

5.  "Surprise Me" / Balanced Paper: 
    Faculty: "Generate a balanced paper for Part A."
    You: "Okay, I'll try to assemble a balanced set of questions for Part A (Quiz/MCQ type, aiming for {part_a_total_marks} marks). [ACTION: SUGGEST_BALANCED_QUESTIONS {{\"part\": \"A\", \"target_marks\": {part_a_total_marks}, \"course_id\": \"{draft.course.pk}\"}}]"

6.  Coverage Summary: (Faculty: "What's the current CO/BT coverage?") -> You: "Let me calculate that for you. [ACTION: CALCULATE_COVERAGE {{}}]"
    (I will provide the summary in a 'System Note' for your next response.)
    
7.  Explain Question Details: (Faculty: "Tell me more about QID 789.") -> You: "Let me fetch the details for QID 789. [ACTION: GET_QUESTION_DETAILS {{\"q_id\": 789}}]"
    (I will provide the details in a 'System Note' for your next response.)
    
8.  **Question Swapping:**
    Faculty: "In Part A, replace QID 123 with another 2-mark question from Unit 1 about 'arrays'."
    You: "Okay, I'll look for a replacement for QID 123 in Part A with those criteria. [ACTION: SWAP_QUESTION {{\"part\": \"A\", \"q_id_to_remove\": 123, \"new_question_criteria\": {{\"marks\": 2, \"unit_id__unit_id\": 1, \"text__icontains\": \"arrays\", \"course_id\": \"{draft.course.pk}\"}} }}]"
    (I will inform you of the result in a 'System Note'.)
    
9.  **Difficulty Tuning:**
    Faculty: "Can you make Part B a bit harder?"
    You: "I'll attempt to adjust Part B to be harder. [ACTION: TUNE_DIFFICULTY {{\"part\": \"B\", \"direction\": \"harder\", \"course_id\": \"{draft.course.pk}\"}}]"

10.  **Removing a Single Question:**
    Faculty: "Remove QID 123 from Part A."
    You: "Okay, removing QID 123 from Part A. The preview will update.
    [ACTION: REMOVE_QUESTION {{\"part\": \"A\", \"q_id\": 123}}]"

11.  **Clearing Selected Questions (Use CLEAR_SELECTED_QUESTIONS action):**
    Faculty: "Clear all questions from Part A."
    You: "Understood. I will clear all selected questions from Part A. The preview will reflect this.
    [ACTION: CLEAR_SELECTED_QUESTIONS {{\"part\": \"A\"}}]"

    Faculty: "Clear everything selected for Part B."
    You: "Okay, clearing all questions currently selected for Part B.
    [ACTION: CLEAR_SELECTED_QUESTIONS {{\"part\": \"B\"}}]"

    Faculty: "Start over, clear all questions from the entire draft." OR "Clear all selected questions from Part A and B."
    You: "Understood. I will clear ALL selected questions from both Part A and Part B. The preview will be empty.
    [ACTION: CLEAR_SELECTED_QUESTIONS {{\"part\": \"All\"}}]"

12.  **Finalizing the Paper:**
    Faculty: "The paper looks good, finalize it!"
    You: "Great! I'll prepare the final version of this paper. [ACTION: FINALIZE_PAPER {{}}]"
    (I will process this and update its status to 'finalized')

**Special Workflow for Question Suggestions:**
1. Faculty asks for suggestions based on criteria (e.g., "Generate questions of easy difficulty").
2. You acknowledge and use [ACTION: SUGGEST_QUESTIONS] to request suggestions from the backend.
3. After the backend finds questions, they will appear in your next turn as "System Note (Suggestions Found)".
4. When you see "System Note (Suggestions Found)", your IMMEDIATE response should be to present those question summaries WITH their QIDs to the faculty.
5. You must NOT ask the faculty to provide QIDs when you've just been given suggestions in a System Note.
6. After presenting the suggestions, wait for the faculty to indicate which questions they want to add.

**General Instructions:**
{chr(10)}- When suggesting questions to be added, refer to them by their `q_id`.
{chr(10)}- Provide structured `[ACTION: ...]` tags for backend operations.
{chr(10)}- If the faculty's request is ambiguous, ask for clarification.
{chr(10)}- You do not have direct access to the database. I query based on your ACTION tags. If you need to list questions or provide summaries, I will provide them in a 'System Note' for you to narrate.
{chr(10)}- IMPORTANT: When generating an [ACTION: ...] tag, the JSON payload (the part within {{}}) MUST be valid JSON. This means all keys (property names) and all string values MUST be enclosed in double quotes. Numbers and boolean values should not be quoted.
{chr(10)}- CRITICAL: When you see a System Note at the top of this prompt, your primary task is to clearly present that information to the faculty before moving on to their current request.
{chr(10)}- **Prioritize System Notes:** Always address information in a "System Note" (Acknowledgments, Suggestions, Violations) at the beginning of your response before fully processing the faculty's newest message, unless the new message is a direct answer to a question you just asked based on a System Note.
{chr(10)}- IMPORTANT: If a "System Note" above contains question suggestions (it will specify if they were for Part A or B, and their type), your *primary goal for this turn* is to present that information to the faculty, clearly stating which Part they were intended for. For example: "For Part A, I found these Quiz questions: ...". After presenting, ask them which specific QIDs they'd like to add to the relevant part (or a different part if they clarify). Do NOT just ask "to which part?" if the System Note already implies an intended part.
{chr(10)}- IMPORTANT: If you see a "System Note (Action Acknowledgment)", incorporate that exact acknowledgment into your current response before addressing any other aspects of the faculty's message. These acknowledgments confirm actions like adding/removing questions or updating constraints.
{chr(10)}- IMPORTANT: When the faculty asks to add questions you just suggested, ensure the q_ids in your [ACTION: ADD_QUESTIONS ...] payload MATCH the q_ids you presented in your textual suggestion. Do not invent new QIDs.
{chr(10)}- **MEMORY OF SYSTEM NOTE QIDs:** The 'QIDs available from last System Note' is a reminder for you. When the faculty confirms adding suggestions you just listed, use those QIDs.
{chr(10)}- CRITICAL: When a faculty says phrases like "add all those questions", "add them all", "use those suggestions", "yes those look good" after you've presented question suggestions, you MUST extract the QIDs from your memory of the suggestions you just presented and use ALL those QIDs in your ADD_QUESTIONS action.
{chr(10)}- CRITICAL: If a faculty gives general confirmation without specifying QIDs (like "okay", "proceed", "yes"), but you've just presented suggestions from a System Note, assume they want to add ALL the questions you just listed.
{chr(10)}- CRITICAL: If a System Note with suggestions specifies they were intended for a particular part (like "Part A"), and the faculty gives general confirmation without specifying a different part, use that same part in your ADD_QUESTIONS action.
{chr(10)}- **SEQUENTIAL PROCESSING FOR MULTI-PART:** Handle multi-part requests (like "generate for Part A and B") one part at a time. Suggest for Part A, get confirmation and add, then suggest for Part B, get confirmation and add. Do not send `SUGGEST_` actions for multiple parts simultaneously.
{chr(10)}- **Interpreting "Add":** If the faculty asks to "add questions on [topic]" or "add [N] [type] questions", your first step is ALWAYS to use `SUGGEST_QUESTIONS` or `SUGGEST_BALANCED_QUESTIONS` to find suitable candidates. Present these suggestions (with QIDs) to the faculty. Only generate an `ADD_QUESTIONS` action AFTER the faculty confirms which of YOUR SUGGESTED QIDs they want to add. Do not try to directly add questions based on criteria without showing them first.
{chr(10)}- **Mark Limits for ADD_QUESTIONS:** The backend will strictly enforce mark limits per part. If you generate an `ADD_QUESTIONS` action that would exceed the limit for a part, some questions might be skipped. The backend will inform you of this in an "Action Acknowledgment" System Note, which you must then relay to the faculty (e.g., "Added QID X, but QID Y was skipped as it would exceed marks for Part A.").
{chr(10)}- **Context is Key for Actions:** Before generating any ACTION tag, review the "Current Paper State" provided in this prompt. Use the defined target marks for Part A and Part B in your `SUGGEST_BALANCED_QUESTIONS` actions unless the faculty specifies a different `target_marks` in their immediate request for that action.
{chr(10)}- **Keyword Search Strategy & Fallback (REVISED):**
  - When faculty asks for questions on topics like "X and Y", first try a combined search: `\"text__icontains\": \"X Y\"`.
  - **IF THIS FAILS (you'll get a 'System Note (Constraint Violation)'):**
    1. Inform the faculty the combined search failed.
    2. Explicitly refer to their *previous message* that contained the combined keywords.
    3. Propose searching for *each keyword individually* (e.g., "search for 'X' only?", "search for 'Y' only?").
    4. When they pick a simpler keyword, your *new* `SUGGEST_QUESTIONS` action MUST use that simpler keyword for `text__icontains` AND *reuse all other criteria* (part, type, difficulty, count, marks, unit) from their *original message* that led to the failed combined search. You need to "remember" these other criteria.
{chr(10)}- **Understanding Faculty Search Intent for `SUGGEST_QUESTIONS`:**
  - **Identify Core Concepts/Keywords:** When the faculty asks for questions on a topic (e.g., "regular languages and regular expressions", "finite automata and empty strings", "undecidability"), extract the primary technical terms.
  - **Initial Search Strategy for Multiple Concepts (e.g., "X and Y"):** Your first attempt should usually be to search for ALL core concepts together in the `text__icontains` field (e.g., `\"text__icontains\": \"X Y Z\"`). Clearly state to the faculty that this combined search is specific.
  - **Fallback Strategy on "No Results":** If the 'System Note (Constraint Violation)' indicates your combined keyword search found no questions, your *next response* MUST inform the faculty of this and *proactively offer to simplify the search*. Suggest searching for individual keywords separately (e.g., "search for just X?", "search for just Y?") or a broader related term. Await their confirmation before sending a new `SUGGEST_QUESTIONS` action with the simplified criteria.
  - **Handling "OR" or Vague Requests:** If the faculty asks for "X or Y" or a very broad topic, either:
    a) Ask for clarification on which specific aspect or term to search for first.
    b) Or, make an educated guess for an initial broad search (e.g., search for the most encompassing term) and state that you can refine it later.
  - **Formulating `text__icontains`:** Combine distinct multi-word phrases with spaces. Example: `"finite automata" "empty string"`. The backend will treat this as an AND search.
  
  # Note: This section has been updated to implement AI-Powered Query Refinement Strategy (Prompt 53)
  # The backend already handles splitting text__icontains by spaces and applying AND conditions correctly.
  # This new prompt makes the AI smarter about refining search terms before sending them to the backend.

{chr(10)}- **Responding to Constraint Violations (No Questions Found):**
  When a 'System Note (Constraint Violation)' indicates no questions were found for the given criteria:
    1. Clearly state the criteria that resulted in no matches (the backend provides this in the note).
    2. Proactively suggest 1-2 *specific, actionable changes* to the criteria. Examples:
       - "Perhaps try 'Medium' difficulty instead of 'Hard'?"
       - "Would you like to search without specifying marks?"
       - "Should I try looking in a different Unit, or all Units?"
       - "If you used multiple keywords (e.g., 'X and Y'), try searching for just 'X' or just 'Y'."
    3. Then ask the faculty how they'd like to proceed with adjusting the criteria.

- When generating an [ACTION: UPDATE_CONSTRAINTS] tag, use the following keys in your JSON payload where appropriate (ensure all keys and string values are double-quoted):
  `total_marks` (number), `part_a_total_marks` (number), `part_b_total_marks` (number),
  `date` (string "YYYY-MM-DD"), `semester` (string, e.g., "III Sem"), `duration` (string, e.g., "3 Hours"),
  `exam_type` (string, choices: "CIE", "SEE", "Quiz", "Test Event"),
  `part_a_question_marks` (number, default marks for Part A Qs), `part_a_question_type` (string, choices: "Quiz", "MCQ", "Test"),
  `part_b_question_marks` (number, default marks for Part B Qs), `part_b_question_type` (string, choices: "Quiz", "MCQ", "Test"),
  `part_b_min_marks` (number, minimum marks for Part B questions if not otherwise specified).
  Only include keys that the faculty actually mentioned or can be clearly inferred.
- If the faculty only updates one or two constraints (e.g., 'Change total marks to 90'), your UPDATE_CONSTRAINTS action should only include the key for 'total_marks'.
- When an [ACTION: UPDATE_CONSTRAINTS] is processed, the backend will provide an acknowledgment via a 'System Note (Action Acknowledgment)'. This note will confirm which constraints were updated and often include the current mark fulfillment for Part A and Part B (e.g., "Part A status: X/Y marks."). Your response to the faculty MUST relay this full acknowledgment clearly.
- **IMPORTANT for UPDATE_CONSTRAINTS:** When the faculty asks to change only specific constraints (e.g., "change total marks to 90" or "set exam date to next Monday"),
  your [ACTION: UPDATE_CONSTRAINTS] JSON payload MUST *ONLY* include the keys and values for the constraints they *explicitly mentioned* for changing.
  Do NOT resend other unchanged constraints from your memory or the current paper state.
  For example, if faculty says "update duration to 2 hours", send ONLY `{{\"duration\": \"2 hours\"}}`.

The faculty is now saying: "{faculty_message}"
Based on the **IMMEDIATE TASK & CONTEXT AWARENESS** section, any 'System Note' data, and the faculty's message, what is your response? If you just presented suggestions from a System Note and the faculty gives a general confirmation (like "proceed" or "add them all"), your response should: 1. Acknowledge. 2. State you're adding ALL those QIDs. 3. Generate the `ADD_QUESTIONS` action with those QIDs. 4. If appropriate, state you're moving to the next part and generate its `SUGGEST_BALANCED_QUESTIONS` action.
"""
        
        gemini_service = GeminiService()
        
        # --- REFINED LOGGING ---
        print("-" * 40)
        print(f"DEBUG AI PROMPT (Turn for Faculty Msg: '{faculty_message[:100]}{'...' if len(faculty_message)>100 else ''}')")
        print(f"  Draft ID: {draft.id}, Course: {draft.course.course_name} (ID: {draft.course.pk})")
        
        if narration_prompt_addition.strip():
            print(f"  NARRATION/SYSTEM NOTES SENT TO AI:\n{narration_prompt_addition.strip()}")
        else:
            print("  NARRATION/SYSTEM NOTES SENT TO AI: None")

        # Log key current state elements being sent (not the whole static part of the prompt)
        qids_in_memory_aid = [s["q_id"] for s in draft.ai_meta_data.get("pending_ai_narration_data_suggestions", {}).get("questions", [])] if draft.ai_meta_data.get('pending_ai_narration_data_suggestions') else 'None'
        print(f"  MEMORY AID (QIDs from last suggestions): {qids_in_memory_aid}")
        print(f"  CURRENT CONSTRAINTS IN PROMPT: total_marks={current_constraints.get('total_marks')}, part_a_target={current_constraints.get('part_a_total_marks')}, part_a_current={current_constraints.get('part_a_current_marks')}, part_b_target={current_constraints.get('part_b_total_marks')}, part_b_current={current_constraints.get('part_b_current_marks')}")
        print(f"  CURRENT PART A QIDs IN PROMPT: {draft.part_a_question_ids}")
        print(f"  CURRENT PART B QIDs IN PROMPT: {draft.part_b_question_ids}")
        print("  (Full static prompt instructions and examples are omitted from this log for brevity)")
        print("-" * 40)
        # --- END OF REFINED LOGGING ---
        
        ai_reply_text = gemini_service.get_ai_response_with_full_prompt(
            full_prompt_for_ai=system_prompt  # Still send the full prompt to Gemini
        )

        draft.conversation_history.append({"role": "assistant", "content": ai_reply_text})
        
        # IMPORTANT: After AI generates its reply (which might contain new actions),
        # we process THOSE actions. The narration data for *this current AI reply*
        # would have been set by the *previous* AI's actions.
        # The PaperConstructionService init clears its internal pending flags.
        # The `process_faculty_request` here processes actions from `ai_reply_text` (current AI reply)
        # and sets up `pending_ai_narration_data` for the *next* AI turn.
        current_turn_construction_service = PaperConstructionService(draft)
        updated_draft = current_turn_construction_service.process_faculty_request(
            faculty_message_content=faculty_message, 
            ai_reply_content=ai_reply_text # Process actions from the AI's current reply
        )

        response_serializer = AIChatResponseSerializer({
            "draft": updated_draft,
            "ai_reply": ai_reply_text
        })
        return Response(response_serializer.data, status=status.HTTP_200_OK)


class ListFacultyPaperDraftsView(ListAPIView):
    serializer_class = PaperDraftSerializer
    permission_classes = [IsAuthenticated] # DRF will ensure user is authenticated

    @method_decorator(role_required(allowed_roles=['faculty']))
    def get(self, request, *args, **kwargs):
        # The role_required decorator now runs *before* this get method.
        # If the user is authenticated and has the 'faculty' role, 
        # this method will be called. Otherwise, the decorator returns a JsonResponse.
        return super().get(request, *args, **kwargs) # Call the parent ListAPIView's get method

    def get_queryset(self):
        # This method is called by super().get().
        # By this point, IsAuthenticated and role_required (on get) should have run.
        # So, self.request.user should be an authenticated faculty member.
        user = self.request.user 
        if not user.is_authenticated or not hasattr(user, 'role') or user.role != 'faculty':
            # This is an extra safeguard, should ideally be caught by decorators/permissions
            print("Error in get_queryset: User is not an authenticated faculty member. This shouldn't happen if decorators are correct.")
            return PaperDraft.objects.none() 

        return PaperDraft.objects.filter(faculty=user).exclude(
            status__in=['finalized', 'archived'] 
        ).order_by('-updated_at')

class SavePaperDraftView(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(role_required(allowed_roles=['faculty']))
    def post(self, request, *args, **kwargs):
        draft_id = request.data.get('draft_id')
        if not draft_id:
            return Response({"error": "Draft ID is required."}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            draft = PaperDraft.objects.get(id=draft_id, faculty=request.user)
            # The draft is already saved after each AI interaction by PaperConstructionService.
            # This endpoint can simply confirm its existence and touch updated_at if needed.
            draft.save() # Touches updated_at
            return Response({"message": f"Draft {draft.id} confirmed saved.", "draft_id": draft.id, "updated_at": draft.updated_at}, status=status.HTTP_200_OK)
        except PaperDraft.DoesNotExist:
            return Response({"error": "Draft not found or access denied."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            print(f"Error saving draft (SavePaperDraftView): {e}")
            return Response({"error": "An unexpected error occurred while saving the draft."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class CreatePaperDraftView(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(role_required(allowed_roles=['faculty']))
    def post(self, request, *args, **kwargs):
        try:
            # Get course
            course_id = request.data.get('course_id')
            if not course_id:
                return Response({"error": "Course ID is required."}, status=status.HTTP_400_BAD_REQUEST)
            
            try:
                course = Course.objects.get(course_id=course_id)
            except Course.DoesNotExist:
                return Response({"error": "Course not found."}, status=status.HTTP_404_NOT_FOUND)
            
            # Generate the draft after the paper is generated, using the correct PDF path
            # Assume the frontend sends the correct path in request.data['pdf_path'] (from the paper generation response)
            pdf_path = request.data.get('pdf_path')
            draft = PaperDraft.objects.create(
                faculty=request.user,
                course=course,
                status='finalized',
                part_a_question_ids=request.data.get('selected_questions', {}).get('part_a', []),
                part_b_question_ids=request.data.get('selected_questions', {}).get('part_b', []),
                ai_meta_data={
                    'paper_metadata': request.data.get('paper_metadata', {}),
                    'generated_paper_path': pdf_path,  # Use the actual PDF path
                    'generated_answer_path': request.data.get('paper_metadata', {}).get('generated_answer_path'),
                    'conversation_history': [
                        {
                            "role": "system", 
                            "content": f"Paper created via traditional form for course {course.course_name}"
                        }
                    ]
                }
            )
            
            return Response({
                "message": "Paper draft created successfully.",
                "draft": {
                    "id": draft.id,
                    "status": draft.status,
                    "course_name": course.course_name,
                    "created_at": draft.created_at
                }
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            print(f"Error creating draft (CreatePaperDraftView): {e}")
            return Response({"error": "An unexpected error occurred while creating the draft."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class DownloadGeneratedPaperView(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(role_required(allowed_roles=['faculty', 'reviewer']))
    def get(self, request, *args, **kwargs):
        file_path_from_query = request.GET.get('path')
        print(file_path_from_query)
        print(f"DEBUG DOWNLOAD: User '{request.user.username}' received request for raw path: '{file_path_from_query}'")
        # print("Hiiiiiiiiiiiiiiii")
        if not file_path_from_query:
            print("DEBUG DOWNLOAD: Path parameter missing.")
            return Response({"error": "File path parameter is required."}, status=status.HTTP_400_BAD_REQUEST)
        
        # Normalize path separators to forward slashes for consistent checking
        normalized_file_path = file_path_from_query.replace("\\", "/")
        print(f"DEBUG DOWNLOAD: Normalized path: '{normalized_file_path}'")
        
        # Security check: Prevent directory traversal
        if ".." in normalized_file_path or normalized_file_path.startswith('/'):
            print(f"DEBUG DOWNLOAD: Security violation - path traversal attempt: '{normalized_file_path}'")
            return Response({"error": "Invalid file path (traversal attempt)."}, status=status.HTTP_400_BAD_REQUEST)
        
        # Ensure the file path starts with a safe directory
        safe_prefixes = ['media/', 'generated_papers/', 'media/annotated_papers/']
        if not any(normalized_file_path.startswith(prefix) for prefix in safe_prefixes):
            print(f"DEBUG DOWNLOAD: Security violation - path '{normalized_file_path}' not in allowed directories: {safe_prefixes}")
            return Response({"error": "Invalid path location (not in safe directory)."}, status=status.HTTP_400_BAD_REQUEST)
        
        # Additional verification - check if the user has access to this file
        # Extract draft_id from filename if possible (assuming filename pattern includes draft_id)
        draft_id = None
        if "_draft_" in normalized_file_path:
            try:
                draft_id = normalized_file_path.split("_draft_")[1].split("_")[0]
            except (IndexError, ValueError):
                pass
        
        # If we got a draft_id, verify ownership
        if draft_id:
            try:
                # Check if the requesting user owns this draft
                draft_exists = PaperDraft.objects.filter(
                    id=draft_id, 
                    faculty=request.user
                ).exists()
                
                if not draft_exists:
                    print(f"DEBUG DOWNLOAD: Access denied - user {request.user.id} attempted to access draft {draft_id}")
                    return Response({"error": "You don't have permission to access this file"}, 
                                    status=status.HTTP_403_FORBIDDEN)
            except Exception as e:
                print(f"DEBUG DOWNLOAD: Error verifying draft access: {e}")
                # Continue with the download even if verification fails, 
                # since we already have basic auth and role checks
        
        # Reviewer-specific access check
        user = request.user
        if user.role == 'reviewer':
            from ai_generator.models import PaperReviewAssignment, PaperDraft
            # Find the PaperDraft whose ai_meta_data["generated_paper_path"] matches the requested file
            try:
                # Only allow download if the reviewer is assigned to this paper
                assignments = PaperReviewAssignment.objects.filter(reviewer__user=user)
                allowed = False
                for assignment in assignments.select_related('paper'):
                    paper = assignment.paper
                    paper_path = None
                    if hasattr(paper, 'ai_meta_data') and paper.ai_meta_data:
                        paper_path = paper.ai_meta_data.get('generated_paper_path')
                    if paper_path and paper_path.replace('\\', '/') == normalized_file_path:
                        allowed = True
                        break
                if not allowed:
                    print(f"DEBUG DOWNLOAD: Reviewer {user.id} not assigned to this paper.")
                    return Response({"error": "You don't have permission to access this file"}, status=status.HTTP_403_FORBIDDEN)
            except Exception as e:
                print(f"DEBUG DOWNLOAD: Error verifying reviewer assignment: {e}")
                return Response({"error": "Server error during reviewer assignment check."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        # Faculty access is already handled by role_required and draft_id check below
        
        # Construct full path - use original file_path_from_query for os.path.join
        # os.path.join correctly handles different separators
        full_file_path = os.path.join(settings.BASE_DIR, file_path_from_query)
        # Normalize path for file system operations
        full_file_path_os_normalized = os.path.normpath(full_file_path)
        print(f"DEBUG DOWNLOAD: Constructed full path: '{full_file_path_os_normalized}'")
        
        if os.path.exists(full_file_path_os_normalized) and os.path.isfile(full_file_path_os_normalized):
            file_name = os.path.basename(full_file_path_os_normalized)
            print(f"DEBUG DOWNLOAD: File exists. Serving '{file_name}'.")
            
            try:
                from django.http import FileResponse
                from mimetypes import guess_type
                
                # Determine content type
                content_type, encoding = guess_type(full_file_path_os_normalized)
                if content_type is None:
                    content_type = 'application/octet-stream'  # Default content type
                
                response = FileResponse(
                    open(full_file_path_os_normalized, 'rb'),
                    content_type=content_type
                )
                response['Content-Disposition'] = f'attachment; filename="{file_name}"'
                # Prevent caching of downloads
                response['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
                response['Pragma'] = 'no-cache'
                response['Expires'] = '0'
                return response
            except Exception as e:
                print(f"DEBUG DOWNLOAD: Error serving file: {e}")
                return Response(
                    {"error": f"Server error: {str(e)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        else:
            print(f"DEBUG DOWNLOAD: File NOT FOUND at '{full_file_path_os_normalized}'.")
            return Response(
                {"error": f"File not found at specified path."},
                status=status.HTTP_404_NOT_FOUND
            )
            
class CheckHealth(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(role_required(allowed_roles=['faculty', 'reviewer']))
    def get(self, request, *args, **kwargs):
        return Response({"status": "OK", "message": "Server is running"})

class SaveAnnotatedPDFView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    @method_decorator(role_required(allowed_roles=['faculty', 'reviewer']))
    def post(self, request, *args, **kwargs):
        try:
            if 'pdf' not in request.FILES:
                return Response({"error": "No PDF file uploaded"}, status=status.HTTP_400_BAD_REQUEST)
            
            pdf_file = request.FILES['pdf']
            original_filename = request.data.get('original_filename', '')
            paper_id = request.data.get('paper_id', '')
            
            # Validate file type - check both filename and content type
            is_pdf_filename = pdf_file.name.lower().endswith('.pdf')
            is_pdf_content = pdf_file.content_type == 'application/pdf'
            
            if not is_pdf_filename and not is_pdf_content:
                print(f"File validation failed - Name: {pdf_file.name}, Content-Type: {pdf_file.content_type}")
                return Response({"error": "Only PDF files are allowed"}, status=status.HTTP_400_BAD_REQUEST)
            
            # Use original filename if provided, otherwise use uploaded filename (without .pdf)
            if original_filename and original_filename.lower().endswith('.pdf'):
                base_filename = original_filename.rsplit('.', 1)[0]
            elif is_pdf_filename:
                base_filename = pdf_file.name.rsplit('.', 1)[0]
            else:
                base_filename = pdf_file.name

            filename = f"{base_filename}_annotated.pdf"  # Always the same name for this paper

            # Create annotated_papers directory if it doesn't exist
            annotated_dir = os.path.join(settings.BASE_DIR, 'media', 'annotated_papers')
            os.makedirs(annotated_dir, exist_ok=True)

            # Save file with this filename (overwriting any previous version)
            file_path = os.path.join(annotated_dir, filename)

            # --- Embed annotation data into the PDF before saving ---
            from .models import PaperDraft
            import io
            try:
                paper = None
                if paper_id:
                    paper = PaperDraft.objects.get(id=paper_id)
                annotations = paper.ai_meta_data.get('annotations', []) if paper and hasattr(paper, 'ai_meta_data') and paper.ai_meta_data else []
            except Exception:
                annotations = []

            if annotations:
                # Use PyMuPDF (fitz) to burn annotations into the PDF
                import fitz  # PyMuPDF
                # Read uploaded PDF into memory
                pdf_bytes = b"".join([chunk for chunk in pdf_file.chunks()])
                pdf_stream = io.BytesIO(pdf_bytes)
                doc = fitz.open(stream=pdf_stream, filetype="pdf")
                for annotation in annotations:
                    page_number = annotation.get('pageNumber', 1) - 1  # 0-based index
                    if page_number < 0 or page_number >= len(doc):
                        continue
                    page = doc[page_number]
                    if annotation['type'] == 'text':
                        data = annotation['data']
                        x = data.get('x', 0)
                        y = data.get('y', 0)
                        text = data.get('text', '')
                        color = data.get('color', '#000000')
                        font_size = data.get('fontSize', 16)
                        # Convert hex color to RGB tuple
                        rgb = tuple(int(color.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
                        page.insert_text((x, y), text, fontsize=font_size, color=rgb)
                    elif annotation['type'] == 'drawing':
                        data = annotation['data']
                        points = data.get('points', [])
                        color = data.get('color', '#000000')
                        size = data.get('size', 2)
                        rgb = tuple(int(color.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
                        # Draw lines between consecutive points
                        if len(points) >= 4:
                            for i in range(0, len(points) - 2, 2):
                                x1, y1 = points[i], points[i+1]
                                x2, y2 = points[i+2], points[i+3]
                                page.draw_line((x1, y1), (x2, y2), color=rgb, width=size)
                doc.save(file_path)
                doc.close()
            else:
                # No annotation data, just save the uploaded PDF as is
                with open(file_path, 'wb+') as destination:
                    for chunk in pdf_file.chunks():
                        destination.write(chunk)
            
            # Verify file was saved
            if not os.path.exists(file_path):
                return Response({"error": "Failed to save file"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            # Get file stats
            file_stats = os.stat(file_path)
            
            # If paper_id is provided, update the paper's annotated version
            if paper_id:
                try:
                    from .models import PaperDraft
                    paper = PaperDraft.objects.get(id=paper_id)
                    if not hasattr(paper, 'ai_meta_data') or not paper.ai_meta_data:
                        paper.ai_meta_data = {}
                    paper.ai_meta_data['annotated_paper_path'] = f"media/annotated_papers/{filename}"
                    paper.save()
                    print(f"Updated paper {paper_id} with annotated version: {filename}")
                except PaperDraft.DoesNotExist:
                    print(f"Paper {paper_id} not found, but annotated PDF saved")
                except Exception as e:
                    print(f"Error updating paper metadata: {e}")
            
            return Response({
                "success": True,
                "message": "Annotated PDF saved successfully",
                "filename": filename,
                "size": file_stats.st_size,
                "saved_path": f"media/annotated_papers/{filename}",
                "timestamp": timezone.now().isoformat()
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            print(f"Error saving annotated PDF: {e}")
            return Response({"error": "An unexpected error occurred while saving the PDF"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class SaveAnnotationsView(APIView):
    permission_classes = [IsAuthenticated]
    
    @method_decorator(role_required(allowed_roles=['faculty', 'reviewer']))
    def post(self, request, *args, **kwargs):
        try:
            paper_id = request.data.get('paper_id')
            annotations = request.data.get('annotations', [])
            
            if not paper_id:
                return Response({"error": "Paper ID is required"}, status=status.HTTP_400_BAD_REQUEST)
            
            # Get the paper and save annotations
            from .models import PaperDraft
            paper = PaperDraft.objects.get(id=paper_id)
            
            if not hasattr(paper, 'ai_meta_data') or not paper.ai_meta_data:
                paper.ai_meta_data = {}

            existing_annotations = paper.ai_meta_data.get('annotations', [])
            # Deduplicate by 'id' if present, else by 'timestamp'
            def annotation_key(ann):
                return ann.get('id') or ann.get('timestamp')
            existing_keys = set(annotation_key(ann) for ann in existing_annotations)
            new_annotations = [ann for ann in annotations if annotation_key(ann) not in existing_keys]
            paper.ai_meta_data['annotations'] = existing_annotations + new_annotations
            paper.save()
            
            return Response({
                "success": True,
                "message": "Annotations saved successfully",
                "annotations_count": len(annotations)
            }, status=status.HTTP_200_OK)
            
        except PaperDraft.DoesNotExist:
            return Response({"error": "Paper not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            print(f"Error saving annotations: {e}")
            return Response({"error": "Failed to save annotations"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class LoadAnnotationsView(APIView):
    permission_classes = [IsAuthenticated]
    
    @method_decorator(role_required(allowed_roles=['faculty', 'reviewer']))
    def get(self, request, *args, **kwargs):
        try:
            paper_id = request.query_params.get('paper_id')
            
            if not paper_id:
                return Response({"error": "Paper ID is required"}, status=status.HTTP_400_BAD_REQUEST)
            
            # Get the paper and load annotations
            from .models import PaperDraft
            paper = PaperDraft.objects.get(id=paper_id)
            
            annotations = paper.ai_meta_data.get('annotations', []) if hasattr(paper, 'ai_meta_data') and paper.ai_meta_data else []
            
            return Response({
                "success": True,
                "annotations": annotations,
                "annotations_count": len(annotations)
            }, status=status.HTTP_200_OK)
            
        except PaperDraft.DoesNotExist:
            return Response({"error": "Paper not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            print(f"Error loading annotations: {e}")
            return Response({"error": "Failed to load annotations"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
@role_required(['faculty'])
def faculty_reviewed_papers(request):
    """Return all reviewed papers for the logged-in faculty, with annotated paper path."""
    user = request.user
    from .models import PaperDraft, PaperReviewAssignment
    reviewed_assignments = PaperReviewAssignment.objects.filter(
        paper__faculty=user,
        status='reviewed'
    ).select_related('paper', 'reviewer')
    papers = {}
    for assignment in reviewed_assignments:
        paper = assignment.paper
        if paper.id not in papers:
            # Try to get annotated_paper_path from ai_meta_data
            annotated_path = paper.ai_meta_data.get('annotated_paper_path') if hasattr(paper, 'ai_meta_data') and paper.ai_meta_data else None
            # If missing, try to infer the expected filename and check if it exists
            if not annotated_path:
                import os
                base_filename = None
                # Try to infer from generated_paper_path or paper.course info
                if hasattr(paper, 'ai_meta_data') and paper.ai_meta_data and paper.ai_meta_data.get('generated_paper_path'):
                    gen_path = paper.ai_meta_data['generated_paper_path']
                    base_filename = os.path.basename(gen_path).rsplit('.', 1)[0]
                else:
                    # Fallback: use course code and paper id
                    base_filename = f"{paper.course.course_id}_{paper.id}_question_paper"
                annotated_filename = f"{base_filename}_annotated.pdf"
                annotated_path_candidate = f"media/annotated_papers/{annotated_filename}"
                full_annotated_path = os.path.join(settings.BASE_DIR, annotated_path_candidate)
                if os.path.exists(full_annotated_path):
                    annotated_path = annotated_path_candidate
            papers[paper.id] = {
                'paper_id': paper.id,
                'course_code': paper.course.course_id,
                'course_name': paper.course.course_name,
                'annotated_paper_path': annotated_path,
                'status': assignment.status,
                'reviewed_at': assignment.reviewed_at,
                'reviewers': []
            }
        papers[paper.id]['reviewers'].append({
            'reviewer_id': assignment.reviewer.r_id,
            'reviewer_name': assignment.reviewer.name,
            'status': assignment.status,
            'reviewed_at': assignment.reviewed_at
        })
    return Response({'reviewed_papers': list(papers.values())})