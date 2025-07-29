import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams } from "react-router-dom"; 


const App = () => {
   const {courseId} = useParams();
  const [questions, setQuestions] = useState({
    multipleChoice: [],
    shortAnswer: [],
    longAnswer: [],
    numerical: []
  });
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState({});
  const [activeTab, setActiveTab] = useState('multipleChoice');
  const [pageRange, setPageRange] = useState({ from: 1, to: 1 });
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState('');
  const [count, setCount] = useState(1);

      const CORRECT_KEY = "f2c0"; //Try to genrate a key from the backend


      useEffect(() => {
    if (!isAuthenticated) {
      setCount(1); // Reset to 1 when authentication is needed
    }
  }, [isAuthenticated]);


  useEffect(() => {
    // Load data from localStorage if available
    const savedData = localStorage.getItem('questionData');
    if (savedData) {
      const parsedData = JSON.parse(savedData);
      setQuestions(parsedData.data);
    }
  }, []);
  
  useEffect(() => {
    // const courseCode = searchParams.get("courseId");
    //const courseCode = "CS123"

    const fetchQuestions = async () => {
      try {
        const res = await axios.get("http://localhost:5001/get-questions", {
          params: { courseId },
        });

        if (res.data.success) {
          // setQuestions(res.data.data);
          console.log("All longAnswers:", res.data.data?.multipleChoice);

          res.data.data?.multipleChoice?.forEach((item, index) => {
            console.log(`Answer ${index + 1}:`, item.answer);
          });
        } else {
          console.warn(res.data.error);
        }
      } catch (error) {
        console.error("Error loading questions:", error);
      }
    };

    fetchQuestions();
  }, []);

  const handleSaveQuestions = async () => {
    // const courseCode = searchParams.get("courseId");
    // console.log("courseCode", courseCode)
//    const courseCode = "CS123"

    try {
      const res = await axios.post("http://localhost:5001/save-questions", {
        courseId,
        questions,
      });
      if (res.data.success) {
        alert("Questions saved securely!");
      } else {
        alert("Failed to save questions.");
      }
    } catch (error) {
      console.error(error);
      alert("Error saving questions.");
    }
  };


  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  const handleGenerateQuestions = async () => {
    if (!selectedFile) {
      alert('Please select a PDF file first');
      return;
    }

    setIsGenerating(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('pdf', selectedFile);
    formData.append('fromPage', pageRange.from);
    formData.append('toPage', pageRange.to);

    try {
      const response = await axios.post('http://localhost:5001/generate-questions', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        },
      });

      if (response.data) {
        setQuestions(response);
        localStorage.setItem('questionData', JSON.stringify(response.data));
        console.log('questions', questions)
        // alert("Questions generated successfully!");
      }
    } catch (error) {
      console.error("Error generating questions:", error);
      alert("Failed to generate questions. Please try again.");
    } finally {
      setIsGenerating(false);
      setUploadProgress(0);
    }
  };

  const handleEdit = (type, index) => {
    setEditing({ type, index });
    setEditData({ ...questions[type][index] });
  };

  const handleDelete = (type, index) => {
    const newQuestions = { ...questions };
    newQuestions[type].splice(index, 1);
    setQuestions(newQuestions);
  };

  const handleSave = () => {
    const newQuestions = { ...questions };
    newQuestions[editing.type][editing.index] = editData;
    setQuestions(newQuestions);
    setEditing(null);
  };

  const handleChange = (e, field) => {
    setEditData({
      ...editData,
      [field]: e.target.value
    });
  };

  const handleOptionChange = (e, index) => {
    const newOptions = [...editData.options];
    newOptions[index] = e.target.value;
    setEditData({
      ...editData,
      options: newOptions
    });
  };

  const handleAddOption = () => {
    setEditData({
      ...editData,
      options: [...editData.options, ""]
    });
  };

  const handleRemoveOption = (index) => {
    const newOptions = [...editData.options];
    newOptions.splice(index, 1);
    setEditData({
      ...editData,
      options: newOptions
    });
  };
   const handleKeySubmit = (e) => {
    e.preventDefault();
    if (encryptionKey === CORRECT_KEY) {
      setIsAuthenticated(true);
    } else {
      alert('Invalid encryption key');
      setEncryptionKey('');
    }
  };

  const renderQuestionCard = (question, type, index) => {
    

    if (editing && editing.type === type && editing.index === index) {
      return (
        <div key={index} className="border p-4 mb-4 rounded-lg bg-gray-50">
          <div className="mb-4">
            <label className="block font-medium mb-1">Question:</label>
            <textarea
              value={editData.question}
              onChange={(e) => handleChange(e, 'question')}
              className="w-full p-2 border rounded"
              rows="3"
            />
          </div>

          {type === 'multipleChoice' && (
            <div className="mb-4">
              <label className="block font-medium mb-1">Options:</label>
              {editData.options.map((option, optIndex) => (
                <div key={optIndex} className="flex mb-2">
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => handleOptionChange(e, optIndex)}
                    className="flex-1 p-2 border rounded"
                  />
                  <button
                    onClick={() => handleRemoveOption(optIndex)}
                    className="ml-2 px-3 bg-red-500 text-white rounded"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                onClick={handleAddOption}
                className="mt-2 px-3 py-1 bg-blue-500 text-white rounded"
              >
                Add Option
              </button>
            </div>
          )}

          {(type === 'multipleChoice' || type === 'shortAnswer' || type === 'numerical') && (
            <div className="mb-4">
              <label className="block font-medium mb-1">
                {type === 'multipleChoice' ? 'Correct Answer:' : 'Answer:'}
              </label>
              <input
                type="text"
                value={editData.correctAnswer || editData.answer}
                onChange={(e) => handleChange(e, type === 'multipleChoice' ? 'correctAnswer' : 'answer')}
                className="w-full p-2 border rounded"
              />
            </div>
          )}

          {type === 'multipleChoice' && (
            <div className="mb-4">
              <label className="block font-medium mb-1">Explanation:</label>
              <textarea
                value={editData.explanation}
                onChange={(e) => handleChange(e, 'explanation')}
                className="w-full p-2 border rounded"
                rows="3"
              />
            </div>
          )}

          {type === 'longAnswer' && (
            <>
              <div className="mb-4">
                <label className="block font-medium mb-1">Answer:</label>
                <textarea
                  value={editData.answer}
                  onChange={(e) => handleChange(e, 'answer')}
                  className="w-full p-2 border rounded"
                  rows="5"
                />
              </div>
              <div className="mb-4">
                <label className="block font-medium mb-1">Marking Scheme:</label>
                <textarea
                  value={editData.markingScheme?.join('\n') || ''}
                  onChange={(e) => handleChange(e, 'markingScheme')}
                  className="w-full p-2 border rounded"
                  rows="5"
                />
              </div>
            </>
          )}

          {type === 'numerical' && (
            <div className="mb-4">
              <label className="block font-medium mb-1">Solution:</label>
              <textarea
                value={editData.solution}
                onChange={(e) => handleChange(e, 'solution')}
                className="w-full p-2 border rounded"
                rows="5"
              />
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setEditing(null)}
              className="px-4 py-2 bg-gray-500 text-white rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-green-500 text-white rounded"
            >
              Save
            </button>
          </div>
        </div>
      );
    }


    return (
  <div className="relative">
    {/* Main content - blurred when not authenticated */}
    <div className={`${!isAuthenticated ? 'blur-md pointer-events-none' : ''}`}>
      <div key={index} className="border p-4 mb-4 rounded-lg bg-white shadow-sm">
        <h3 className="font-medium text-lg mb-2">{question.question}</h3>
        
        {type === 'multipleChoice' && (
          <div className="mb-3">
            <h4 className="font-medium mb-1">Options:</h4>
            <ul className="list-disc pl-5">
              {question.options?.map((option, i) => (
                <li key={i} className={option === question.correctAnswer ? 'text-green-600 font-medium' : ''}>
                  {option}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-gray-600">
              <span className="font-medium">Explanation:</span> {question.explanation}
            </p>
          </div>
        )}

        {(type === 'shortAnswer' || type === 'numerical') && (
          <div className="mb-3">
            <h4 className="font-medium mb-1">Answer:</h4>
            <p className="bg-gray-50 p-2 rounded">{question.answer || question.correctAnswer}</p>
          </div>
        )}

        {type === 'longAnswer' && (
          <div className="mb-3">
            <h4 className="font-medium mb-1">Answer:</h4>
            <p className="bg-gray-50 p-2 rounded whitespace-pre-line">{question.answer}</p>
            <h4 className="font-medium mt-3 mb-1">Marking Scheme:</h4>
            <ul className="list-disc pl-5 bg-gray-50 p-2 rounded">
              {question.markingScheme?.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {type === 'numerical' && (
          <div className="mb-3">
            <h4 className="font-medium mb-1">Solution:</h4>
            <p className="bg-gray-50 p-2 rounded whitespace-pre-line">{question.solution}</p>
          </div>
        )}

        <div className="flex justify-end space-x-2">
          <button
            onClick={() => handleEdit(type, index)}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm"
          >
            Edit
          </button>
          <button
            onClick={() => handleDelete(type, index)}
            className="px-3 py-1 bg-red-500 text-white rounded text-sm"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
);

    
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Question Dashboard</h1>

      {/* File Upload and Generation Section */}
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-4">Generate Questions from PDF</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block font-medium mb-1">PDF File:</label>
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              className="w-full p-2 border rounded"
            />
          </div>
          
          <div>
            <label className="block font-medium mb-1">From Page:</label>
            <input
              type="number"
              min="1"
              value={pageRange.from}
              onChange={(e) => setPageRange({...pageRange, from: parseInt(e.target.value) || 1})}
              className="w-full p-2 border rounded"
            />
          </div>
          
          <div>
            <label className="block font-medium mb-1">To Page:</label>
            <input
              type="number"
              min={pageRange.from}
              value={pageRange.to}
              onChange={(e) => setPageRange({...pageRange, to: parseInt(e.target.value) || 1})}
              className="w-full p-2 border rounded"
            />
          </div>
        </div>

        <button
          onClick={handleGenerateQuestions}
          disabled={isGenerating || !selectedFile}
          className={`px-6 py-2 rounded-lg shadow transition ${
            isGenerating || !selectedFile
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isGenerating ? 'Generating...' : 'Generate Questions'}
        </button>

        {isGenerating && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {uploadProgress < 100 ? 'Uploading and processing...' : 'Processing...'}
            </p>
          </div>
        )}
      </div>

      {/* Question Type Tabs */}
      <div className="flex border-b mb-4">
        <button
          className={`px-4 py-2 ${activeTab === 'multipleChoice' ? 'border-b-2 border-blue-500 font-medium' : ''}`}
          onClick={() => setActiveTab('multipleChoice')}
        >
          Multiple Choice
        </button>
        <button
          className={`px-4 py-2 ${activeTab === 'shortAnswer' ? 'border-b-2 border-blue-500 font-medium' : ''}`}
          onClick={() => setActiveTab('shortAnswer')}
        >
          Short Answer
        </button>
        <button
          className={`px-4 py-2 ${activeTab === 'longAnswer' ? 'border-b-2 border-blue-500 font-medium' : ''}`}
          onClick={() => setActiveTab('longAnswer')}
        >
          Long Answer
        </button>
        <button
          className={`px-4 py-2 ${activeTab === 'numerical' ? 'border-b-2 border-blue-500 font-medium' : ''}`}
          onClick={() => setActiveTab('numerical')}
        >
          Numerical
        </button>
      </div>


        {!isAuthenticated && count && (
      <div className="absolute inset-0  z-50 top-[400px] left-[500px]">
        <div className="bg-white bg-opacity-90 p-8 rounded-lg shadow-md w-full max-w-md backdrop-blur-sm">
          <h1 className="text-2xl font-bold mb-6 text-center">Enter Encryption Key</h1>
          <form onSubmit={(e) => {
              handleKeySubmit(e);
              // setCount(0); // Set to 0 after submission
            }}  className="space-y-4">
            <div>
              <input
                type="password"
                value={encryptionKey}
                onChange={(e) => setEncryptionKey(e.target.value)}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter encryption key"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition"
            >
              Unlock Questions
            </button>
          </form>
        </div>
      </div>
    )}

      {/* Question Display Area */}
      <div className={`relative ${!isAuthenticated ? 'blur-sm pointer-events-none' : ''}`}>
  {questions[activeTab]?.length > 0 ? (
    questions[activeTab].map((question, index) =>
      renderQuestionCard(question, activeTab, index)
    )
  ) : (
    <p className="text-gray-500">No {activeTab.replace(/([A-Z])/g, ' $1').toLowerCase()} questions available.</p>
  )}
</div>


      <div className="flex justify-end">
        <button
          onClick={handleSaveQuestions}
          className="px-6 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition"
        >
          Save Questions
        </button>
      </div>
    </div>
  );
};

export default App;