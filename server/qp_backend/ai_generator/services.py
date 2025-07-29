# server/ai_generator/services.py
import google.generativeai as genai
import re # For parsing [ACTION: ...]
import json # For parsing JSON within actions
import random # For shuffling/random choices
import os # For file paths if your generator needs it
from django.conf import settings # For base_dir if needed
from django.db.models import Q, Count, Sum, Case, When, IntegerField # For more complex queries
from datetime import datetime # For PaperMetadata if needed
from .models import PaperDraft
from api.models import Question, Course, Unit, Faculty # Import necessary models from api app
from api.utils.paper_generator import QuestionPaperGenerator # Actual import

# Configure Gemini API
# genai.configure(api_key=settings.GEMINI_API_KEY)
genai.configure(api_key="AIzaSyBT4HifiYbnNSAr7cXkZ-S5MVVC6FpVkHg")

class GeminiService:
    def __init__(self, model_name="gemini-2.0-flash"): # Or "gemini-1.5-flash", "gemini-1.5-pro" etc.
        self.model = genai.GenerativeModel(model_name)
        # self.model = genai.GenerativeModel(
        #     model_name=model_name,
        #     # generation_config=generation_config,
        #     # safety_settings=safety_settings
        # )


    def _prepare_chat_history_for_gemini(self, django_conversation_history):
        """Converts Django conversation history to Gemini chat format."""
        gemini_history = []
        for entry in django_conversation_history:
            role = entry.get("role")
            # Gemini expects "user" and "model" roles
            gemini_role = "user" if role == "user" else "model"
            gemini_history.append({"role": gemini_role, "parts": [{"text": entry.get("content", "")}]})
        return gemini_history


    def get_ai_response_with_full_prompt(self, full_prompt_for_ai: str):
        """
        Gets a response from Gemini using a complete prompt provided.
        This method is simpler for cases where the calling view constructs the entire prompt.
        """
        try:
            # For a single-turn (or where history is embedded in the prompt),
            # we can directly use generate_content.
            # If you want to maintain a chat session implicitly for follow-ups,
            # you might still use start_chat and send_message, but the initial message
            # would be this full_prompt_for_ai.

            response = self.model.generate_content(full_prompt_for_ai)
            
            ai_text_reply = ""
            # ... (same error handling and response parsing logic as in the original get_ai_response)
            if response.parts:
                ai_text_reply = "".join(part.text for part in response.parts if hasattr(part, 'text'))
            elif hasattr(response, 'text'):
                 ai_text_reply = response.text
            else:
                print(f"Gemini Debug: Full response object: {response}")
                if hasattr(response, 'prompt_feedback') and response.prompt_feedback:
                    print(f"Gemini Debug: Prompt Feedback: {response.prompt_feedback}")
                    block_reason = getattr(response.prompt_feedback, 'block_reason', None)
                    if block_reason:
                         ai_text_reply = f"AI response blocked. Reason: {block_reason}."
                         if response.candidates:
                             for candidate in response.candidates:
                                 if hasattr(candidate, 'finish_reason') and candidate.finish_reason != 'STOP':
                                     ai_text_reply += f" Candidate Finish Reason: {candidate.finish_reason}."
                                 if hasattr(candidate, 'safety_ratings'):
                                     ai_text_reply += f" Safety Ratings: {candidate.safety_ratings}."
                if not ai_text_reply:
                    ai_text_reply = "AI could not generate a response. Please try again or rephrase your request."
            return ai_text_reply

        except Exception as e:
            print(f"Error communicating with Gemini API: {e}")
            return "Sorry, I encountered an error trying to process your request with the AI."

    
    def get_ai_response(self, faculty_message: str, conversation_history: list, system_prompt: str = None):
        """
        Gets a response from Gemini.
        faculty_message: The latest message from the faculty.
        conversation_history: List of dicts like [{'role': 'user'/'assistant', 'content': '...'}, ...] from PaperDraft
        system_prompt: An initial prompt to guide the AI's behavior.
        """
        try:
            # Convert existing history to Gemini format
            gemini_formatted_history = self._prepare_chat_history_for_gemini(conversation_history)
            
            # Start a chat session with existing history
            chat_session = self.model.start_chat(history=gemini_formatted_history)

            # Construct the prompt for Gemini
            # For now, just send the faculty message. We'll add system prompts and RAG later.
            prompt_parts = []
            if system_prompt and not gemini_formatted_history: # Only add system prompt if it's the beginning
                 prompt_parts.append({"text": system_prompt})
            
            prompt_parts.append({"text": faculty_message})

            # Send the message
            response = chat_session.send_message(prompt_parts) # Pass parts directly
            
            # Ensure response.parts is not empty and get text
            ai_text_reply = ""
            if response.parts:
                ai_text_reply = "".join(part.text for part in response.parts if hasattr(part, 'text'))
            elif hasattr(response, 'text'): # Fallback for simpler text response
                 ai_text_reply = response.text
            else: # Handle cases where no text is directly available or response structure is different
                # This might happen if the response is blocked due to safety settings or other issues.
                # Log the full response for debugging.
                print(f"Gemini Debug: Full response object: {response}")
                # Check for prompt feedback if available
                if hasattr(response, 'prompt_feedback') and response.prompt_feedback:
                    print(f"Gemini Debug: Prompt Feedback: {response.prompt_feedback}")
                    block_reason = getattr(response.prompt_feedback, 'block_reason', None)
                    if block_reason:
                         ai_text_reply = f"AI response blocked. Reason: {block_reason}."
                         # You might want to check response.candidates too if parts is empty
                         if response.candidates:
                             for candidate in response.candidates:
                                 if hasattr(candidate, 'finish_reason') and candidate.finish_reason != 'STOP':
                                     ai_text_reply += f" Candidate Finish Reason: {candidate.finish_reason}."
                                 if hasattr(candidate, 'safety_ratings'):
                                     ai_text_reply += f" Safety Ratings: {candidate.safety_ratings}."

                if not ai_text_reply: # If still no meaningful text
                    ai_text_reply = "AI could not generate a response. Please try again or rephrase your request."


            return ai_text_reply

        except Exception as e:
            print(f"Error communicating with Gemini API: {e}")
            # Consider more specific error handling based on Gemini API exceptions
            return "Sorry, I encountered an error trying to process your request with the AI."



