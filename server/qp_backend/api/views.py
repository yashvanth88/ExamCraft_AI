from django.shortcuts import redirect
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import csrf_protect, csrf_exempt
from django.utils.decorators import method_decorator
from django.utils.timezone import now
from django.contrib.auth.models import update_last_login


from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.decorators import (
    api_view, 
    permission_classes, 
    parser_classes
)
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.authentication import TokenAuthentication

from django.middleware.csrf import get_token, rotate_token
from django.db.models import Q
from django.contrib.auth.hashers import make_password
from django.contrib.sessions.models import Session
from django.db import transaction
from django.urls import reverse
from django.http import JsonResponse, FileResponse, HttpResponse
from django.views import View
from django.shortcuts import get_object_or_404

from rest_framework.authtoken.models import Token
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.renderers import JSONRenderer, MultiPartRenderer

import json
import os
import logging
from datetime import datetime
from django.db.models import Count
from django.utils import timezone
from django.conf import settings
import zipfile
from io import BytesIO
import pyzipper
import tempfile
import subprocess

# Rate limiting setup
try:
    from django_ratelimit.decorators import ratelimit
except ImportError:
    # If django_ratelimit is not installed, create a dummy decorator
    def ratelimit(*args, **kwargs):
        def decorator(f):
            return f
        return decorator

from .models import *
from .serializers import *
from .parser import upload_questions
from .middleware import role_required, class_role_required
from .utils.paper_generator import QuestionPaperGenerator
from ai_generator.models import PaperDraft, PaperReviewAssignment

# Filter functions
def apply_question_filters(params):
    filters = Q()
    if 'unit_id' in params:
        filters &= Q(unit_id=params['unit_id'])
    if 'co' in params:
        filters &= Q(co=params['co'])
    if 'bt' in params:
        filters &= Q(bt=params['bt'])
    if 'marks' in params:
        filters &= Q(marks=params['marks'])
    return filters

def apply_department_filters(params):
    filters = Q()
    if 'name' in params:
        filters &= Q(name__icontains=params['name'])
    return filters

def apply_course_filters(params):
    filters = Q()
    if 'name' in params:
        filters &= Q(name__icontains=params['name'])
    if 'department' in params:
        filters &= Q(department=params['department'])
    return filters

def apply_unit_filters(params):
    filters = Q()
    if 'course_id' in params:
        filters &= Q(course_id=params['course_id'])
    if 'unit_name' in params:
        filters &= Q(unit_name__icontains=params['unit_name'])
    return filters

def generate_question_paper(questions, format='pdf'):
    # TODO: Implement the actual question paper generation logic
    # This is a placeholder implementation
    paper = {
        'questions': [
            {
                'id': q.id,
                'text': q.text,
                'marks': q.marks,
                'unit': q.unit_id.unit_name if q.unit_id else None
            } for q in questions
        ],
        'total_marks': sum(q.marks for q in questions),
        'format': format
    }
    return paper

class CustomPagination(PageNumberPagination):
    page_size = 10

# Admin Dashboard
@api_view(['GET'])
@permission_classes([IsAuthenticated])
@role_required(['admin'])
def admin_dashboard_view(request):
    try:
        # Get counts from database - removed questions count
        stats = {
            'departments': Department.objects.count(),
            'courses': Course.objects.count(),
            'faculty': Faculty.objects.count(),
            'reviewer' : Reviewer.objects.count()
        }

        # Get analytics data - removed questions_by_difficulty
        analytics = {
            'questions_by_course': Course.objects.annotate(
                question_count=Count('questions')
            ).values('course_name', 'question_count'),
            'papers_generated': PaperMetadata.objects.values('course_code').annotate(
                count=Count('id')
            ),
            'faculty_course_distribution': Faculty.objects.annotate(
                course_count=Count('facultycourse')
            ).values('name', 'course_count')
        }

        return Response({
            'stats': stats,
            'analytics': analytics
        })

    except Exception as e:
        print(f"Error in admin dashboard: {str(e)}")
        return Response({'error': str(e)}, status=500)


