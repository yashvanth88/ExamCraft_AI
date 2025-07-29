from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import subprocess
import tempfile
import json
from werkzeug.utils import secure_filename
from pymongo import MongoClient
from bson import json_util, ObjectId
from cryptography.fernet import Fernet
from datetime import datetime
import uuid

app = Flask(__name__)
CORS(app)  

UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  

# Connect to MongoDB
client = MongoClient("mongodb://localhost:27017/")  # change if needed
db1 = client["examcraft"]  # database name
db2 = client["procto"]

collection = db1["questionbanks"]  # collection name
collection_yashu = db2["questions"]

KEY_FILE = "encryption.key"
if not os.path.exists(KEY_FILE):
    with open(KEY_FILE, "wb") as f:
        f.write(Fernet.generate_key())

with open(KEY_FILE, "rb") as f:
    ENCRYPTION_KEY = f.read()

fernet = Fernet(ENCRYPTION_KEY)

ALLOWED_EXTENSIONS = {'pdf', 'ppt', 'pptx'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/generate-questions', methods=['POST'])
def generate_questions():
    if 'pdf' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['pdf']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    pageFrom = request.form.get('fromPage')
    pageTo = request.form.get('toPage')
    pageFrom = int(pageFrom)
    pageTo = int(pageTo)
    difficulty = "medium"


    print(file.filename)
    if not pageFrom or not pageTo:
        return jsonify({'error': 'Pages parameter is required'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        
        file_path = "/Users/yashvanth/Desktop/ExamCraft with procto and oneshotAI and AnswerScheme copy 3/flask-server/uploads/" + filename
        file.save(file_path)
        print(file_path)
        
        try:
            cmd = [
                'python', 'qbankscript.py',
                '--file', file_path,
                '--api_key', 'AIzaSyAk8hKMef2Ea8w2jTmIYe5D97pWT3CPP9g',
                '--pages', f"{pageFrom}-{pageTo}",
                '--max_chunk_size', '10000',
                '--max_workers', '2',
                '--output', 'output.json'
            ]
            
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

            for line in process.stdout:
                print("[QBANKSCRIPT]", line.strip()) 

            process.wait()
            print(process.returncode)
            if process.returncode == 0:
                try:
                    with open('output.json', 'r', encoding='utf-8') as f:
                        json_data = json.load(f)

                    # collection.insert_one(json_util.loads(json_util.dumps(json_data)))

                    if os.path.exists(file_path):
                        os.remove(file_path)
                    return jsonify({'success': True, 'data': json_data})
                except Exception as e:
                    os.remove(file_path)
                    return jsonify({'error': f'Error reading output file: {str(e)}'}), 500
            else:
                os.remove(file_path)
                return jsonify({'error': f'Error processing file: {process.stderr}'}), 500
                
        except Exception as e:
            os.remove(file_path)
            return jsonify({'error': str(e)}), 500
    
    return jsonify({'error': 'Invalid file type'}), 400



def format_questions_for_mongodb(multiple_choice, course_id):
    formatted_docs = []
    now = datetime.utcnow()

    for q in multiple_choice:
        q_id = ObjectId()
        correct_answer = q.get("correctAnswer", "").strip()
        options = q.get("options", [])
        question_text = q.get("question", "").strip()

        option_docs = []
        for opt_text in options:
            opt_id = ObjectId()
            is_correct = (opt_text.strip() == correct_answer)
            option_docs.append({
                "optionText": opt_text,
                "isCorrect": is_correct,
                "_id": opt_id
            })

        doc = {
            "_id": q_id,
            "question": question_text,
            "options": option_docs,
            "courseId": course_id,
            "createdAt": {"$date": now.isoformat() + "Z"},
            "updatedAt": {"$date": now.isoformat() + "Z"},
            "__v": 0
        }

        formatted_docs.append(doc)

    return formatted_docs





# @app.route("/save-questions", methods=["POST"])
# def save_questions():
#     try:
#         data = request.json
#         course_code = data.get("courseId")
#         questions = data.get("questions")

        
#         if not course_code or not questions:
#             return jsonify({"success": False, "error": "Missing data"}), 400
#         questions.get("multipleChoice")
#         temp = format_questions_for_mongodb(questions.multipleChoice, course_code)
#         # Convert to JSON string and encrypt
#         questions_json = json.dumps(questions)
#         encrypted_data = fernet.encrypt(questions_json.encode())

#         # Save to DB
#         collection.insert_one({
#             "courseCode": course_code,
#             "encryptedQuestions": encrypted_data.decode(),  # store as string
#         })

#         return jsonify({"success": True})
#     except Exception as e:
#         print("Error saving questions:", e)
#         return jsonify({"success": False, "error": str(e)}), 500


@app.route("/save-questions", methods=["POST"])
def save_questions():
    try:
        data = request.json
        course_code = data.get("courseId")
        questions = data.get("questions")

        if not course_code or not questions:
            return jsonify({"success": False, "error": "Missing data"}), 400

        multiple_choice = questions.get("multipleChoice")

        if not multiple_choice:
            return jsonify({"success": False, "error": "Missing multipleChoice questions"}), 400

        temp = format_questions_for_mongodb(multiple_choice, course_code)

        questions_json = json.dumps(questions)
        encrypted_data = fernet.encrypt(questions_json.encode())

        collection.insert_one({
            "courseCode": course_code,
            "encryptedQuestions": encrypted_data.decode(),
        })

        collection_yashu.insert_many(temp)

        return jsonify({"success": True})
    except Exception as e:
        print("Error saving questions:", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/get-questions", methods=["GET"])
def get_questions():
    try:
        course_code = request.args.get("courseId")
        # course_code = "CS123"
        # print(course_code)
        if not course_code:
            return jsonify({"success": False, "error": "Missing courseCode"}), 400

        doc = collection.find_one({"courseCode": course_code})
        if not doc:
            return jsonify({"success": False, "error": "No questions found"}), 404

        decrypted = fernet.decrypt(doc["encryptedQuestions"].encode()).decode()
        questions = json.loads(decrypted)

        return jsonify({"success": True, "data": questions})
    except Exception as e:
        print("Error retrieving questions:", e)
        return jsonify({"success": False, "error": str(e)}), 500



if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, ) 