class PaperConstructionService:
    def __init__(self, draft: PaperDraft):
        self.draft = draft
        # Clear all potentially pending narration data keys
        keys_to_clear = [
            'pending_ai_narration_data_suggestions',
            'pending_ai_narration_data_violation',
            'pending_ai_narration_data_coverage_summary',
            'pending_ai_narration_data_question_details',
            'pending_ai_narration_data_swap_result',
            'pending_ai_narration_data_tune_result',
            'pending_ai_narration_data_finalize_result', # Added
        ]
        for key in keys_to_clear:
            self.draft.ai_meta_data.pop(key, None)

    def _parse_actions(self, ai_reply_content: str):
        actions = []
        pattern = r"\[ACTION:\s*([A-Z_]+)\s*(\{.*?\})\]"
        
        # Allow one suggestion action and one add/finalize/other action per turn.
        # This handles the AI confirming adds for Part A and then immediately suggesting for Part B.
        suggestion_action_found_this_turn = False
        add_action_found_this_turn = False # Or any other modifying/finalizing action

        for match in re.finditer(pattern, ai_reply_content, re.DOTALL):
            action_type = match.group(1).strip()
            payload_str = match.group(2).strip()

            if action_type in ["SUGGEST_QUESTIONS", "SUGGEST_BALANCED_QUESTIONS"]:
                if suggestion_action_found_this_turn:
                    print(f"Warning: Multiple suggestion actions found. Processing only the first of this type. Action: {action_type}")
                    continue 
                suggestion_action_found_this_turn = True
            elif action_type in ["ADD_QUESTIONS", "REMOVE_QUESTION", "CLEAR_SELECTED_QUESTIONS", "UPDATE_CONSTRAINTS", "SWAP_QUESTION", "TUNE_DIFFICULTY", "FINALIZE_PAPER"]:
                if add_action_found_this_turn and action_type == "ADD_QUESTIONS":
                     print(f"Warning: Multiple primary modification actions found. Processing only the first of this type if restrictive. Action: {action_type}")
                     # Allow multiple ADD_QUESTIONS as the AI might legitimately chain ADD then SUGGEST
                     pass
                if action_type == "ADD_QUESTIONS":
                    add_action_found_this_turn = True
            
            try:
                payload = json.loads(payload_str)
                actions.append({'type': action_type, 'payload': payload})
            except json.JSONDecodeError as e:
                print(f"Error decoding JSON from AI action: {payload_str}. Error: {e}")
        return actions

    def _handle_update_constraints(self, payload: dict):
        method_debug_tag = "DEBUG CONSTRAINTS:"
        print(f"{method_debug_tag} Draft {self.draft.id}: Received payload: {payload}")

        if not isinstance(payload, dict):
            error_msg = "Error: Constraint update payload was not a valid dictionary format."
            print(f"{method_debug_tag} {error_msg}")
            self.draft.ai_meta_data['pending_ai_narration_data_simple_ack'] = error_msg
            return

        # Whitelist of allowed constraint keys and their expected types/validation
        # For types: 'int', 'str', 'date' (YYYY-MM-DD string), 'choice'
        allowed_keys_config = {
            'total_marks': {'type': 'int'},
            'part_a_total_marks': {'type': 'int'},
            'part_b_total_marks': {'type': 'int'},
            'date': {'type': 'date'}, # Expected as "YYYY-MM-DD" string
            'semester': {'type': 'str'}, # e.g., "III Sem", "V"
            'duration': {'type': 'str'}, # e.g., "3 Hours", "90 minutes"
            'exam_type': {'type': 'choice', 'choices': ['CIE', 'SEE', 'Quiz', 'Test Event']}, # Example choices
            'part_a_question_marks': {'type': 'int'}, # Default marks for Part A Qs
            'part_a_question_type': {'type': 'choice', 'choices': ['Quiz', 'MCQ', 'Test']},
            'part_b_question_marks': {'type': 'int'}, # Default marks for Part B Qs
            'part_b_question_type': {'type': 'choice', 'choices': ['Quiz', 'MCQ', 'Test']},
            'part_b_min_marks': {'type': 'int'} # Example from your prompt suggestion
            # Add any other specific constraint keys you anticipate
        }
        
        updated_constraints_dict = {} # Store validated and typed values
        processed_keys = []
        warnings = []

        for key, raw_value in payload.items():
            if key not in allowed_keys_config:
                warnings.append(f"Unknown constraint key '{key}' was ignored.")
                print(f"{method_debug_tag} Warning: Unknown key '{key}' in payload. Value: '{raw_value}'")
                continue

            config = allowed_keys_config[key]
            processed_value = None

            if config['type'] == 'int':
                try:
                    processed_value = int(raw_value)
                except (ValueError, TypeError):
                    warnings.append(f"Invalid integer value for '{key}': '{raw_value}'. Skipped.")
                    print(f"{method_debug_tag} Warning: Invalid int for '{key}': {raw_value}")
                    continue
            elif config['type'] == 'date':
                if isinstance(raw_value, str):
                    try:
                        datetime.strptime(raw_value, '%Y-%m-%d') # Validate format
                        processed_value = raw_value # Store as validated string
                    except ValueError:
                        warnings.append(f"Invalid date format for '{key}': '{raw_value}'. Expected YYYY-MM-DD. Skipped.")
                        print(f"{method_debug_tag} Warning: Invalid date format for '{key}': {raw_value}")
                        continue
                else:
                    warnings.append(f"Invalid type for date '{key}': '{raw_value}'. Expected string. Skipped.")
                    continue
            elif config['type'] == 'choice':
                if isinstance(raw_value, str) and raw_value in config['choices']:
                    processed_value = raw_value
                else:
                    warnings.append(f"Invalid choice for '{key}': '{raw_value}'. Allowed: {config['choices']}. Skipped.")
                    print(f"{method_debug_tag} Warning: Invalid choice for '{key}': {raw_value}")
                    continue
            elif config['type'] == 'str':
                processed_value = str(raw_value) # Ensure it's a string
            
            if processed_value is not None:
                self.draft.constraints[key] = processed_value
                processed_keys.append(key)
            
        if processed_keys:
            ack_message_parts = [f"Constraints updated for: {', '.join(processed_keys)}."]
            
            # --- ADD CONSISTENCY CHECK FOR MARKS ---
            total_m = self.draft.constraints.get('total_marks')
            part_a_target_m = self.draft.constraints.get('part_a_total_marks')
            part_b_target_m = self.draft.constraints.get('part_b_total_marks')

            # Ensure they are numbers if they exist
            try: total_m = int(total_m) if total_m is not None else None
            except ValueError: total_m = None
            try: part_a_target_m = int(part_a_target_m) if part_a_target_m is not None else None
            except ValueError: part_a_target_m = None
            try: part_b_target_m = int(part_b_target_m) if part_b_target_m is not None else None
            except ValueError: part_b_target_m = None

            if total_m is not None and part_a_target_m is not None and part_b_target_m is not None:
                if total_m != (part_a_target_m + part_b_target_m):
                    inconsistency_warning = (
                        f"Warning: Total marks ({total_m}) does not match the sum of "
                        f"Part A ({part_a_target_m}) and Part B ({part_b_target_m}) targets. "
                        f"Please adjust these for consistency."
                    )
                    warnings.append(inconsistency_warning) # Add to general warnings
                    print(f"{method_debug_tag} {inconsistency_warning}")
            # --- END CONSISTENCY CHECK ---
            
            # Check if total marks for parts were updated, then update current marks status
            part_marks_updated = any(k in processed_keys for k in ['part_a_total_marks', 'part_b_total_marks', 'total_marks']) # if total_marks affects parts
            if part_marks_updated:
                self._update_draft_current_marks() 
                part_a_current = self.draft.constraints.get('part_a_current_marks', 0)
                # Use the newly set target for the message
                part_a_target_final = self.draft.constraints.get('part_a_total_marks', 0) 
                part_b_current = self.draft.constraints.get('part_b_current_marks', 0)
                part_b_target_final = self.draft.constraints.get('part_b_total_marks', 0)
                ack_message_parts.append(f"Part A status: {part_a_current}/{part_a_target_final} marks.")
                ack_message_parts.append(f"Part B status: {part_b_current}/{part_b_target_final} marks.")

            if warnings:
                ack_message_parts.append("Additionally: " + " ".join(warnings))
            
            self.draft.ai_meta_data['pending_ai_narration_data_simple_ack'] = " ".join(ack_message_parts)
            self.draft.ai_meta_data['last_action_status'] = f"Constraints processed. Updated: {processed_keys}. Warnings: {warnings if warnings else 'None'}."
            print(f"{method_debug_tag} Successfully processed: {processed_keys}. Final constraints: {self.draft.constraints}")
        elif warnings: # Only warnings, no valid keys processed
            self.draft.ai_meta_data['pending_ai_narration_data_simple_ack'] = "Could not update constraints due to issues: " + " ".join(warnings)
            self.draft.ai_meta_data['last_action_status'] = f"Constraint update failed. Warnings: {warnings}"
        else: # Payload was empty or contained no processable keys
            self.draft.ai_meta_data['pending_ai_narration_data_simple_ack'] = "No valid constraints were found in your request to update."
            self.draft.ai_meta_data['last_action_status'] = "No valid constraints in payload."
        
        # self.draft.save() will be called at the end of process_faculty_request

    def _get_question_type_and_default_marks_filter(self, part_hint=None, type_from_payload=None, marks_from_payload=None):
        """
        Determines the question type filter and default marks filter based on part hint or explicit type.
        Returns a Q object for type and a Q object for marks.
        """
        type_filter = Q()
        marks_filter = Q()
        resolved_type = type_from_payload

        if not resolved_type: # Infer type if not explicitly given by AI
            if part_hint == 'A':
                resolved_type = 'Quiz' # Default to Quiz for Part A, can also include MCQ
            elif part_hint == 'B':
                resolved_type = 'Test'
        
        if resolved_type == 'Quiz':
            type_filter = (Q(type__iexact='Quiz') | Q(type__iexact='MCQ'))
            if marks_from_payload is None: # Only apply default if marks are NOT specified
                marks_filter = Q(marks__lte=2) # Typical for Quiz/MCQ
        elif resolved_type == 'Test':
            type_filter = Q(type__iexact='Test')
            if marks_from_payload is None: # Only apply default if marks are NOT specified
                marks_filter = Q(marks__gt=2) # Typical for Test
        elif resolved_type: # If AI specified a type directly (e.g. MCQ)
             type_filter = Q(type__iexact=resolved_type)
             # No default marks filter if type is explicit but part_hint is not A/B, or if marks are given

        # If marks are explicitly provided in payload, they override defaults
        if marks_from_payload is not None:
            try:
                marks_filter = Q(marks=int(marks_from_payload))
            except ValueError:
                print(f"Warning: Invalid marks value in payload: {marks_from_payload}")
                marks_filter = Q() # No marks filter if invalid
        
        return type_filter, marks_filter, resolved_type

    def _handle_suggest_questions(self, payload):
        print(f"DEBUG SUGGEST: Part '{payload.get('part')}', Payload: {payload}")
        course_pk = payload.get('course_id', self.draft.course.pk)
        part_hint = payload.get('part') # 'A' or 'B', used as a hint for type/marks
        count = payload.get('count', 3)
        
        target_marks_for_part = self.draft.constraints.get(f'part_{part_hint.lower()}_total_marks', 0) if part_hint else 0
        current_marks_for_part = self._get_current_part_marks(part_hint) if part_hint else 0
        remaining_marks = target_marks_for_part - current_marks_for_part

        # If remaining marks are specific and small, adjust query
        exact_marks_needed = payload.get('marks')
        if not exact_marks_needed and remaining_marks > 0 and remaining_marks <= 10 and count == 1: # Heuristic for filling small gap
            print(f"Attempting to find question with exact remaining marks: {remaining_marks} for Part {part_hint}")
            payload['marks'] = remaining_marks # Temporarily set for this suggestion query
        
        filters = Q(course_id=course_pk)
        
        type_filter, marks_filter, suggested_for_type = self._get_question_type_and_default_marks_filter(
            part_hint, 
            payload.get('type'),
            payload.get('marks') # Pass marks from payload
        )
        filters &= type_filter
        filters &= marks_filter
            
        if payload.get('difficulty_level'):
            filters &= Q(difficulty_level__iexact=payload.get('difficulty_level'))
        if payload.get('co'):
            filters &= Q(co__iexact=payload.get('co'))
        if payload.get('bt'):
            filters &= Q(bt__iexact=payload.get('bt'))
        
        unit_identifier = payload.get('unit_id__unit_id') or payload.get('unit_number')
        if unit_identifier:
            try:
                filters &= Q(unit_id__unit_id=int(unit_identifier), unit_id__course_id=course_pk)
            except ValueError:
                print(f"Warning: Invalid unit identifier in payload: {unit_identifier}")
        elif payload.get('unit_id'): # Fallback if AI just sends 'unit_id' that might be the Unit model PK
            try: filters &= Q(unit_id__pk=int(payload.get('unit_id')))
            except ValueError: pass
        
        # Handle text search
        if payload.get('text__icontains'):
            keywords = payload.get('text__icontains').split()
            for keyword in keywords:
                filters &= Q(text__icontains=keyword.strip())
        
        existing_q_ids = self.draft.part_a_question_ids + self.draft.part_b_question_ids
        
        # Order by something (e.g., random) to get varied suggestions
        questions_qs = Question.objects.filter(filters).exclude(q_id__in=existing_q_ids).order_by('?')[:count]

        if questions_qs.exists():
            print(f"DEBUG SUGGEST: Found {len(questions_qs)} candidates. QIDs: {[q.q_id for q in questions_qs]}")
            suggested_q_data = [self._format_question_for_narration(q) for q in questions_qs]
            self.draft.ai_meta_data['pending_ai_narration_data_suggestions'] = {
                "for_part_hint": part_hint, # Store which part these were intended for
                "for_type": suggested_for_type, # Store the resolved type
                "questions": suggested_q_data,
                "remaining_marks_in_part": remaining_marks if part_hint else "N/A"
            }
            self.draft.ai_meta_data['last_action_status'] = f"Prepared {len(suggested_q_data)} suggestions (type: {suggested_for_type})."
            print(f"DEBUG SUGGEST: Setting narration_suggestions for Part '{part_hint}' with QIDs: {[s['q_id'] for s in suggested_q_data]}")
        else:
            print(f"DEBUG SUGGEST: No candidates found matching filters.")
            # --- IMPROVED VIOLATION MESSAGE ---
            criteria_summary = []
            if part_hint: criteria_summary.append(f"intended for Part {part_hint}")
            criteria_summary.append(f"type '{suggested_for_type or payload.get('type', 'any')}'")
            
            if payload.get('difficulty_level'): criteria_summary.append(f"difficulty '{payload.get('difficulty_level')}'")
            if payload.get('marks') is not None: criteria_summary.append(f"marks '{payload.get('marks')}'") # Check if key exists
            else: # Indicate default marks were used if applicable
                if (suggested_for_type == 'Quiz' or suggested_for_type == 'MCQ'): criteria_summary.append("default marks (<=2)")
                elif suggested_for_type == 'Test': criteria_summary.append("default marks (>2)")
            
            if payload.get('co'): criteria_summary.append(f"CO '{payload.get('co')}'")
            if payload.get('bt'): criteria_summary.append(f"BT '{payload.get('bt')}'")
            if unit_identifier: criteria_summary.append(f"Unit '{unit_identifier}'")
            
            violation_message = f"I couldn't find any questions for course '{self.draft.course.course_name}' matching: {', '.join(criteria_summary)}. "
            if part_hint: 
                violation_message += f"(Remaining marks for Part {part_hint}: {remaining_marks}/{target_marks_for_part}). "
            violation_message += "You could try being less specific, or try different criteria (e.g., different unit, difficulty, or marks)."
            self.draft.ai_meta_data['pending_ai_narration_data_violation'] = violation_message
            self.draft.ai_meta_data['last_action_status'] = "No questions found; violation feedback prepared."
            print(f"DEBUG Service: Draft {self.draft.id}: No questions found for Part {part_hint} with criteria. Violation: {violation_message}")

    def _format_question_for_narration(self, question: Question):
        return {
            "q_id": question.q_id,
            "text_summary": question.text[:100] + "...",
            "unit_name": question.unit_id.unit_name if question.unit_id else "N/A",
            "unit_number": question.unit_id.unit_id if question.unit_id else "N/A",
            "marks": question.marks,
            "difficulty": question.difficulty_level,
            "co": question.co,
            "bt": question.bt,
            "type": question.type
        }

    def _handle_suggest_balanced_questions(self, payload):
        method_debug_tag = "DEBUG BALANCED_SUGGEST:"
        part_hint = payload.get('part')
        # Ensure target_marks is an integer
        try:
            target_marks = int(payload.get('target_marks', 10 if part_hint == 'A' else 50))
        except ValueError:
            target_marks = 10 if part_hint == 'A' else 50 # Fallback
            print(f"{method_debug_tag} Warning: Invalid target_marks in payload, using default {target_marks}")

        course_pk = payload.get('course_id', self.draft.course.pk)
        
        current_marks_for_part = self._get_current_part_marks(part_hint) if part_hint else 0
        remaining_marks_to_fill = target_marks - current_marks_for_part
        
        print(f"{method_debug_tag} Part: {part_hint}, Original Target: {target_marks}, Current Marks: {current_marks_for_part}, Remaining to Fill: {remaining_marks_to_fill}")

        if remaining_marks_to_fill <= 0:
            self.draft.ai_meta_data['pending_ai_narration_data_violation'] = (
                f"Part {part_hint} already has {current_marks_for_part}/{target_marks} marks. "
                f"No additional marks needed or target already met/exceeded."
            )
            print(f"{method_debug_tag} No marks to fill for Part {part_hint}.")
            return
        
        type_filter, _, resolved_type = self._get_question_type_and_default_marks_filter(
            part_hint, payload.get('type') 
            # For balanced, we typically don't take specific 'marks' from payload for individual Qs
        )
        
        base_query = Q(course_id=course_pk) & type_filter
        if payload.get('text__icontains'):
            keywords = payload.get('text__icontains').split()
            for keyword in keywords: base_query &= Q(text__icontains=keyword.strip())
        if payload.get('difficulty_level'): # Allow filtering by difficulty if specified for balanced
            base_query &= Q(difficulty_level__iexact=payload.get('difficulty_level'))
        
        existing_q_ids = self.draft.part_a_question_ids + self.draft.part_b_question_ids
        
        # Get all potentially suitable questions, ordered to help selection
        # Prioritize questions that help meet the mark count without going too far over.
        # Order by marks descending to try to fill larger chunks first.
        available_questions_list = list(
            Question.objects.filter(base_query)
            .exclude(q_id__in=existing_q_ids)
            .order_by('-marks', '?') # Try larger marks first, then random for variety
        )
        
        print(f"{method_debug_tag} Found {len(available_questions_list)} initial available questions for Part {part_hint} (type: {resolved_type}).")

        selected_questions_for_suggestion = []
        current_sum_of_suggestions = 0
        used_q_ids_in_this_suggestion = set()

        # Phase 1: Try to get as close as possible with larger questions without exceeding
        for q in available_questions_list:
            if q.q_id in used_q_ids_in_this_suggestion: continue
            if current_sum_of_suggestions + q.marks <= remaining_marks_to_fill:
                selected_questions_for_suggestion.append(q)
                used_q_ids_in_this_suggestion.add(q.q_id)
                current_sum_of_suggestions += q.marks
            if current_sum_of_suggestions == remaining_marks_to_fill:
                break 
        
        print(f"{method_debug_tag} After Phase 1 (greedy fill): {len(selected_questions_for_suggestion)} questions, sum {current_sum_of_suggestions}/{remaining_marks_to_fill} marks.")

        # Phase 2: If still under, try to find an exact match for the small remaining gap
        if 0 < (remaining_marks_to_fill - current_sum_of_suggestions) <= 5: # Small gap (e.g., <= 5 marks)
            gap = remaining_marks_to_fill - current_sum_of_suggestions
            print(f"{method_debug_tag} Phase 2: Small gap of {gap} marks remaining.")
            # Look for a single question that fills the gap exactly
            # among those not yet used and not exceeding the gap too much.
            # We should prioritize questions with marks == gap.
            exact_match_q = next((q_exact for q_exact in available_questions_list 
                                  if q_exact.q_id not in used_q_ids_in_this_suggestion and q_exact.marks == gap), None)
            if exact_match_q:
                print(f"{method_debug_tag} Found exact match QID {exact_match_q.q_id} for gap.")
                selected_questions_for_suggestion.append(exact_match_q)
                used_q_ids_in_this_suggestion.add(exact_match_q.q_id)
                current_sum_of_suggestions += exact_match_q.marks

        print(f"{method_debug_tag} After Phase 2 (gap fill): {len(selected_questions_for_suggestion)} questions, sum {current_sum_of_suggestions}/{remaining_marks_to_fill} marks.")
        
        # Phase 3: If still not exact, and overshoot is allowed by a small margin (e.g. 1-2 marks)
        # This is optional and depends on how strict you want to be.
        # For now, we'll prioritize not overshooting from the balanced suggestion.
        # The faculty can then be informed if the target isn't met.

        if selected_questions_for_suggestion:
            formatted_suggestions = [self._format_question_for_narration(q) for q in selected_questions_for_suggestion]
            self.draft.ai_meta_data['pending_ai_narration_data_suggestions'] = {
                "for_part_hint": part_hint,
                "for_type": resolved_type,
                "questions": formatted_suggestions,
                "total_suggested_marks": current_sum_of_suggestions, # Sum of this suggestion set
                "target_marks_for_part_when_suggested": remaining_marks_to_fill # What we aimed for in this suggestion round
            }
            self.draft.ai_meta_data['last_action_status'] = (
                f"Prepared {len(formatted_suggestions)} balanced suggestions for Part {part_hint} "
                f"(type: {resolved_type}, aiming for {remaining_marks_to_fill} marks, got {current_sum_of_suggestions} marks)."
            )
            print(f"DEBUG Service: Draft {self.draft.id}: Prepared {len(formatted_suggestions)} balanced suggestions for Part {part_hint}. QIDs: {[s['q_id'] for s in formatted_suggestions]}. Sum: {current_sum_of_suggestions}")
        else:
            self.draft.ai_meta_data['pending_ai_narration_data_violation'] = (
                f"Could not generate a suitable balanced set of questions for Part {part_hint} (type: {resolved_type}) "
                f"to fill the remaining {remaining_marks_to_fill} marks with current availability. "
                f"Try suggesting questions with specific criteria or different topics."
            )
            print(f"DEBUG Service: Draft {self.draft.id}: No balanced questions found for Part {part_hint} (type: {resolved_type}). Aimed for: {remaining_marks_to_fill}")

    def _handle_swap_question(self, payload):
        part = payload.get('part')
        q_id_to_remove = payload.get('q_id_to_remove')
        criteria = payload.get('new_question_criteria', {})
        course_pk = criteria.get('course_id', self.draft.course.pk)

        try:
            q_id_to_remove = int(q_id_to_remove)
        except (ValueError, TypeError):
            self.draft.ai_meta_data['pending_ai_narration_data_swap_result'] = "Invalid Q_ID to remove."
            return

        # Remove the old question from the draft part
        original_question_removed = False
        question_to_remove_obj = None
        try:
            question_to_remove_obj = Question.objects.get(q_id=q_id_to_remove, course_id=course_pk)
        except Question.DoesNotExist:
            self.draft.ai_meta_data['pending_ai_narration_data_swap_result'] = f"Question QID {q_id_to_remove} not found in the database for this course."
            return

        target_marks_for_replacement = question_to_remove_obj.marks # Default to same marks

        if part == 'A' and q_id_to_remove in self.draft.part_a_question_ids:
            self.draft.part_a_question_ids.remove(q_id_to_remove)
            original_question_removed = True
        elif part == 'B' and q_id_to_remove in self.draft.part_b_question_ids:
            self.draft.part_b_question_ids.remove(q_id_to_remove)
            original_question_removed = True
        else:
            self.draft.ai_meta_data['pending_ai_narration_data_swap_result'] = f"QID {q_id_to_remove} not found in Part {part} of the draft."
            return
        
        # Find a new question based on criteria
        filters = Q(course_id=course_pk)
        if criteria.get('marks'): filters &= Q(marks=int(criteria.get('marks')))
        else: filters &= Q(marks=target_marks_for_replacement) # Try to match marks of removed question
            
        if criteria.get('difficulty_level'): filters &= Q(difficulty_level__iexact=criteria.get('difficulty_level'))
        if criteria.get('co'): filters &= Q(co__iexact=criteria.get('co'))
        if criteria.get('bt'): filters &= Q(bt__iexact=criteria.get('bt'))
        # Handle unit_id (assuming unit_number is passed)
        if criteria.get('unit_id__unit_id'): filters &= Q(unit_id__unit_id=int(criteria.get('unit_id__unit_id')), unit_id__course_id=course_pk)
        if criteria.get('text__icontains'): filters &= Q(text__icontains=criteria.get('text__icontains'))
        
        # Exclude already selected questions and the one just removed (in case of re-adding)
        all_draft_q_ids = self.draft.part_a_question_ids + self.draft.part_b_question_ids + [q_id_to_remove]
        
        replacement_qs = Question.objects.filter(filters).exclude(q_id__in=all_draft_q_ids).order_by('?') # Random pick if multiple
        
        if replacement_qs.exists():
            new_question = replacement_qs.first()
            if part == 'A': self.draft.part_a_question_ids.append(new_question.q_id)
            elif part == 'B': self.draft.part_b_question_ids.append(new_question.q_id)
            
            self.draft.ai_meta_data['pending_ai_narration_data_swap_result'] = (
                f"Successfully swapped QID {q_id_to_remove} with QID {new_question.q_id} "
                f"(Text: {new_question.text[:50]}...)."
            )
            self.draft.ai_meta_data['last_action_status'] = f"Swapped QID {q_id_to_remove} with {new_question.q_id}."
        else:
            # Rollback: add the original question back if no replacement found
            if original_question_removed:
                if part == 'A': self.draft.part_a_question_ids.append(q_id_to_remove)
                elif part == 'B': self.draft.part_b_question_ids.append(q_id_to_remove)
            self.draft.ai_meta_data['pending_ai_narration_data_swap_result'] = (
                f"Could not find a suitable replacement for QID {q_id_to_remove} matching the criteria. "
                f"QID {q_id_to_remove} has been kept in Part {part}."
            )
            self.draft.ai_meta_data['last_action_status'] = f"Failed to find replacement for QID {q_id_to_remove}."

    def _handle_tune_difficulty(self, payload):
        part = payload.get('part')
        direction = payload.get('direction') # 'harder' or 'easier'
        course_pk = payload.get('course_id', self.draft.course.pk)

        q_ids_in_part = []
        if part == 'A': q_ids_in_part = list(self.draft.part_a_question_ids) # Operate on a copy
        elif part == 'B': q_ids_in_part = list(self.draft.part_b_question_ids)
        else:
            self.draft.ai_meta_data['pending_ai_narration_data_tune_result'] = "Invalid part specified for tuning."
            return

        if not q_ids_in_part:
            self.draft.ai_meta_data['pending_ai_narration_data_tune_result'] = f"No questions in Part {part} to tune."
            return

        questions_in_part_objs = list(Question.objects.filter(q_id__in=q_ids_in_part, course_id=course_pk))
        if not questions_in_part_objs: # Should not happen if q_ids_in_part is populated
            self.draft.ai_meta_data['pending_ai_narration_data_tune_result'] = f"Could not fetch questions for Part {part}."
            return

        swapped_count = 0
        difficulty_map = {'Easy': 1, 'Medium': 2, 'Hard': 3}
        
        # Sort questions by current difficulty to find candidates for swap
        if direction == 'harder':
            questions_in_part_objs.sort(key=lambda q: difficulty_map.get(q.difficulty_level, 0))
        elif direction == 'easier':
            questions_in_part_objs.sort(key=lambda q: difficulty_map.get(q.difficulty_level, 0), reverse=True)
        else:
            self.draft.ai_meta_data['pending_ai_narration_data_tune_result'] = "Invalid direction for tuning."
            return

        # Try to swap 1 or 2 questions
        max_swaps = min(2, len(questions_in_part_objs)) 

        for q_to_replace in questions_in_part_objs:
            if swapped_count >= max_swaps: break

            current_difficulty_val = difficulty_map.get(q_to_replace.difficulty_level, 0)
            
            potential_replacements_filter = Q(course_id=course_pk) & Q(marks=q_to_replace.marks) # Match marks
            potential_replacements_filter &= ~Q(q_id__in=(self.draft.part_a_question_ids + self.draft.part_b_question_ids)) # Not already in draft (after potential removal)
            
            if direction == 'harder' and current_difficulty_val < 3: # Easy or Medium
                potential_replacements_filter &= Q(difficulty_level__gt=q_to_replace.difficulty_level)
            elif direction == 'easier' and current_difficulty_val > 1: # Medium or Hard
                potential_replacements_filter &= Q(difficulty_level__lt=q_to_replace.difficulty_level)
            else:
                continue # Cannot make it harder/easier

            replacements = Question.objects.filter(potential_replacements_filter).order_by('?')
            
            if replacements.exists():
                new_q = replacements.first()
                # Perform swap in draft
                if part == 'A':
                    self.draft.part_a_question_ids.remove(q_to_replace.q_id)
                    self.draft.part_a_question_ids.append(new_q.q_id)
                elif part == 'B':
                    self.draft.part_b_question_ids.remove(q_to_replace.q_id)
                    self.draft.part_b_question_ids.append(new_q.q_id)
                
                swapped_count += 1
                self.draft.ai_meta_data['last_action_status'] = (
                    f"Tuned difficulty: Swapped QID {q_to_replace.q_id} ({q_to_replace.difficulty_level}) "
                    f"with QID {new_q.q_id} ({new_q.difficulty_level}) in Part {part}."
                )
                # We'll generate a summary message at the end
            if swapped_count >= max_swaps: break
        
        if swapped_count > 0:
            self.draft.ai_meta_data['pending_ai_narration_data_tune_result'] = f"Attempted to make Part {part} {direction}. Swapped {swapped_count} question(s)."
        else:
            self.draft.ai_meta_data['pending_ai_narration_data_tune_result'] = f"Could not find suitable questions to make Part {part} {direction} further with current availability while matching marks."

    def _handle_add_questions(self, payload):
        q_ids_to_add_payload = payload.get('q_ids', [])
        part = payload.get('part')
        
        print(f"DEBUG ADD: Part '{part}', Attempting to add QIDs: {q_ids_to_add_payload}")
        
        if not isinstance(q_ids_to_add_payload, list):
            print("Invalid q_ids payload for ADD_QUESTIONS: not a list.")
            return
        
        target_marks_for_part = self.draft.constraints.get(f'part_{part.lower()}_total_marks', 0)
        current_marks_for_part = self._get_current_part_marks(part)
        
        # Validate q_ids exist and belong to the course
        valid_questions = Question.objects.filter(q_id__in=q_ids_to_add_payload, course_id=self.draft.course)
        
        added_q_ids_this_turn = []
        skipped_q_ids_due_to_marks = []
        
        destination_list = self.draft.part_a_question_ids if part == 'A' else self.draft.part_b_question_ids

        for q_obj in valid_questions:
            if q_obj.q_id in destination_list: # Already added
                continue 
            if current_marks_for_part + q_obj.marks <= target_marks_for_part:
                destination_list.append(q_obj.q_id)
                current_marks_for_part += q_obj.marks
                added_q_ids_this_turn.append(q_obj.q_id)
            else:
                skipped_q_ids_due_to_marks.append(q_obj.q_id)
        
        self._update_draft_current_marks() # Update current marks in constraints
        
        print(f"DEBUG ADD: Actually added QIDs: {added_q_ids_this_turn}. Skipped: {skipped_q_ids_due_to_marks}. New Part {part} list: {destination_list}")

        narration = ""
        if added_q_ids_this_turn:
            narration += f"Added QID(s) {', '.join(map(str, added_q_ids_this_turn))} to Part {part}. "
            narration += f"Current marks for Part {part}: {current_marks_for_part}/{target_marks_for_part}. "
        if skipped_q_ids_due_to_marks:
            narration += f"Could not add QID(s) {', '.join(map(str, skipped_q_ids_due_to_marks))} as it would exceed the marks limit for Part {part}. "
        if not added_q_ids_this_turn and not skipped_q_ids_due_to_marks:
             narration = f"No new valid questions found to add or QIDs already present in Part {part}."
        
        self.draft.ai_meta_data['pending_ai_narration_data_simple_ack'] = narration.strip()
        self.draft.ai_meta_data['last_action_status'] = f"Processed add questions for Part {part}."
        print(f"DEBUG Service: Draft {self.draft.id}, Part {part}: Added QIDs: {added_q_ids_this_turn}. Skipped (marks): {skipped_q_ids_due_to_marks}. Current Marks: {current_marks_for_part}/{target_marks_for_part}.")

    def _handle_calculate_coverage(self, payload): # payload might be empty or have specific targets
        all_selected_q_ids = list(set(self.draft.part_a_question_ids + self.draft.part_b_question_ids))
        
        if not all_selected_q_ids:
            self.draft.ai_meta_data['pending_ai_narration_data_coverage_summary'] = {
                "message": "No questions selected yet to calculate coverage."
            }
            self.draft.ai_meta_data['last_action_status'] = "No questions for coverage calculation."
            return

        questions_in_draft = Question.objects.filter(q_id__in=all_selected_q_ids)

        # CO Coverage
        co_coverage = questions_in_draft.values('co').annotate(
            count=Count('q_id'), 
            total_marks=Sum('marks')
        ).order_by('co')

        # BT Coverage
        bt_coverage = questions_in_draft.values('bt').annotate(
            count=Count('q_id'),
            total_marks=Sum('marks')
        ).order_by('bt')

        # Unit Coverage
        unit_coverage = questions_in_draft.values('unit_id__unit_name', 'unit_id__unit_id').annotate( # Include unit_id (number)
            count=Count('q_id'),
            total_marks=Sum('marks')
        ).order_by('unit_id__unit_name')
        
        # Difficulty Level Coverage
        difficulty_coverage = questions_in_draft.values('difficulty_level').annotate(
            count=Count('q_id'),
            total_marks=Sum('marks')
        ).order_by('difficulty_level')

        # Marks per Part
        part_a_marks = questions_in_draft.filter(q_id__in=self.draft.part_a_question_ids).aggregate(Sum('marks'))['marks__sum'] or 0
        part_b_marks = questions_in_draft.filter(q_id__in=self.draft.part_b_question_ids).aggregate(Sum('marks'))['marks__sum'] or 0
        total_draft_marks = part_a_marks + part_b_marks

        summary = {
            "overall_summary": {
                "total_questions": questions_in_draft.count(),
                "total_marks_in_draft": total_draft_marks,
                "part_a_questions": len(self.draft.part_a_question_ids),
                "part_a_marks": part_a_marks,
                "part_b_questions": len(self.draft.part_b_question_ids),
                "part_b_marks": part_b_marks,
            },
            "co_coverage": list(co_coverage),
            "bt_coverage": list(bt_coverage),
            "unit_coverage": [
                {"unit_name": u['unit_id__unit_name'], "unit_number": u['unit_id__unit_id'], "count": u['count'], "total_marks": u['total_marks']} 
                for u in unit_coverage
            ],
            "difficulty_coverage": list(difficulty_coverage),
        }
        
        self.draft.ai_meta_data['pending_ai_narration_data_coverage_summary'] = summary
        self.draft.ai_meta_data['last_action_status'] = "Coverage summary calculated for AI narration."
        print(f"Draft {self.draft.id}: Coverage summary calculated.")

    def _handle_get_question_details(self, payload):
        q_id = payload.get('q_id')
        if not q_id:
            self.draft.ai_meta_data['pending_ai_narration_data_question_details'] = {"error": "Q_ID not provided for details."}
            self.draft.ai_meta_data['last_action_status'] = "Missing Q_ID for GET_QUESTION_DETAILS."
            return

        try:
            # Convert q_id to int if it comes as string from JSON
            q_id = int(q_id)
            question = Question.objects.select_related('unit_id', 'course_id').get(q_id=q_id)
            details = {
                "q_id": question.q_id,
                "text": question.text,
                "course_name": question.course_id.course_name,
                "unit_name": question.unit_id.unit_name if question.unit_id else "N/A",
                "unit_number": question.unit_id.unit_id if question.unit_id else "N/A",
                "marks": question.marks,
                "co": question.co,
                "bt": question.bt,
                "difficulty_level": question.difficulty_level,
                "type": question.type,
                # Add image/media info if available and needed
                # "has_image": bool(question.image),
                # "media": [m.url for m in question.media.all()]
            }
            self.draft.ai_meta_data['pending_ai_narration_data_question_details'] = details
            self.draft.ai_meta_data['last_action_status'] = f"Details for QID {q_id} prepared for AI narration."
        except Question.DoesNotExist:
            self.draft.ai_meta_data['pending_ai_narration_data_question_details'] = {"error": f"Question with QID {q_id} not found."}
            self.draft.ai_meta_data['last_action_status'] = f"QID {q_id} not found for GET_QUESTION_DETAILS."
        except ValueError:
            self.draft.ai_meta_data['pending_ai_narration_data_question_details'] = {"error": f"Invalid QID format: {q_id}."}
            self.draft.ai_meta_data['last_action_status'] = f"Invalid QID format for GET_QUESTION_DETAILS: {q_id}."
        except Exception as e:
            print(f"Error in _handle_get_question_details: {e}")
            self.draft.ai_meta_data['pending_ai_narration_data_question_details'] = {"error": "An unexpected error occurred while fetching question details."}

    def _handle_finalize_paper(self, payload):
        print("DEBUG FINALIZE: Starting paper generation...") # Keep this
        if not self.draft.part_a_question_ids and not self.draft.part_b_question_ids:
            self.draft.ai_meta_data['pending_ai_narration_data_finalize_result'] = "Cannot finalize. No questions added."
            self.draft.ai_meta_data['last_action_status'] = "Finalize failed: no questions."
            self.draft.save() # Save the status and meta_data
            return

        # 1. Metadata Object (ActualMetadata class as defined in Prompt 30)
        class ActualMetadata: # Define or import this class
            def __init__(self, draft_obj, faculty_profile_obj):
                self.course_code = draft_obj.course.course_id
                self.course_title = draft_obj.course.course_name
                # Ensure date from constraints is parsed or default
                date_str = draft_obj.constraints.get('date')
                if isinstance(date_str, str):
                    try: self.date = datetime.strptime(date_str, '%Y-%m-%d')
                    except ValueError: self.date = datetime.now()
                else: self.date = datetime.now()
                
                self.max_marks = draft_obj.constraints.get('total_marks', 60)
                self.duration = draft_obj.constraints.get('duration', "3 Hours")
                self.semester = draft_obj.constraints.get('semester', "N/A")
                self.faculty = faculty_profile_obj
                self.exam_type = draft_obj.constraints.get('exam_type', 'CIE')
                # self.is_improvement_cie = draft_obj.constraints.get('is_improvement_cie', False) # If your generator uses it

        faculty_profile = None
        try:
            faculty_profile = Faculty.objects.get(user=self.draft.faculty)
        except Faculty.DoesNotExist:
            self.draft.status = 'drafting'
            error_msg = "Error: Faculty profile not found. Cannot generate paper."
            self.draft.ai_meta_data['pending_ai_narration_data_finalize_result'] = error_msg
            self.draft.ai_meta_data['last_action_status'] = error_msg
            print(f"DEBUG FINALIZE: {error_msg}")
            self.draft.save()
            return

        metadata_for_generator = ActualMetadata(self.draft, faculty_profile)
        # Log the prepared metadata
        prepared_metadata_log = {k: str(v) for k, v in metadata_for_generator.__dict__.items()}
        print(f"DEBUG FINALIZE: Metadata prepared: {prepared_metadata_log}")


        # 2. Selected Questions: List of objects with 'part' and 'question' (Question instance)
        class SelectionObject: # Define helper class here or import if defined elsewhere
            def __init__(self, question_instance, part_char):
                self.question = question_instance
                self.part = part_char

        all_q_ids_in_draft = list(set(self.draft.part_a_question_ids + self.draft.part_b_question_ids))
        question_objects_map = {
            q.q_id: q for q in Question.objects.filter(q_id__in=all_q_ids_in_draft).prefetch_related('media', 'unit_id')
        }

        selected_questions_for_generator = []
        for q_id in self.draft.part_a_question_ids:
            if q_id in question_objects_map:
                selected_questions_for_generator.append(SelectionObject(question_objects_map[q_id], 'A'))
        for q_id in self.draft.part_b_question_ids:
            if q_id in question_objects_map:
                selected_questions_for_generator.append(SelectionObject(question_objects_map[q_id], 'B'))
        
        # Log the structure of one item to verify
        if selected_questions_for_generator:
            first_sel = selected_questions_for_generator[0]
            print(f"DEBUG FINALIZE: First item in selected_questions_for_generator - part: {first_sel.part}, q_id: {first_sel.question.q_id}")
        print(f"DEBUG FINALIZE: Selected question data prepared with {len(selected_questions_for_generator)} items.")


        # 3. questions_data: List/Queryset of all unique Question model instances in the draft
        questions_data_for_generator = list(question_objects_map.values())
        print(f"DEBUG FINALIZE: Question objects fetched: {len(questions_data_for_generator)} questions")

        try:
            print("DEBUG FINALIZE: Starting QuestionPaperGenerator.create_paper...")
            generated_doc_object = QuestionPaperGenerator.create_paper(
                metadata_for_generator,
                selected_questions_for_generator, # NOW A LIST OF OBJECTS
                questions_data_for_generator
            )
            
            output_dir = os.path.join(settings.BASE_DIR, "generated_papers") 
            os.makedirs(output_dir, exist_ok=True)
            print(f"DEBUG FINALIZE: Output directory ensured at: {output_dir}")

            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            # Sanitize username for filename if necessary
            faculty_username_safe = "".join(c if c.isalnum() else "_" for c in self.draft.faculty.username)
            file_name = f"AI_QP_{self.draft.course.course_id}_{faculty_username_safe}_{timestamp}.docx"
            output_path = os.path.join(output_dir, file_name)
            
            generated_doc_object.save(output_path)
            print(f"DEBUG FINALIZE: Paper saved to {output_path}")
            
            # Convert DOCX to PDF
            pdf_file_name = f"AI_QP_{self.draft.course.course_id}_{faculty_username_safe}_{timestamp}.pdf"
            pdf_output_path = os.path.join(output_dir, pdf_file_name)
            try:
                from docx2pdf import convert
                convert(output_path, pdf_output_path)
                print(f"DEBUG FINALIZE: PDF saved to {pdf_output_path}")
            except Exception as e:
                print(f"DEBUG FINALIZE: PDF conversion failed: {e}")
                pdf_output_path = None

            self.draft.status = 'finalized' # Set status only on successful generation
            narration_msg = f"Paper generated successfully: {pdf_file_name if pdf_output_path else file_name}. The draft is now finalized."
            self.draft.ai_meta_data['pending_ai_narration_data_finalize_result'] = narration_msg
            # Save PDF path if available, else fallback to DOCX
            if pdf_output_path:
                self.draft.ai_meta_data['generated_paper_path'] = os.path.join("generated_papers", pdf_file_name)
            else:
                self.draft.ai_meta_data['generated_paper_path'] = os.path.join("generated_papers", file_name)
            self.draft.ai_meta_data['last_action_status'] = "Paper generation successful."

        except Exception as e:
            # Log the full traceback for the actual error from QuestionPaperGenerator
            import traceback
            print(f"ERROR:root:Error generating paper: {e}\n{traceback.format_exc()}") # Full traceback
            # Keep status as 'drafting' on failure
            self.draft.status = 'drafting' 
            narration_msg = f"Paper generation failed: {str(e)}. The draft remains open."
            self.draft.ai_meta_data['pending_ai_narration_data_finalize_result'] = narration_msg
            self.draft.ai_meta_data['last_action_status'] = f"Paper generation failed: {e}."
        
        print(f"DEBUG FINALIZE: Draft saved with status: {self.draft.status}")
        self.draft.save()

    def _get_current_part_marks(self, part_char):
        q_ids = self.draft.part_a_question_ids if part_char == 'A' else self.draft.part_b_question_ids
        if not q_ids:
            return 0
        return Question.objects.filter(q_id__in=q_ids).aggregate(total=Sum('marks'))['total'] or 0

    def _update_draft_current_marks(self):
        # Call this after any change to part_a/b_question_ids
        self.draft.constraints['part_a_current_marks'] = self._get_current_part_marks('A')
        self.draft.constraints['part_b_current_marks'] = self._get_current_part_marks('B')
        # No need to save draft here, will be saved at end of process_faculty_request

    def process_faculty_request(self, faculty_message_content: str, ai_reply_content: str):
        actions = self._parse_actions(ai_reply_content)
        self.draft.ai_meta_data['last_actions_parsed'] = actions

        # Clear relevant pending narrations before processing actions for this turn
        for key in list(self.draft.ai_meta_data.keys()):
            if key.startswith('pending_ai_narration_data_'):
                self.draft.ai_meta_data.pop(key, None)

        # Track if question lists changed
        initial_part_a_count = len(self.draft.part_a_question_ids)
        initial_part_b_count = len(self.draft.part_b_question_ids)

        if not actions:
            self.draft.ai_meta_data['last_action_status'] = "No specific action parsed from AI reply."
        else:
            for action in actions:
                action_type = action.get('type')
                payload = action.get('payload')

                if action_type == 'UPDATE_CONSTRAINTS': self._handle_update_constraints(payload)
                elif action_type == 'SUGGEST_QUESTIONS': self._handle_suggest_questions(payload)
                elif action_type == 'ADD_QUESTIONS': self._handle_add_questions(payload)
                elif action_type == 'CALCULATE_COVERAGE': self._handle_calculate_coverage(payload)
                elif action_type == 'GET_QUESTION_DETAILS': self._handle_get_question_details(payload)
                elif action_type == 'SUGGEST_BALANCED_QUESTIONS': self._handle_suggest_balanced_questions(payload)
                elif action_type == 'SWAP_QUESTION': self._handle_swap_question(payload)
                elif action_type == 'TUNE_DIFFICULTY': self._handle_tune_difficulty(payload)
                elif action_type == 'FINALIZE_PAPER': self._handle_finalize_paper(payload)
                elif action_type == 'REMOVE_QUESTION': self._handle_remove_question(payload)
                elif action_type == 'CLEAR_SELECTED_QUESTIONS': self._handle_clear_selected_questions(payload)
                else:
                    print(f"Unknown action type: {action_type}")
                    self.draft.ai_meta_data.setdefault('unknown_actions', []).append(action_type)

        # Always update marks at the end of processing to ensure they're current
        self._update_draft_current_marks()
        
        self.draft.save()
        return self.draft

    def _handle_remove_question(self, payload):
        part = payload.get('part')
        q_id_to_remove = payload.get('q_id')
        removed_count = 0
        narration = ""

        print(f"DEBUG REMOVE: Part '{part}', QID: {q_id_to_remove}")
        
        if not part or q_id_to_remove is None:
            narration = "Missing part or question ID for removal."
            print(f"DEBUG REMOVE: Missing information - Part: {part}, QID: {q_id_to_remove}")
        else:
            try: 
                q_id_to_remove = int(q_id_to_remove)
            except ValueError: 
                narration = f"Invalid QID format: {q_id_to_remove}."; 
                q_id_to_remove = None
                print(f"DEBUG REMOVE: Invalid QID format: {q_id_to_remove}")

            if q_id_to_remove is not None:
                target_list = None
                if part == 'A': 
                    target_list = self.draft.part_a_question_ids
                    print(f"DEBUG REMOVE: Current Part A list: {target_list}")
                elif part == 'B': 
                    target_list = self.draft.part_b_question_ids
                    print(f"DEBUG REMOVE: Current Part B list: {target_list}")

                if target_list is not None and q_id_to_remove in target_list:
                    target_list.remove(q_id_to_remove)
                    removed_count += 1
                    narration = f"QID {q_id_to_remove} removed from Part {part}."
                    print(f"DEBUG REMOVE: Successfully removed QID {q_id_to_remove} from Part {part}")
                    print(f"DEBUG REMOVE: Updated list: {target_list}")
                else:
                    narration = f"QID {q_id_to_remove} not found in Part {part}."
                    print(f"DEBUG REMOVE: QID {q_id_to_remove} not found in target list {target_list}")
        
        if removed_count > 0:
            self._update_draft_current_marks()
            target_marks_for_part = self.draft.constraints.get(f'part_{part.lower()}_total_marks', 0)
            current_marks_for_part = self.draft.constraints.get(f'part_{part.lower()}_current_marks', 0)
            narration += f" Current marks for Part {part}: {current_marks_for_part}/{target_marks_for_part}."
            print(f"DEBUG REMOVE: Updated marks - Current: {current_marks_for_part}, Target: {target_marks_for_part}")

        self.draft.ai_meta_data['pending_ai_narration_data_simple_ack'] = narration
        self.draft.ai_meta_data['last_action_status'] = f"Processed remove QID {q_id_to_remove} from Part {part}."
        print(f"DEBUG REMOVE: Result: {narration}")

    def _handle_clear_selected_questions(self, payload):
        part_to_clear = payload.get('part', 'All') # Default to All if not specified
        cleared_from = []

        if part_to_clear == 'A' or part_to_clear == 'All':
            if self.draft.part_a_question_ids:
                self.draft.part_a_question_ids = []
                cleared_from.append("Part A")
        
        if part_to_clear == 'B' or part_to_clear == 'All':
            if self.draft.part_b_question_ids:
                self.draft.part_b_question_ids = []
                cleared_from.append("Part B")
        
        if cleared_from:
            self._update_draft_current_marks() # Recalculate current marks
            self.draft.ai_meta_data['pending_ai_narration_data_simple_ack'] = f"Cleared all selected questions from: {', '.join(cleared_from)}."
            self.draft.ai_meta_data['last_action_status'] = f"Cleared questions from {', '.join(cleared_from)}."
        else:
            self.draft.ai_meta_data['pending_ai_narration_data_simple_ack'] = "No questions were selected to clear."
            self.draft.ai_meta_data['last_action_status'] = "No questions to clear."
        # No need to save draft here, process_faculty_request will do it.

    @staticmethod
    def get_or_create_draft(user, course_id=None, draft_id=None, is_new_ui_session=False):
        # Make sure this clearing is robust:
        draft_obj = None
        created = False
        keys_to_clear_on_load = [
            'pending_ai_narration_data_suggestions', 'pending_ai_narration_data_violation',
            'pending_ai_narration_data_coverage_summary', 'pending_ai_narration_data_question_details',
            'pending_ai_narration_data_swap_result', 'pending_ai_narration_data_tune_result',
            'pending_ai_narration_data_finalize_result', 'pending_ai_narration_data_simple_ack'
        ]
        
        if draft_id:
            try:
                draft_obj = PaperDraft.objects.get(id=draft_id, faculty=user)
                if not draft_obj.constraints: draft_obj.constraints = {'total_marks': 60, 'part_a_total_marks': 10, 'part_b_total_marks': 50}
            except PaperDraft.DoesNotExist: return None, False
        
        elif course_id:
            try:
                course = Course.objects.get(pk=course_id)
                initial_constraints = {'total_marks': 60, 'part_a_total_marks': 10, 'part_b_total_marks': 50, 'course_name': course.course_name, 'course_id': course.pk}

                # Check if we should reset an existing draft for this course/user combination
                if is_new_ui_session:
                    # Look for an existing draft to reset (in drafting state)
                    existing_draft = PaperDraft.objects.filter(
                        faculty=user, course=course, status='drafting'
                    ).first()
                    
                    if existing_draft:
                        # Reset to a fresh state as if it's a brand new draft
                        draft_obj = existing_draft
                        draft_obj.part_a_question_ids = []
                        draft_obj.part_b_question_ids = []
                        draft_obj.constraints = initial_constraints
                        draft_obj.conversation_history = []
                        draft_obj.ai_meta_data = {}
                        draft_obj.save()
                        created = False  # Not technically created, but fully reset
                    else:
                        # No existing draft, create a new one
                        draft_obj = PaperDraft.objects.create(
                            faculty=user, course=course, status='drafting',
                            constraints=initial_constraints, conversation_history=[], ai_meta_data={},
                            part_a_question_ids=[], part_b_question_ids=[]
                        )
                        created = True
                else:
                    # Standard behavior - get or create without resetting
                    draft_obj, created = PaperDraft.objects.get_or_create(
                        faculty=user, course=course, status='drafting', 
                        defaults={'constraints': initial_constraints, 'conversation_history': [], 'ai_meta_data': {}}
                    )
                    if not created and not draft_obj.constraints: draft_obj.constraints = initial_constraints
                    elif created: draft_obj.constraints = initial_constraints # Ensure it's set for new
            except Course.DoesNotExist: return None, False
        else:
            return None, False # Should not happen

        # Clear all pending narration data from ai_meta_data once draft_obj is obtained
        if draft_obj:
            metadata_changed_by_pop = False
            for key in keys_to_clear_on_load:
                if key in draft_obj.ai_meta_data: # Check if key exists before popping
                    draft_obj.ai_meta_data.pop(key)
                    metadata_changed_by_pop = True
            
            if created: # If newly created, ensure defaults and cleared meta_data are saved
                # The get_or_create already saved. If we modified constraints or meta_data after, save again.
                draft_obj.save() 
            elif metadata_changed_by_pop: # If an existing draft had its meta_data cleared
                draft_obj.save(update_fields=['ai_meta_data', 'constraints']) # Also save constraints if defaulted
        
        return draft_obj, created