# Local AI Knowledge Studio

An enterprise-grade, offline-first Retrieval-Augmented Generation (RAG) platform. It allows users to securely upload, index, and query internal documents locally without sending sensitive data to third-party cloud services.

---

## 🛑 Critical System Requirements

Before you can run the Local AI Knowledge Studio, you **must** install the following three core dependencies on your machine. If any of these are missing, the application will not start.

### 1. MongoDB (Database) - *Required*
MongoDB is used to store all application data, including your Workspaces, chat history, and document indexing statuses.
* **How to install**: 
  1. Download [MongoDB Community Server for Windows/Mac](https://www.mongodb.com/try/download/community).
  2. Run the installer and choose the "Complete" setup.
  3. **Important**: Ensure you check the box that says **"Install MongoDB as a Service"**. This allows the database to run silently in the background on port `27017`.

### 2. Ollama (Local AI Engine) - *Required*
Ollama runs the large language models directly on your hardware.
* **How to install**:
  1. Download and install [Ollama](https://ollama.ai/).
  2. Open your terminal/PowerShell and download the required AI models by running these three commands:
     ```bash
     ollama pull mxbai-embed-large
     ollama run llama3.2:3b
     ollama pull qwen2.5-vl
     ```
  *(Note: `mxbai` generates vector embeddings, `llama3.2` is the chat assistant, and `qwen2.5` handles image analysis).*

### 3. Node.js & Python (Runtimes) - *Required*
* **Node.js (v18+)**: [Download here](https://nodejs.org/) (Required for the frontend interface).
* **Python (v3.10+)**: [Download here](https://www.python.org/downloads/) (Required for the backend API).

---

## 🚀 Setup & Installation

The project is split into two halves: the Backend (Python) and the Frontend (React). You need to start both.

### Step 1: Start the Backend (API Server)
The backend handles file parsing, OCR, and AI orchestration.

1. Open a terminal and navigate to the root of the project.
2. Move into the backend folder:
   ```bash
   cd backend
   ```
3. Create and activate a Python virtual environment:
   * **Windows**: `python -m venv venv` followed by `.\venv\Scripts\activate`
   * **Mac/Linux**: `python3 -m venv venv` followed by `source venv/bin/activate`
4. Install the backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```
5. Start the server:
   ```bash
   python -m backend.main
   ```
   *If successful, it will print: `Application startup complete.`*

### Step 2: Start the Frontend (User Interface)
The frontend provides the beautiful chat UI and dashboard.

1. Open a **second, separate terminal** and navigate to the project root.
2. Move into the frontend folder:
   ```bash
   cd frontend
   ```
3. Install the node modules:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

---

## 📖 How to Use the Application

Once both servers are running, open your web browser and go to: **`http://localhost:5173`**

### 1. Create a Workspace
Before you can chat or upload files, you need a workspace. Workspaces act like isolated folders for different projects.
* Click **"New Workspace"** in the sidebar.
* Give it a name (e.g., "HR Documents" or "Legal Contracts").

### 2. Upload Knowledge (Documents)
Teach the AI about your specific data.
* Go to the **"Knowledge Base"** tab in the sidebar.
* Drag and drop your PDFs, Word documents, Excel files, or Images.
* The system will automatically chunk the text and save the vector embeddings. Wait until the status says **Completed**.

### 3. Ask Questions (Chat)
* Go to the **"Chat Assistant"** tab.
* Ask the AI a question about the documents you just uploaded. 
* The AI will read your local files and stream an answer, providing exact **Page Number Citations** at the bottom of its response so you can verify its claims!

---

## 🛠️ Troubleshooting Common Errors

* **"Backend refuses to start / SystemExit(1)"**: You do not have MongoDB running on port 27017. Ensure you installed MongoDB as a background service.
* **"Cannot Create Workspace / Unable to send message"**: This means the Frontend cannot talk to the Backend. Ensure your Backend terminal is open, active, and shows `Uvicorn running on http://0.0.0.0:8000`.
* **"Dashboard shows Models Missing"**: You installed Ollama, but forgot to run the `ollama pull` commands listed in the requirements section. Open a terminal and pull the models.
* **"ModuleNotFoundError: No module named backend"**: Ensure your terminal is in the ROOT of the project, or that you execute `python -m main` if your terminal is directly inside the `backend` folder.