# Faculty Dashboard
class FacultyDashboardView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]

    def get(self, request):
        try:
            if not request.user.role == 'faculty':
                return Response(
                    {"error": "Access denied. This endpoint requires faculty role."}, 
                    status=status.HTTP_403_FORBIDDEN
                )

            try:
                faculty_profile = Faculty.objects.get(email=request.user.email)
                print(f"Found faculty profile: {faculty_profile.f_id}")
                
                # Debug: Print all courses in the system
                all_courses = Course.objects.all()
                print("\nAll courses in system:")
                for course in all_courses:
                    print(f"Course Code: {course.course_id}, Name: {course.course_name}")
                
                # Get faculty course mappings
                faculty_courses = FacultyCourse.objects.filter(faculty_id=faculty_profile.f_id)
                print(f"\nFound {faculty_courses.count()} faculty course mappings")
            except Faculty.DoesNotExist:
                print(f"Faculty profile not found for user {request.user.email}")
                return Response({
                    'faculty_id': None,
                    'name': f"{request.user.first_name} {request.user.last_name}".strip(),
                    'email': request.user.email,
                    'courses': []
                })
            
            courses_data = []
            for fc in faculty_courses:
                try:
                    course = Course.objects.get(course_id=fc.course_id_id)
                    print(f"\nProcessing course: Code={course.course_id}, Name={course.course_name}")
                    
                    units = Unit.objects.filter(course_id=course.course_id)
                    unit_names = [unit.unit_name for unit in units]
                    print(f"Found {len(unit_names)} units for course")
                    
                    courses_data.append({
                        'id': course.course_id,
                        'name': course.course_name,
                        'code': course.course_id,
                        'units': unit_names
                    })
                except Course.DoesNotExist:
                    print(f"Warning: Course with ID {fc.course_id_id} not found")
                    continue
                except Exception as e:
                    print(f"Error processing course: {str(e)}")
                    continue
            
            if not courses_data:
                print("No valid courses found for faculty")
                return Response({
                    'faculty_id': faculty_profile.f_id,
                    'name': faculty_profile.name,
                    'email': faculty_profile.email,
                    'courses': []
                })

            print(f"\nReturning {len(courses_data)} courses")
            return Response({
                'faculty_id': faculty_profile.f_id,
                'name': faculty_profile.name,
                'email': faculty_profile.email,
                'courses': courses_data
            })
        except Faculty.DoesNotExist:
            print(f"Faculty profile not found for user {request.user.username}")
            return Response({"error": "Faculty profile not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            print(f"Error in faculty dashboard: {str(e)}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# For login
@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    try:
        email = request.data.get('username')  # Form sends username but it's actually email
        password = request.data.get('password')

        if not email or not password:
            return Response({
                'error': 'Email and password are required'
            }, status=400)

        try:
            user = CustomUser.objects.get(email=email)
            # print("Hey" , user)
        except CustomUser.DoesNotExist:
            return Response({
                'error': 'Invalid credentials'
            }, status=401)

        if not user.check_password(password):
            return Response({
                'error': 'Invalid credentials'
            }, status=401)

        token, _ = Token.objects.get_or_create(user=user)
        
        # Get the correct name based on user role
        if user.role == 'faculty':
            try:
                faculty = Faculty.objects.get(email=user.email)
                name = faculty.name
            except Faculty.DoesNotExist:
                name = f"{user.first_name} {user.last_name}".strip()
        else:
            name = f"{user.first_name} {user.last_name}".strip()
        
        return Response({
            'token': token.key,
            'user': {
                'id': user.id,
                'email': user.email,
                'role': user.role,
                'name': name,
                'first_name': user.first_name,
                'last_name': user.last_name
            }
        })
    
    except Exception as e:
        print(f"Login error: {str(e)}")
        return Response({
            'error': 'Login failed'
        }, status=400)


# Logout View
class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            logout(request)
            return Response({"message": "Logout successful"}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": "Logout failed. Try again later."},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    

# Log out from all devices
class LogoutAllDevicesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            user_sessions = Session.objects.filter(expire_date__gte=now())
            for session in user_sessions:
                data = session.get_decoded()
                if data.get('_auth_user_id') == str(request.user.id):
                    session.delete()

            return Response({"message": "Logged out from all devices successfully"}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": "Could not logout from all devices."},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# Combine both user profile and this into one if they are the same. Retrieves faculty and related information
# as set by the Admin role or edited previously by the faculty itself.


class UserProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            user = request.user
            # print(user)
            role = user.role

            if role == 'faculty':
                try:
                    faculty = Faculty.objects.get(user=user)
                    name = faculty.name
                except Faculty.DoesNotExist:
                    name = f"{user.first_name} {user.last_name}".strip()

                data = {
                    'id': user.id,
                    'email': user.email,
                    'name': name,
                    'role': role,
                    'faculty_id': faculty.f_id,
                    'department': faculty.department_id.dept_name if faculty.department_id else None,
                    'courses': [{
                        'course_id': fc.course_id.course_id,
                        'course_name': fc.course_id.course_name,
                        'department': fc.course_id.department_id.dept_name if fc.course_id.department_id else None
                    } for fc in FacultyCourse.objects.filter(faculty_id=faculty)]
                }

            elif role == 'student':
                try:
                    student = Student.objects.get(user=user)
                    name = student.name
                except Student.DoesNotExist:
                    name = f"{user.first_name} {user.last_name}".strip()

                data = {
                    'id': user.id,
                    'email': user.email,
                    'name': name,
                    'role': role,
                    'student_id': student.s_id,
                    'usn': student.usn
                }

            elif role == 'reviewer':
                try:
                    reviewer = Reviewer.objects.get(user=user)
                    name = reviewer.name
                except Reviewer.DoesNotExist:
                    name = f"{user.first_name} {user.last_name}".strip()

                data = {
                    'id': user.id,
                    'email': user.email,
                    'name': name,
                    'role': role,
                    'reviewer_id': reviewer.r_id,
                }
            else:  # admin or unknown
                data = {
                    'id': user.id,
                    'email': user.email,
                    'name': f"{user.first_name} {user.last_name}".strip(),
                    'role': role
                }

            
            return Response(data)
        except Exception as e:
            print(f"Error fetching profile: {str(e)}")
            return Response({'error': str(e)}, status=400)

    def put(self, request):
        try:
            user = request.user
            data = request.data

            # Update basic user info
            if 'first_name' in data:
                user.first_name = data['first_name']
            if 'last_name' in data:
                user.last_name = data['last_name']
            if 'email' in data:
                user.email = data['email']
                user.username = data['email']

            user.save()

            # Faculty update
            if user.role == 'faculty':
                faculty = Faculty.objects.get(user=user)
                if 'name' in data:
                    faculty.name = data['name']
                if 'email' in data:
                    faculty.email = data['email']
                faculty.save()

                name = faculty.name

            # Student update
            elif user.role == 'student':
                student = Student.objects.get(user=user)
                if 'name' in data:
                    student.name = data['name']
                if 'email' in data:
                    student.email = data['email']
                if 'usn' in data:
                    student.usn = data['usn']
                student.save()

                name = student.name

            elif user.role == 'reviewer':
                reviewer = Reviewer.objects.get(user=user)
                if 'name' in data:
                    reviewer.name = data['name']
                if 'email' in data:
                    reviewer.email = data['email']
                reviewer.save()

                name = reviewer.name
            
            else:
                name = f"{user.first_name} {user.last_name}".strip()

            return Response({
                'message': 'Profile updated successfully',
                'user': {
                    'id': user.id,
                    'email': user.email,
                    'name': name,
                    'role': user.role
                }
            })
        except Exception as e:
            print(f"Error updating profile: {str(e)}")
            return Response({'error': str(e)}, status=400)



# Secure APIView with session authentication
class SecureAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(login_required)
    @method_decorator(csrf_protect)
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)


# Department CRUD View
@api_view(['GET', 'POST', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
@role_required(['admin'])
def department_view(request, dept_id=None):
    if request.method == 'DELETE':
        if not dept_id:
            return Response({'error': 'Department ID is required'}, status=400)
        
        try:
            department = Department.objects.get(dept_id=dept_id)
            department.delete()  # This will trigger the custom delete method
            return Response({'message': 'Department deleted successfully'})
        except Department.DoesNotExist:
            return Response({'error': 'Department not found'}, status=404)
        except Exception as e:
            print(f"Error deleting department: {str(e)}")
            return Response({'error': str(e)}, status=400)
    
    elif request.method == 'GET':
        try:
            if dept_id:
                department = Department.objects.get(dept_id=dept_id)
                courses = Course.objects.filter(department_id=department)
                courses_data = [{
                    'course_id': course.course_id,
                    'course_name': course.course_name
                } for course in courses]
                
                data = {
                    'dept_id': department.dept_id,
                    'dept_name': department.dept_name,
                    'course_count': department.get_course_count(),
                    'faculty_count': department.get_faculty_count(),
                    'courses': courses_data
                }
                return Response({'department': data})
            else:
                departments = Department.objects.all()
                data = []
                for dept in departments:
                    courses = Course.objects.filter(department_id=dept)
                    courses_data = [{
                        'course_id': course.course_id,
                        'course_name': course.course_name
                    } for course in courses]
                    
                    data.append({
                        'dept_id': dept.dept_id,
                        'dept_name': dept.dept_name,
                        'course_count': dept.get_course_count(),
                        'faculty_count': dept.get_faculty_count(),
                        'courses': courses_data
                    })
                return Response({'departments': data})
        except Department.DoesNotExist:
            return Response({'error': 'Department not found'}, status=404)
        except Exception as e:
            print(f"Error in department GET: {str(e)}")
            return Response({'error': str(e)}, status=400)

    elif request.method == 'POST':
        try:
            dept_name = request.data.get('dept_name')
            if not dept_name:
                return Response({'error': 'Department name is required'}, status=400)

            department = Department.objects.create(dept_name=dept_name)
            return Response({
                'message': 'Department created successfully',
                'department': {
                    'dept_id': department.dept_id,
                    'dept_name': department.dept_name
                }
            }, status=201)
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    elif request.method == 'PUT':
        try:
            data = request.data
            print(f"Received department update data: {data}")
            
            dept_id = data.get('dept_id')
            if not dept_id:
                return Response({'error': 'Department ID is required'}, status=400)
            
            department = Department.objects.get(dept_id=dept_id)
            
            # Update department name if provided
            if 'dept_name' in data:
                department.dept_name = data['dept_name']
            
            department.save()

            return Response({
                'message': 'Department updated successfully',
                'department': {
                    'dept_id': department.dept_id,
                    'dept_name': department.dept_name,
                    'course_count': department.get_course_count(),
                    'faculty_count': department.get_faculty_count()
                }
            })
        except Department.DoesNotExist:
            return Response({'error': 'Department not found'}, status=404)
        except Exception as e:
            print(f"Error updating department: {str(e)}")
            return Response({'error': str(e)}, status=400)

    return Response({'error': 'Method not allowed'}, status=405)


# Course CRUD View
@api_view(['GET', 'POST', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
@role_required(['admin','faculty'])
def course_view(request, course_id=None):
    if request.method == 'GET':
        try:
            if course_id:
                course = Course.objects.get(course_id=course_id)
                # Get counts
                unit_count = Unit.objects.filter(course_id=course).count()
                question_count = Question.objects.filter(unit_id__course_id=course).count()
                faculty_count = FacultyCourse.objects.filter(course_id=course).count()

                data = {
                    'course_id': course.course_id,
                    'course_name': course.course_name,
                    'department_id': course.department_id.dept_id if course.department_id else None,
                    'department_name': course.get_department_name(),
                    'unit_count': unit_count,
                    'question_count': question_count,
                    'faculty_count': faculty_count
                }
                return Response({'course': data})
            else:
                courses = Course.objects.all()
                data = []
                for course in courses:
                    unit_count = Unit.objects.filter(course_id=course).count()
                    question_count = Question.objects.filter(unit_id__course_id=course).count()
                    faculty_count = FacultyCourse.objects.filter(course_id=course).count()
                    
                    data.append({
                        'course_id': course.course_id,
                        'course_name': course.course_name,
                        'department_id': course.department_id.dept_id if course.department_id else None,
                        'department_name': course.get_department_name(),
                        'unit_count': unit_count,
                        'question_count': question_count,
                        'faculty_count': faculty_count
                    })
                return Response({'courses': data})
        except Course.DoesNotExist:
            return Response({'error': 'Course not found'}, status=404)
        except Exception as e:
            print(f"Error in course GET: {str(e)}")
            return Response({'error': str(e)}, status=400)

    elif request.method == 'POST':
        try:
            data = request.data
            print(f"Received course data: {data}")
            
            # Extract course_id from either course_id or course_code
            course_id = data.get('course_id') or data.get('course_code')
            course_name = data.get('course_name')
            department_id = data.get('department_id') or data.get('dept_id')
            
            print(f"Parsed values: course_id={course_id}, course_name={course_name}, department_id={department_id}")

            if not course_id or not course_name:
                print(f"Validation failed: course_id={bool(course_id)}, course_name={bool(course_name)}")
                return Response({'error': 'Course ID and name are required'}, status=400)

            department = None
            if department_id:
                try:
                    department = Department.objects.get(dept_id=department_id)
                    print(f"Found department: {department.dept_name}")
                except Department.DoesNotExist:
                    print(f"Department not found with ID: {department_id}")
                    return Response({'error': 'Department not found'}, status=404)

            # Create the course with the parsed values
            course = Course.objects.create(
                course_id=course_id,
                course_name=course_name,
                department_id=department
            )
            print(f"Successfully created course: {course.course_name}")

            return Response({
                'message': 'Course created successfully',
                'course': {
                    'course_id': course.course_id,
                    'course_name': course.course_name,
                    'department_id': course.department_id.dept_id if course.department_id else None,
                    'department_name': course.get_department_name()
                }
            })
        except Exception as e:
            print(f"Error creating course: {str(e)}")
            return Response({'error': str(e)}, status=400)

    elif request.method == 'PUT':
        try:
            data = request.data
            print(f"Received course update data: {data}")
            
            course_id = data.get('course_id')
            if not course_id:
                return Response({'error': 'Course ID is required'}, status=400)
            
            course = Course.objects.get(course_id=course_id)
            
            # Update course fields
            if 'course_name' in data:
                course.course_name = data['course_name']
            
            department_id = data.get('department_id') or data.get('dept_id')
            if department_id:
                try:
                    department = Department.objects.get(dept_id=department_id)
                    course.department_id = department
                except Department.DoesNotExist:
                    return Response({'error': 'Department not found'}, status=404)
            else:
                course.department_id = None
            
            course.save()
            print(f"Successfully updated course: {course.course_name}")
            
            return Response({
                'message': 'Course updated successfully',
                'course': {
                    'course_id': course.course_id,
                    'course_name': course.course_name,
                    'department_id': course.department_id.dept_id if course.department_id else None,
                    'department_name': course.get_department_name()
                }
            })
        except Course.DoesNotExist:
            return Response({'error': 'Course not found'}, status=404)
        except Exception as e:
            print(f"Error updating course: {str(e)}")
            return Response({'error': str(e)}, status=400)

    elif request.method == 'DELETE':
        try:
            if not course_id:
                return Response({'error': 'Course ID is required'}, status=400)

            course = Course.objects.get(course_id=course_id)
            course_name = course.course_name  # Store name before deletion for response
            course.delete()
            
            return Response({
                'message': f'Course {course_name} deleted successfully',
                'deleted_course': {
                    'course_id': course_id,
                    'course_name': course_name
                }
            })
        except Course.DoesNotExist:
            return Response({'error': 'Course not found'}, status=404)
        except Exception as e:
            print(f"Error deleting course: {str(e)}")
            return Response({'error': str(e)}, status=400)

    return Response({'error': 'Method not allowed'}, status=405)


# Faculty-Course Mapping View
@api_view(['GET', 'POST', 'DELETE'])
@permission_classes([IsAuthenticated])
@role_required(['admin'])
def faculty_course_mapping(request, faculty_id=None, course_id=None):
    if request.method == 'GET':
        try:
            if not faculty_id or not course_id:
                return Response({'error': 'Both faculty ID and course ID are required'}, status=400)

            faculty = Faculty.objects.get(f_id=faculty_id)
            course = Course.objects.get(course_id=course_id)

            # Check if mapping already exists
            if FacultyCourse.objects.filter(faculty_id=faculty, course_id=course).exists():
                return Response({'error': 'Faculty is already assigned to this course'}, status=400)

            # Create mapping
            FacultyCourse.objects.create(
                faculty_id=faculty,
                course_id=course
            )

            return Response({
                'message': 'Faculty assigned to course successfully',
                'mapping': {
                    'faculty_id': faculty_id,
                    'faculty_name': faculty.name,
                    'course_id': course_id,
                    'course_name': course.course_name
                }
            })
        except Faculty.DoesNotExist:
            return Response({'error': 'Faculty not found'}, status=404)
        except Course.DoesNotExist:
            return Response({'error': 'Course not found'}, status=404)
        except Exception as e:
            print(f"Error in faculty-course mapping: {str(e)}")
            return Response({'error': str(e)}, status=400)

    elif request.method == 'DELETE':
        try:
            if not faculty_id or not course_id:
                return Response({'error': 'Both faculty ID and course ID are required'}, status=400)

            mapping = FacultyCourse.objects.filter(
                faculty_id__f_id=faculty_id,
                course_id__course_id=course_id
            ).first()

            if not mapping:
                return Response({'error': 'Mapping not found'}, status=404)

            mapping.delete()
            return Response({'message': 'Faculty removed from course successfully'})
        except Exception as e:
            print(f"Error removing faculty-course mapping: {str(e)}")
            return Response({'error': str(e)}, status=400)

    return Response({'error': 'Method not allowed'}, status=405)


# Unit CRUD View
class UnitCRUDView(SecureAPIView):
    def get(self, request):
        units = Unit.objects.all().select_related('course')
        serializer = UnitSerializer(units, many=True)
        return Response({'units': serializer.data}, status=status.HTTP_200_OK)

    def post(self, request):
        course = get_object_or_404(Course, course_id=request.data.get('course_id'))
        serializer = UnitSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(course=course)
            return Response({'message': 'Unit created successfully'}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request):
        unit = get_object_or_404(Unit, id=request.data.get('id'))
        serializer = UnitSerializer(unit, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({'message': 'Unit updated successfully'}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request):
        unit = get_object_or_404(Unit, id=request.data.get('id'))
        unit.delete()
        return Response({'message': 'Unit deleted successfully'}, status=status.HTTP_204_NO_CONTENT)


# Admin Faculty Management
@method_decorator(login_required, name='dispatch')
@method_decorator(csrf_protect, name='dispatch')
class AddFacultyView(APIView):
    def post(self, request):
        data = request.data
        try:
            department = Department.objects.get(id=data['department_id'])
        except Department.DoesNotExist:
            return Response({"error": "Invalid department ID"}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.create_user(
            username=data['username'],
            password=data['password'],
            email=data.get('email', ''),
            role='faculty'
        )
        faculty = Faculty.objects.create(
            f_id=f"F{user.id:03d}",
            user=user,
            name=data.get('name', user.username),
            email=data.get('email', ''),
            password_hash=user.password,
            role='faculty',
            department_id=department
        )
        
        return Response({"message": f"Faculty {faculty.user.username} added successfully"}, status=status.HTTP_201_CREATED)


# Mapping Faculty to Courses
@method_decorator(login_required, name='dispatch')
@method_decorator(csrf_protect, name='dispatch')
class MapFacultyToCoursesView(APIView):
    def post(self, request):
        data = request.data
        faculty_id = data.get('faculty_id')
        course_ids = data.get('course_ids')

        try:
            faculty = Faculty.objects.get(id=faculty_id)
        except Faculty.DoesNotExist:
            return Response({"error": "Faculty not found"}, status=status.HTTP_404_NOT_FOUND)
        
        for course_id in course_ids:
            try:
                course = Course.objects.get(course_id=course_id)
                faculty.courses.add(course)
            except Course.DoesNotExist:
                return Response({"error": f"Course {course_id} not found"}, status=status.HTTP_404_NOT_FOUND)
        
        return Response({"message": "Faculty mapped to courses successfully"}, status=status.HTTP_200_OK)
    

# Add Unit (BOTH)
@method_decorator(login_required, name='dispatch')
@method_decorator(csrf_protect, name='dispatch')
class AddUnitView(APIView):
    def post(self, request):
        data = request.data
        try:
            course = Course.objects.get(course_id=data['course_id'])
        except Course.DoesNotExist:
            return Response({"error": "Course not found"}, status=status.HTTP_404_NOT_FOUND)

        unit = Unit.objects.create(**data)
        return Response({"message": f"Unit {unit.unit_name} added successfully"}, status=status.HTTP_201_CREATED)
    

# List all questions of all units of a selected course (FACULTY)
class QuestionListView(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(login_required)
    @method_decorator(csrf_protect)
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    def get(self, request):
        course_id = request.query_params.get('course_id')
        if not course_id:
            return Response({"error": "Course ID is required"}, status=status.HTTP_400_BAD_REQUEST)

        questions = Question.objects.filter(course_id=course_id).prefetch_related('media').select_related('unit_id')

        pagination_class = CustomPagination

        serializer = QuestionSerializer(questions, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


# Add questions manually (FACULTY)
class AddQuestionView(APIView):
    permission_classes = [IsAuthenticated]  # Require authentication

    def post(self, request):
        data = request.data
        media_data = data.pop('media', [])  # Extract media data from the request

        serializer = QuestionSerializer(data=data)
        if serializer.is_valid():
            question = serializer.save()
            media_objects = [
                QuestionMedia(question_id=question, **media) for media in media_data
            ]
            QuestionMedia.objects.bulk_create(media_objects)
            return Response({"message": "Question and media added successfully"}, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    

# Uploading questions from file (FACULTY)
class FileUploadView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]
    parser_classes = [MultiPartParser, FormParser]
    renderer_classes = [JSONRenderer]

    def post(self, request):
        try:
            faculty_profile = request.user.faculty_profile
            course_id = request.data.get('course_id')
            
            # Check if faculty is associated with the course
            if not FacultyCourse.objects.filter(faculty_id=faculty_profile, course_id=course_id).exists():
                print(f"Access denied: Faculty {faculty_profile.f_id} does not have access to course {course_id}")
                return Response({"error": "You do not have permission to upload questions for this course"}, 
                             status=status.HTTP_403_FORBIDDEN)
            
            file = request.FILES.get('file')
            if not file:
                return Response({"error": "No file was uploaded"}, status=status.HTTP_400_BAD_REQUEST)
            
            # Validate file extension
            if not file.name.endswith(('.doc', '.docx')):
                return Response({"error": "Invalid file format. Please upload a .doc or .docx file"}, 
                             status=status.HTTP_400_BAD_REQUEST)

            # Create temp directory if it doesn't exist
            os.makedirs("temp", exist_ok=True)
            os.makedirs("images", exist_ok=True)
            
            # Save the file temporarily
            file_path = f"temp/{file.name}"
            with open(file_path, "wb") as f:
                for chunk in file.chunks():
                    f.write(chunk)

            try:
                # Process the file using the parser
                questions = upload_questions(file_path, course_id)
                if not questions:
                    return Response({"error": "No questions found in the document"}, status=status.HTTP_400_BAD_REQUEST)
                
                return Response({
                    "message": f"Successfully uploaded {len(questions)} questions",
                    "questions": [{
                        "id": q.q_id,
                        "text": q.text,
                        "marks": q.marks,
                        "co": q.co,
                        "bt": q.bt,
                        "unit": q.unit_id.unit_id
                    } for q in questions]
                }, status=status.HTTP_201_CREATED)
            
            finally:
                # Clean up - remove temporary file
                if os.path.exists(file_path):
                    os.remove(file_path)
            
        except Faculty.DoesNotExist:
            return Response({"error": "Faculty profile not found"}, status=status.HTTP_404_NOT_FOUND)
        except Course.DoesNotExist:
            return Response({"error": "Course not found"}, status=status.HTTP_404_NOT_FOUND)
        except Unit.DoesNotExist:
            return Response({"error": "Unit not found for the given course"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logging.error(f"Error processing file: {str(e)}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Based on the filters(appropriate attributes of Question entity like CO, BT, unit_id specified in the indexes)
# return the questions of the selected course (FACULTY)
@method_decorator(login_required, name='dispatch')
@method_decorator(csrf_protect, name='dispatch')
class FetchQuestionsView(APIView):
    def get(self, request):
        filters = apply_question_filters(request.query_params)
        questions = Question.objects.filter(filters).prefetch_related('media')  # Prefetch media
        response_data = []

        for question in questions:
            media = QuestionMedia.objects.filter(question_id=question)
            question_data = {
                "id": question.id,
                "text": question.text,
                "marks": question.marks,
                "media": [{"type": m.type, "url": m.url} for m in media],
            }
            response_data.append(question_data)
        
        return Response(response_data, status=status.HTTP_200_OK)
    

# Listing departments, courses, units based on filters or none (ADMIN)
@method_decorator(login_required, name='dispatch')
@method_decorator(csrf_protect, name='dispatch')
class ListEntitiesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, entity_type):
        """Dynamically retrieve departments, courses, or units."""
        entity_map = {
            'departments': Department,
            'courses': Course,
            'units': Unit,
        }
        model = entity_map.get(entity_type)

        if not model:
            return Response({"error": "Invalid entity type"}, status=status.HTTP_400_BAD_REQUEST)

        filters = {
            'departments': apply_department_filters,
            'courses': apply_course_filters,
            'units': apply_unit_filters,
        }.get(entity_type)(request.query_params)

        entities = model.objects.filter(filters)
        serializer = {
            'departments': DepartmentSerializer,
            'courses': CourseSerializer,
            'units': UnitSerializer,
        }.get(entity_type)(entities, many=True)

        return Response(serializer.data, status=status.HTTP_200_OK)


# Question Paper Generation
import os
from datetime import datetime
from io import BytesIO
from docx2pdf import convert
from django.http import FileResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

class GenerateQuestionPaperView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

            # Metadata
            class SimpleMetadata:
                def __init__(self, data, faculty):
                    self.course_code = data.get('course_code')
                    self.course_title = data.get('course_title')
                    self.date = datetime.strptime(data.get('date'), '%Y-%m-%d')
                    self.max_marks = data.get('max_marks')
                    self.duration = data.get('duration')
                    self.semester = data.get('semester')
                    self.faculty = faculty
                    self.is_improvement_cie = data.get('is_improvement_cie', False)

            metadata = SimpleMetadata(request.data, request.user.faculty_profile)

            # Questions
            class SimpleQuestionSelection:
                def __init__(self, question, part):
                    self.question = question
                    self.part = part

            selected_questions = []
            for q_id in request.data['selected_questions']['part_a']:
                question = Question.objects.get(q_id=q_id)
                selected_questions.append(SimpleQuestionSelection(question, 'A'))
            for q_id in request.data['selected_questions']['part_b']:
                question = Question.objects.get(q_id=q_id)
                selected_questions.append(SimpleQuestionSelection(question, 'B'))

            question_ids = [q.question.q_id for q in selected_questions]
            questions_data = Question.objects.filter(q_id__in=question_ids).prefetch_related('media')

            # Generate docx in memory
            docx_buffer = BytesIO()
            doc = QuestionPaperGenerator.create_paper(metadata, selected_questions, questions_data)
            doc.save(docx_buffer)
            docx_buffer.seek(0)

            # Generate base filename ONCE
            base_timestamp = int(datetime.now().timestamp() * 1000)
            base_filename = f"{metadata.course_code}_{base_timestamp}_question_paper"
            pdf_filename = f"{base_filename}.pdf"
            pdf_media_path = os.path.join('media', 'papers', pdf_filename)

            # Save docx to a temp file
            temp_dir = '/tmp'
            docx_path = os.path.join(temp_dir, f'{base_filename}.docx')
            pdf_path = os.path.join(temp_dir, f'{base_filename}.pdf')

            with open(docx_path, 'wb') as f:
                f.write(docx_buffer.getvalue())

            # Convert docx to PDF using docx2pdf
            convert(docx_path, pdf_path)

            # Read the generated PDF
            with open(pdf_path, 'rb') as f:
                pdf_data = f.read()

            # Save PDF to media/papers with the same base name
            os.makedirs(os.path.dirname(pdf_media_path), exist_ok=True)
            with open(pdf_media_path, 'wb') as f:
                f.write(pdf_data)

            # Also save PDF to media/annotated_papers with the same filename
            annotated_dir = os.path.join('media', 'annotated_papers')
            os.makedirs(annotated_dir, exist_ok=True)
            annotated_pdf_path = os.path.join(annotated_dir, pdf_filename)
            with open(annotated_pdf_path, 'wb') as f:
                f.write(pdf_data)

            # Cleanup temp files
            os.remove(docx_path)
            os.remove(pdf_path)

            # Store the PDF path in the database (if needed, e.g. in PaperDraft or response)
            # Return JSON with relative path for download (PDF only), and the base timestamp for draft creation
            return Response({
                'success': True,
                'download_path': pdf_media_path,  # e.g. media/papers/CS124_1751810069300_question_paper.pdf
                'filename': pdf_filename,
                'base_timestamp': base_timestamp,
                'base_filename': base_filename
            }, status=200)

        except Exception as e:
            return Response({"error": str(e)}, status=500)


class GenerateAnswerSchemeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            # Create a simple metadata object without saving to database
            class SimpleMetadata:
                def __init__(self, data, faculty):
                    self.course_code = data.get('course_code')
                    self.course_title = data.get('course_title')
                    self.date = datetime.strptime(data.get('date'), '%Y-%m-%d')
                    self.max_marks = data.get('max_marks')
                    self.duration = data.get('duration')
                    self.semester = data.get('semester')
                    self.faculty = faculty
                    self.is_improvement_cie = data.get('is_improvement_cie', False)

            metadata = SimpleMetadata(request.data, request.user.faculty_profile)

            class SimpleQuestionSelection:
                def __init__(self, question, part):
                    self.question = question
                    self.part = part

            selected_questions = []
            part_a_questions = request.data['selected_questions']['part_a']
            part_b_questions = request.data['selected_questions']['part_b']

            for q_id in part_a_questions:
                question = Question.objects.get(q_id=q_id)
                selected_questions.append(SimpleQuestionSelection(question, 'A'))
            for q_id in part_b_questions:
                question = Question.objects.get(q_id=q_id)
                selected_questions.append(SimpleQuestionSelection(question, 'B'))

            answer_buffer = BytesIO()
            answer_doc = QuestionPaperGenerator.create_answer_scheme(metadata, selected_questions)
            answer_doc.save(answer_buffer)
            answer_buffer.seek(0)
            response = FileResponse(answer_buffer, content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
            response['Content-Disposition'] = f'attachment; filename="answer_scheme_{timestamp}.docx"'
            return response
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# Enhance Scalability and Session Management
class SessionManagementMixin:
    @staticmethod
    def clear_inactive_sessions():
        from django.contrib.sessions.models import Session
        from datetime import datetime

        sessions = Session.objects.all()
        for session in sessions:
            if session.expire_date < datetime.now():
                session.delete()

class UserListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        try:
            users = CustomUser.objects.all().select_related('faculty')
            user_data = []
            
            for user in users:
                data = {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'role': user.role,
                    'is_active': user.is_active,
                    'last_login': user.last_login,
                    'date_joined': user.date_joined,
                }
                
                # Add faculty-specific info if the user is a faculty member
                if user.role == 'faculty' and hasattr(user, 'faculty'):
                    faculty = user.faculty
                    data.update({
                        'department': faculty.department.name if faculty.department else None,
                        'courses': [
                            {
                                'id': course.course_id,
                                'name': course.name
                            } for course in faculty.courses.all()
                        ]
                    })
                
                user_data.append(data)
            
            return Response(user_data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {"error": "Failed to fetch users", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class FilterQuestionsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, course_id):
        try:

            unit_numbers = request.data.get('unit_numbers', [])
            cos = request.data.get('cos', [])
            bts = request.data.get('bts', [])
            marks = request.data.get('marks', [])

            # Base query with course_id filter
            query = Q(course_id_id=course_id)

            # Add other filters only if they are provided
            if unit_numbers:
                query &= Q(unit_id__unit_id__in=unit_numbers)
            if cos:
                query &= Q(co__in=cos)
            if bts:
                query &= Q(bt__in=bts)
            if marks:
                query &= Q(marks__in=marks)

            questions = Question.objects.filter(query).select_related('unit_id').prefetch_related('media')

            response_data = []
            for question in questions:
                media = question.media.first()
                question_data = {
                    "id": question.q_id,
                    "text": question.text,
                    "marks": question.marks,
                    "co": question.co,
                    "bt": question.bt,
                    "unit_id": question.unit_id.unit_id if question.unit_id else None,
                    "unit_name": question.unit_id.unit_name if question.unit_id else None,
                    "image_paths": media.image_paths if media else [],
                    "equations": media.equations if media else []
                }
                response_data.append(question_data)

            return Response({"questions": response_data})
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET', 'POST', 'DELETE'])
@permission_classes([IsAuthenticated])
@role_required(['admin', 'faculty'])  # Allow both admin and faculty access
def faculty_course_view(request):
    if request.method == 'GET':
        try:
            # If admin, get all mappings
            if request.user.role == 'admin':
                mappings = FacultyCourse.objects.select_related(
                    'faculty_id', 
                    'course_id'
                ).all()
                data = [{
                    'faculty_id': m.faculty_id.f_id,
                    'faculty_name': m.faculty_id.name,
                    'course_id': m.course_id.course_id,
                    'course_name': m.course_id.course_name,
                    'department_name': m.course_id.get_department_name()
                } for m in mappings]
                return Response({'mappings': data})
            
            # If faculty, get only their mappings
            try:
                faculty = Faculty.objects.get(email=request.user.email)
                mappings = FacultyCourse.objects.select_related('course_id').filter(faculty_id=faculty)
                data = [{
                    'course_id': m.course_id.course_id,
                    'course_name': m.course_id.course_name,
                    'department_name': m.course_id.get_department_name()
                } for m in mappings]
                return Response({'mappings': data})
            except Faculty.DoesNotExist:
                return Response({'mappings': [], 'message': 'No faculty profile found'})

        except Faculty.DoesNotExist:
            return Response({'error': 'Faculty profile not found'}, status=404)
        except Exception as e:
            print(f"Error in faculty course GET: {str(e)}")
            return Response({'error': str(e)}, status=400)

    elif request.method == 'POST':
        if request.user.role != 'admin':
            return Response({'error': 'Only admins can create mappings'}, status=403)
            
        try:
            faculty_id = request.data.get('faculty_id')
            course_id = request.data.get('course_id')

            if not faculty_id or not course_id:
                return Response({'error': 'Both faculty_id and course_id are required'}, status=400)

            faculty = Faculty.objects.get(f_id=faculty_id)
            course = Course.objects.get(course_id=course_id)

            # Check if mapping already exists
            if FacultyCourse.objects.filter(faculty_id=faculty, course_id=course).exists():
                return Response({'error': 'This faculty-course mapping already exists'}, status=400)

            mapping = FacultyCourse.objects.create(faculty_id=faculty, course_id=course)
            return Response({
                'message': 'Faculty-course mapping created successfully',
                'mapping': {
                    'faculty_id': faculty.f_id,
                    'faculty_name': faculty.name,
                    'course_id': course.course_id,
                    'course_name': course.course_name
                }
            }, status=201)
        except Faculty.DoesNotExist:
            return Response({'error': 'Faculty not found'}, status=404)
        except Course.DoesNotExist:
            return Response({'error': 'Course not found'}, status=404)
        except Exception as e:
            print(f"Error in faculty course POST: {str(e)}")
            return Response({'error': str(e)}, status=400)

    elif request.method == 'DELETE':
        if request.user.role != 'admin':
            return Response({'error': 'Only admins can delete mappings'}, status=403)
            
        try:
            faculty_id = request.data.get('faculty_id')
            course_id = request.data.get('course_id')

            if not faculty_id or not course_id:
                return Response({'error': 'Both faculty_id and course_id are required'}, status=400)

            mapping = FacultyCourse.objects.filter(
                faculty_id__f_id=faculty_id,
                course_id__course_id=course_id
            ).first()

            if not mapping:
                return Response({'error': 'Mapping not found'}, status=404)

            mapping.delete()
            return Response({'message': 'Faculty-course mapping deleted successfully'})
        except Exception as e:
            print(f"Error in faculty course DELETE: {str(e)}")
            return Response({'error': str(e)}, status=400)

    return Response({'error': 'Method not allowed'}, status=405)

@api_view(['GET', 'POST', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
@role_required(['admin'])
def faculty_view(request, f_id=None):
    if request.method == 'GET':
        try:
            # Get faculty ID from either URL parameter or query parameter
            faculty_id = f_id or request.GET.get('f_id')
            
            if faculty_id:
                faculty = Faculty.objects.get(f_id=faculty_id)
                # Get faculty's courses with their departments
                faculty_courses = FacultyCourse.objects.filter(faculty_id=faculty).select_related(
                    'course_id', 
                    'course_id__department_id'
                )
                
                # Get all unique departments from courses
                departments = set()
                courses_data = []
                
                for fc in faculty_courses:
                    course = fc.course_id
                    if course.department_id:
                        departments.add(course.department_id)
                    
                    courses_data.append({
                        'course_id': course.course_id,
                        'course_name': course.course_name,
                        'department_id': course.department_id.dept_id if course.department_id else None,
                        'department_name': course.department_id.dept_name if course.department_id else "Not Assigned"
                    })

                # Convert departments set to list for serialization
                departments_data = [{
                    'dept_id': dept.dept_id,
                    'dept_name': dept.dept_name
                } for dept in departments]

                data = {
                    'f_id': faculty.f_id,
                    'name': faculty.name,
                    'email': faculty.email,
                    'departments': departments_data,
                    'courses': courses_data,
                    'course_count': len(courses_data)
                }
                return Response({'faculty': data})
            else:
                faculty_list = Faculty.objects.all()
                data = []
                for faculty in faculty_list:
                    faculty_courses = FacultyCourse.objects.filter(faculty_id=faculty).select_related(
                        'course_id', 
                        'course_id__department_id'
                    )
                    
                    # Get all unique departments from courses
                    departments = set()
                    courses_data = []
                    
                    for fc in faculty_courses:
                        course = fc.course_id
                        if course.department_id:
                            departments.add(course.department_id)
                        
                        courses_data.append({
                            'course_id': course.course_id,
                            'course_name': course.course_name,
                            'department_id': course.department_id.dept_id if course.department_id else None,
                            'department_name': course.department_id.dept_name if course.department_id else "Not Assigned"
                        })

                    # Convert departments set to list for serialization
                    departments_data = [{
                        'dept_id': dept.dept_id,
                        'dept_name': dept.dept_name
                    } for dept in departments]

                    data.append({
                        'f_id': faculty.f_id,
                        'name': faculty.name,
                        'email': faculty.email,
                        'departments': departments_data,
                        'courses': courses_data,
                        'course_count': len(courses_data)
                    })
                return Response({'faculty': data})
        except Faculty.DoesNotExist:
            return Response({'error': 'Faculty not found'}, status=404)
        except Exception as e:
            print(f"Error in faculty GET: {str(e)}")
            return Response({'error': str(e)}, status=400)

    elif request.method == 'POST':
        try:
            data = request.data
            
            # Generate f_id as an integer
            latest_faculty = Faculty.objects.order_by('-f_id').first()
            try:
                last_id = int(latest_faculty.f_id) if latest_faculty else 0
                new_id = last_id + 1
            except ValueError:
                new_id = 1
            
            f_id = str(new_id)
            
            # Check if user exists
            try:
                user = CustomUser.objects.get(email=data['email'])
                if Faculty.objects.filter(email=data['email']).exists():
                    return Response({'error': 'Faculty profile already exists'}, status=400)
            except CustomUser.DoesNotExist:
                # Create new user if doesn't exist
                password = request.data.get('password')
                if not password:
                    return Response({'error': 'Password is required for new users'}, status=400)

                # Split the faculty name into first_name and last_name
                full_name = data.get('name', '').strip()
                name_parts = full_name.split(' ', 1)
                first_name = name_parts[0]
                last_name = name_parts[1] if len(name_parts) > 1 else ''

                user = CustomUser.objects.create(
                    username=data['email'],
                    email=data['email'],
                    first_name=first_name,
                    last_name=last_name,
                    role='faculty'
                )
                user.set_password(password)
                user.save()

            # Get department if dept_id is provided
            department = None
            if data.get('dept_id'):
                try:
                    department = Department.objects.get(dept_id=data['dept_id'])
                except Department.DoesNotExist:
                    user.delete()  # Clean up user if department not found
                    return Response({'error': 'Department not found'}, status=404)

            # Create faculty profile
            faculty = Faculty.objects.create(
                f_id=f_id,
                name=data.get('name', f'{user.first_name} {user.last_name}').strip(),
                email=data['email'],
                department_id=department,
                user=user
            )

            return Response({
                'message': 'Faculty created successfully',
                'faculty': {
                    'f_id': faculty.f_id,
                    'name': faculty.name,
                    'email': faculty.email,
                    'department_id': faculty.department_id.dept_id if faculty.department_id else None,
                    'department_name': faculty.get_department_name()
                }
            })

        except Exception as e:
            print(f"Error creating faculty: {str(e)}")
            # Clean up user if it was created
            if 'user' in locals():
                user.delete()
            return Response({'error': str(e)}, status=400)

    elif request.method == 'PUT':
        try:
            data = request.data
            faculty_id = data.get('faculty_id')
            if not faculty_id:
                return Response({'error': 'Faculty ID is required'}, status=400)

            faculty = Faculty.objects.get(f_id=faculty_id)
            
            # Update faculty fields
            if 'name' in data:
                faculty.name = data['name']
            if 'email' in data:
                faculty.email = data['email']
            if 'dept_id' in data:
                try:
                    department = Department.objects.get(dept_id=data['dept_id']) if data['dept_id'] else None
                    faculty.department_id = department
                except Department.DoesNotExist:
                    return Response({'error': 'Department not found'}, status=404)
            
            if 'password' in data and data['password']:
                try:
                    user = CustomUser.objects.get(email=faculty.email)
                    user.set_password(data['password'])
                    user.save()
                except CustomUser.DoesNotExist:
                    return Response({'error': 'User account not found'}, status=404)

            faculty.save()

            return Response({
                'message': 'Faculty updated successfully',
                'faculty': {
                    'f_id': faculty.f_id,
                    'name': faculty.name,
                    'email': faculty.email,
                    'department_id': faculty.department_id.dept_id if faculty.department_id else None,
                    'department_name': faculty.get_department_name()
                }
            })

        except Faculty.DoesNotExist:
            return Response({'error': 'Faculty not found'}, status=404)
        except Exception as e:
            print(f"Error updating faculty: {str(e)}")
            return Response({'error': str(e)}, status=400)

    elif request.method == 'DELETE':
        try:
            if not f_id:
                return Response({'error': 'Faculty ID is required'}, status=400)

            faculty = Faculty.objects.get(f_id=f_id)
            
            # Get the associated user account
            try:
                user = CustomUser.objects.get(email=faculty.email)
            except CustomUser.DoesNotExist:
                user = None

            # Store faculty info for response
            faculty_info = {
                'f_id': faculty.f_id,
                'name': faculty.name,
                'email': faculty.email
            }

            # Delete faculty (this will cascade delete faculty-course mappings)
            faculty.delete()

            # Delete associated user account if it exists
            if user:
                user.delete()

            return Response({
                'message': f'Faculty {faculty_info["name"]} deleted successfully',
                'deleted_faculty': faculty_info
            })

        except Faculty.DoesNotExist:
            return Response({'error': 'Faculty not found'}, status=404)
        except Exception as e:
            print(f"Error deleting faculty: {str(e)}")
            return Response({'error': str(e)}, status=400)

    return Response({'error': 'Method not allowed'}, status=405)

@api_view(['GET', 'POST', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
@role_required(['admin', 'faculty'])
def question_view(request, q_id=None):
    if request.method == 'GET':
        if q_id:
            try:
                question = Question.objects.get(q_id=q_id)
                response_data = {
                    'q_id': question.q_id,
                    'text': question.text,
                    'unit_id': str(question.unit_id.unit_id) if question.unit_id else None,
                    'co': question.co,
                    'bt': question.bt,
                    'marks': question.marks,
                    'difficulty_level': question.difficulty_level,
                    'type': question.type
                }
                return Response({'question': response_data})
            except Question.DoesNotExist:
                return Response({'error': 'Question not found'}, status=404)
            except Exception as e:
                return Response({'error': str(e)}, status=500)
        else:
            try:
                questions = Question.objects.all()
                questions_data = []
                
                for q in questions:
                    question_data = {
                        'q_id': q.q_id,
                        'text': q.text,
                        'unit_id': str(q.unit_id.unit_id) if q.unit_id else None,
                        'co': q.co,
                        'bt': q.bt,
                        'marks': q.marks,
                        'difficulty_level': q.difficulty_level,
                        'type': q.type
                    }
                    questions_data.append(question_data)
                
                return Response({'questions': questions_data})
            except Exception as e:
                return Response({'error': str(e)}, status=500)

    elif request.method == 'PUT':
        if not q_id:
            return Response({'error': 'Question ID is required'}, status=400)
        
        try:
            question = Question.objects.select_related('course_id').get(q_id=q_id)
            data = request.data
            
            # Update fields if they exist in the request data
            if 'text' in data:
                question.text = data['text']
            if 'unit_id' in data:
                try:
                    # Get or create the Unit instance
                    unit_id = int(data['unit_id'])
                    unit, created = Unit.objects.get_or_create(
                        unit_id=unit_id,
                        course_id=question.course_id,
                        defaults={'unit_name': f'Unit {unit_id}'}
                    )
                    question.unit_id = unit
                except (ValueError, TypeError):
                    return Response({
                        'error': 'Invalid unit_id format'
                    }, status=400)
                except Unit.DoesNotExist:
                    return Response({
                        'error': f'Unit with ID {data["unit_id"]} not found'
                    }, status=400)
            if 'co' in data:
                question.co = data['co']
            if 'bt' in data:
                question.bt = data['bt']
            if 'marks' in data:
                question.marks = data['marks']
            if 'difficulty_level' in data:
                question.difficulty_level = data['difficulty_level']
            if 'type' in data:
                question.type = data['type']
            
            question.save()
            return Response({'message': 'Question updated successfully'})
        except Question.DoesNotExist:
            return Response({'error': 'Question not found'}, status=404)
        except Exception as e:
            return Response({'error': str(e)}, status=500)

    elif request.method == 'DELETE':
        if not q_id:
            return Response({'error': 'Question ID is required'}, status=400)
        
        try:
            question = Question.objects.get(q_id=q_id)
            question.delete()
            return Response({'message': 'Question deleted successfully'})
        except Question.DoesNotExist:
            return Response({'error': 'Question not found'}, status=404)
        except Exception as e:
            return Response({'error': str(e)}, status=500)

    return Response({'error': 'Method not allowed'}, status=405)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
@role_required(['admin'])
def question_stats(request):
    try:
        questions = Question.objects.all()
        data = {
            'total_count': questions.count(),
            'by_course': Question.objects.values('course_id__course_name').annotate(
                count=Count('q_id')
            ),
            'by_difficulty': Question.objects.values('difficulty_level').annotate(
                count=Count('q_id')
            ),
            'by_marks': Question.objects.values('marks').annotate(
                count=Count('q_id')
            )
        }
        return Response(data)
    except Exception as e:
        print(f"Error in question stats: {str(e)}")
        return Response({'error': str(e)}, status=400)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
@role_required(['admin', 'faculty'])
def course_questions_view(request, course_id):
    try:
        # Verify course exists
        course = Course.objects.get(course_id=course_id)

        # Get all questions for this course
        questions = Question.objects.select_related(
            'course_id',
            'unit_id'
        ).filter(course_id=course)

        # Format the response data
        data = [{
            'q_id': q.q_id,
            'text': q.text,
            'course_id': q.course_id.course_id,
            'course_name': q.course_id.course_name,
            'unit_id': q.unit_id.unit_id,
            'unit_name': q.unit_id.unit_name,
            'co': q.co,
            'bt': q.bt,
            'marks': q.marks,
            'difficulty_level': q.difficulty_level,
            'type': q.type,
            'has_image': bool(q.image)
        } for q in questions]

        # Get additional course info
        course_info = {
            'course_id': course.course_id,
            'course_name': course.course_name,
            'unit_count': course.get_unit_count(),
            'question_count': len(data)
        }

        return Response({
            'course': course_info,
            'questions': data
        })

    except Course.DoesNotExist:
        return Response({'error': 'Course not found'}, status=404)
    except Exception as e:
        print(f"Error fetching course questions: {str(e)}")
        return Response({'error': str(e)}, status=400)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_answer_scheme(request, paper_id):
    answer_schemes = AnswerScheme.objects.filter(paper_id=paper_id)
    serializer = AnswerSchemeSerializer(answer_schemes, many=True)
    return Response(serializer.data)

@api_view(['POST'])
@permission_classes([AllowAny])
def register_student(request):
    try:
        data = request.data
        # print(data)
        # Generate s_id
        latest_student = Student.objects.order_by('-s_id').first()
        try:
            last_id = int(latest_student.s_id) if latest_student else 0
            new_id = last_id + 1
        except ValueError:
            new_id = 1

        s_id = str(new_id)

        # Check if user exists
        try:
            user = CustomUser.objects.get(email=data['email'])
            if Student.objects.filter(email=data['email']).exists():
                return Response({'error': 'Student profile already exists'}, status=400)
        except CustomUser.DoesNotExist:
            # Create user
            password = data.get('password')
            if not password:
                return Response({'error': 'Password is required'}, status=400)

            full_name = data.get('name', '').strip()
            name_parts = full_name.split(' ', 1)
            first_name = name_parts[0]
            last_name = name_parts[1] if len(name_parts) > 1 else ''

            user = CustomUser.objects.create(
                username=data['email'],
                email=data['email'],
                first_name=first_name,
                last_name=last_name,
                role='student'
            )
            user.set_password(password)
            user.save()

        # Create student profile
        student = Student.objects.create(
            s_id=s_id,
            name=data.get('name', f"{user.first_name} {user.last_name}").strip(),
            email=data['email'],
            usn=data.get('usn', ''),
            user=user
        )

        return Response({
            'message': 'Student registered successfully',
            'student': {
                's_id': student.s_id,
                'name': student.name,
                'email': student.email,
                'usn': student.usn
            }
        })
    except Exception as e:
        print(f"Error in student registration: {str(e)}")
        return Response({'error': str(e)}, status=500)


@api_view(['POST'])
@permission_classes([AllowAny])
def register_reviewer(request):
    try:
        data = request.data
        # print(data)
        # Generate r_id
        latest_reviewer = Reviewer.objects.order_by('-r_id').first()
        try:
            last_id = int(latest_reviewer.r_id) if latest_reviewer else 0
            new_id = last_id + 1
        except ValueError:
            new_id = 1

        r_id = str(new_id)

        # Check if user exists
        try:
            user = CustomUser.objects.get(email=data['email'])
            if Reviewer.objects.filter(email=data['email']).exists():
                return Response({'error': 'Reviewer profile already exists'}, status=400)
        except CustomUser.DoesNotExist:
            # Create user
            password = data.get('password')
            if not password:
                return Response({'error': 'Password is required'}, status=400)

            full_name = data.get('name', '').strip()
            name_parts = full_name.split(' ', 1)
            first_name = name_parts[0]
            last_name = name_parts[1] if len(name_parts) > 1 else ''

            user = CustomUser.objects.create(
                username=data['email'],
                email=data['email'],
                first_name=first_name,
                last_name=last_name,
                role='reviewer'
            )
            user.set_password(password)
            user.save()

        # Create student profile
        reviewer = Reviewer.objects.create(
            r_id=r_id,
            name=data.get('name', f"{user.first_name} {user.last_name}").strip(),
            email=data['email'],
            user=user
        )

        return Response({
            'message': 'Reviewer registered successfully',
            'reviewer': {
                'r_id': reviewer.r_id,
                'name': reviewer.name,
                'email': reviewer.email,
            }
        })
    except Exception as e:
        print(f"Error in reviewer registration: {str(e)}")
        return Response({'error': str(e)}, status=500)


# Faculty Dashboard
class ReviewerDashboardView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]
    def get(self, request):
        return Response({'message': 'Reviewer dashboard'})
    
@api_view(['GET', 'POST', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
@role_required(['admin', 'faculty'])
def reviewer_view(request, r_id=None):
    if request.method == 'GET':
        try:
            # Get reviewer ID from either URL parameter or query parameter
            reviewer_id = r_id or request.GET.get('r_id')
            
            if reviewer_id:
                reviewer = Reviewer.objects.get(r_id=reviewer_id)

                data = {
                    'r_id': reviewer.r_id,
                    'name': reviewer.name,
                    'email': reviewer.email,
                }
                return Response({'reviewer': data})
            else:
                reviewer_list = Reviewer.objects.all()
                data = []

                for reviewer in reviewer_list:
                    data.append({
                        'r_id': reviewer.r_id,
                        'name': reviewer.name,
                        'email': reviewer.email,
                    })

                return Response({'reviewer': data})
        except Reviewer.DoesNotExist:
            return Response({'error': 'Reviewer not found'}, status=404)
        except Exception as e:
            print(f"Error in reviewer GET: {str(e)}")
            return Response({'error': str(e)}, status=400)

    elif request.method == 'POST':
        try:
            data = request.data
            
            # Generate r_id as an integer
            latest_reviewer = Reviewer.objects.order_by('-r_id').first()
            try:
                last_id = int(latest_reviewer.r_id) if latest_reviewer else 0
                new_id = last_id + 1
            except ValueError:
                new_id = 1
            
            r_id = str(new_id)
            
            # Check if user exists
            try:
                user = CustomUser.objects.get(email=data['email'])
                if Reviewer.objects.filter(email=data['email']).exists():
                    return Response({'error': 'Reviewer profile already exists'}, status=400)
            except CustomUser.DoesNotExist:
                # Create new user if doesn't exist
                password = request.data.get('password')
                if not password:
                    return Response({'error': 'Password is required for new users'}, status=400)

                # Split the reviewer name into first_name and last_name
                full_name = data.get('name', '').strip()
                name_parts = full_name.split(' ', 1)
                first_name = name_parts[0]
                last_name = name_parts[1] if len(name_parts) > 1 else ''

                user = CustomUser.objects.create(
                    username=data['email'],
                    email=data['email'],
                    first_name=first_name,
                    last_name=last_name,
                    role='reviewer'
                )
                user.set_password(password)
                user.save()

            # Create reviewer profile
            reviewer = Reviewer.objects.create(
                r_id=r_id,
                name=data.get('name', f'{user.first_name} {user.last_name}').strip(),
                email=data['email'],
                user=user
            )

            return Response({
                'message': 'Reviewer created successfully',
                'reviewer': {
                    'r_id': reviewer.r_id,
                    'name': reviewer.name,
                    'email': reviewer.email,
                }
            })

        except Exception as e:
            print(f"Error creating reviewer: {str(e)}")
            # Clean up user if it was created
            if 'user' in locals():
                user.delete()
            return Response({'error': str(e)}, status=400)

    elif request.method == 'PUT':
        try:
            data = request.data
            reviewer_id = data.get('reviewer_id')
            if not reviewer_id:
                return Response({'error': 'Reviewer ID is required'}, status=400)

            reviewer = Reviewer.objects.get(r_id=reviewer_id)
            
            # Update reviewer fields
            if 'name' in data:
                reviewer.name = data['name']
            if 'email' in data:
                reviewer.email = data['email']
            
            if 'password' in data and data['password']:
                try:
                    user = CustomUser.objects.get(email=reviewer.email)
                    user.set_password(data['password'])
                    user.save()
                except CustomUser.DoesNotExist:
                    return Response({'error': 'User account not found'}, status=404)

            reviewer.save()

            return Response({
                'message': 'Reviewer updated successfully',
                'reviewer': {
                    'r_id': reviewer.r_id,
                    'name': reviewer.name,
                    'email': reviewer.email,
                }
            })

        except Reviewer.DoesNotExist:
            return Response({'error': 'Reviewer not found'}, status=404)
        except Exception as e:
            print(f"Error updating reviewer: {str(e)}")
            return Response({'error': str(e)}, status=400)

    elif request.method == 'DELETE':
        try:
            if not r_id:
                return Response({'error': 'Reviewer ID is required'}, status=400)

            reviewer = Reviewer.objects.get(r_id=r_id)
            
            # Get the associated user account
            try:
                user = CustomUser.objects.get(email=reviewer.email)
            except CustomUser.DoesNotExist:
                user = None

            # Store reviewer info for response
            reviewer_info = {
                'r_id': reviewer.r_id,
                'name': reviewer.name,
                'email': reviewer.email
            }

            # Delete reviewer
            reviewer.delete()

            # Delete associated user account if it exists
            if user:
                user.delete()

            return Response({
                'message': f'Reviewer {reviewer_info["name"]} deleted successfully',
                'deleted_reviewer': reviewer_info
            })

        except Reviewer.DoesNotExist:
            return Response({'error': 'Reviewer not found'}, status=404)
        except Exception as e:
            print(f"Error deleting reviewer: {str(e)}")
            return Response({'error': str(e)}, status=400)

    return Response({'error': 'Method not allowed'}, status=405)


# Review Assignment Functions
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@role_required(['faculty'])
def assign_paper_review(request):
    """Assign a paper to one or more reviewers for review."""
    try:
        paper_id = request.data.get('paper_id')
        reviewer_ids = request.data.get('reviewer_ids', [])
        
        if not paper_id:
            return Response({'error': 'Paper ID is required'}, status=400)
        
        if not reviewer_ids:
            return Response({'error': 'At least one reviewer must be selected'}, status=400)
        
        # Verify paper exists and belongs to the faculty
        try:
            paper = PaperDraft.objects.get(id=paper_id, faculty=request.user)
        except PaperDraft.DoesNotExist:
            return Response({'error': 'Paper not found or access denied'}, status=404)
        
        # Verify all reviewers exist
        reviewers = []
        for reviewer_id in reviewer_ids:
            try:
                reviewer = Reviewer.objects.get(r_id=reviewer_id)
                reviewers.append(reviewer)
            except Reviewer.DoesNotExist:
                return Response({'error': f'Reviewer with ID {reviewer_id} not found'}, status=404)
        
        # Create assignments
        assignments = []
        for reviewer in reviewers:
            assignment, created = PaperReviewAssignment.objects.get_or_create(
                paper=paper,
                reviewer=reviewer,
                defaults={'status': 'pending'}
            )
            if created:
                assignments.append(assignment)
        
        return Response({
            'message': f'Paper assigned to {len(assignments)} reviewer(s)',
            'assignments': [{
                'id': assignment.id,
                'reviewer_id': assignment.reviewer.r_id,
                'reviewer_name': assignment.reviewer.name,
                'status': assignment.status,
                'assigned_at': assignment.assigned_at
            } for assignment in assignments]
        }, status=201)
        
    except Exception as e:
        print(f"Error assigning paper review: {str(e)}")
        return Response({'error': str(e)}, status=500)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
@role_required(['reviewer'])
def reviewer_assigned_papers(request):
    """Get all papers assigned to the logged-in reviewer."""
    try:
        # Get the reviewer profile for the logged-in user
        try:
            reviewer = Reviewer.objects.get(user=request.user)
        except Reviewer.DoesNotExist:
            return Response({'error': 'Reviewer profile not found'}, status=404)
        
        # Get all assignments for this reviewer
        assignments = PaperReviewAssignment.objects.filter(
            reviewer=reviewer
        ).select_related('paper', 'paper__course', 'paper__faculty')
        
        papers_data = []
        for assignment in assignments:
            paper = assignment.paper
            papers_data.append({
                'assignment_id': assignment.id,
                'paper_id': paper.id,
                'course_code': paper.course.course_id,
                'course_name': paper.course.course_name,
                'faculty_name': paper.faculty.username,
                'status': assignment.status,
                'assigned_at': assignment.assigned_at,
                'reviewed_at': assignment.reviewed_at,
                'paper_path': paper.ai_meta_data.get('generated_paper_path'),
                'paper_title': f"{paper.course.course_name} - {paper.course.course_id}"
            })
        
        return Response({
            'papers': papers_data,
            'total_count': len(papers_data)
        })
        
    except Exception as e:
        print(f"Error fetching reviewer papers: {str(e)}")
        return Response({'error': str(e)}, status=500)


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
@role_required(['reviewer'])
def mark_paper_reviewed(request, assignment_id):
    """Mark a paper as reviewed by the reviewer."""
    try:
        # Get the reviewer profile for the logged-in user
        try:
            reviewer = Reviewer.objects.get(user=request.user)
        except Reviewer.DoesNotExist:
            return Response({'error': 'Reviewer profile not found'}, status=404)
        
        # Get the assignment
        try:
            assignment = PaperReviewAssignment.objects.get(
                id=assignment_id,
                reviewer=reviewer
            )
        except PaperReviewAssignment.DoesNotExist:
            return Response({'error': 'Assignment not found'}, status=404)
        
        # Update status
        assignment.status = 'reviewed'
        assignment.reviewed_at = timezone.now()
        assignment.save()
        
        return Response({
            'message': 'Paper marked as reviewed',
            'assignment': {
                'id': assignment.id,
                'paper_id': assignment.paper.id,
                'status': assignment.status,
                'reviewed_at': assignment.reviewed_at
            }
        })
        
    except Exception as e:
        print(f"Error marking paper reviewed: {str(e)}")
        return Response({'error': str(e)}, status=500)
