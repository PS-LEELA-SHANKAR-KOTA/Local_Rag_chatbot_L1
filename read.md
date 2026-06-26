# Local AI Knowledge Studio 🚀

> **Your Private Enterprise AI Workspace — Completely Offline.**

Local AI Knowledge Studio is an enterprise-grade, 100% offline, privacy-first Retrieval-Augmented Generation (RAG) platform. It enables teams and individuals to upload, organize, search, analyze, and chat with corporate documents, spreadsheets, and images without exposing sensitive data to external cloud APIs.

---

## 📋 System Prerequisites & Requirements

To run this application locally, you must install the following software packages on your host machine:

### 1. Core Runtimes
* **Node.js**: `v18.0.0` or higher (tested on `v24.18.0`) — [Download Node.js](https://nodejs.org/)
* **Python**: `v3.10` or higher (tested on `v3.13.14`) — [Download Python](https://www.python.org/)

### 2. Databases & Engines
* **MongoDB Community Server**: Installed and running locally on standard port `27017` — [Download MongoDB](https://www.mongodb.com/try/download/community)
* **Ollama**: Installed and running on standard port `11434` — [Download Ollama](https://ollama.com/)

### 3. OCR Engines
* **Tesseract OCR**: Required for text extraction from scanned PDFs and images.
  * **Windows Installation**:
    1. Download and run the Windows installer from [UB Mannheim Tesseract](https://github.com/UB-Mannheim/tesseract/wiki).
    2. Install to the default directory: `C:\Program Files\Tesseract-OCR\tesseract.exe`.
    3. Make sure to download additional language training data (e.g. Hindi, Telugu) during installation if you plan to parse multilingual scans.
  * **macOS Installation**:
    ```bash
    brew install tesseract tesseract-lang
    ```
  * **Linux (Ubuntu/Debian) Installation**:
    ```bash
    sudo apt-get install tesseract-ocr tesseract-ocr-hin tesseract-ocr-tel
    ```

---

## 🤖 Local AI Model Pull Commands

Before launching the application, you must pull the required Text, Embeddings, and Vision models inside your local Ollama instance. Run these commands in your system terminal:

```bash
# 1. Text Generation & RAG Reasoning model (Llama 3.2 3B)
ollama pull llama3.2:latest

# 2. Semantic Embedding model (Mxbai Embed Large)
ollama pull mxbai-embed-large:latest

# 3. Vision & OCR understanding model (Qwen 2.5 VL 3B)
ollama pull qwen2.5vl:3b
```

---

## ⚙️ Installation & Launch Guide

Follow these steps to set up the backend and frontend modules:

### 1. Launch the FastAPI Backend

You can launch the backend using one of the following options:

#### Option A: Launch from the Project Root Folder (Recommended)
Keep your terminal in the `RAG_CHATBOT` root folder and run:
```bash
python -m backend.main
```

#### Option B: Launch from inside the `backend` Folder
If you prefer to navigate inside the backend folder, run:
```bash
cd backend
python main.py
```
The REST API endpoints will be served at **`http://localhost:8000`**.

### 2. Launch the Vite React Frontend
Open a new terminal window/tab:

```bash
# 1. Navigate to the frontend directory
cd frontend

# 2. Install node dependencies
npm install

# 3. Start the React/Vite development server
npm run dev
```
Navigate your browser to **`http://localhost:5173`** to access the workspace.

---

## 💡 How to Use the Studio

### 1. Workspaces Containerization
* When you launch the studio, you will be prompted to create or select a **Workspace**. 
* Workspaces isolate raw files, database chunks, vector indices, and chat histories. You can manage, rename, and delete workspaces from the **Control Center (Settings)** page.

### 2. Knowledge Base Uploads
* Go to the **Knowledge Base** page.
* Drag and drop single files or entire folder trees containing:
  * Documents: `.pdf`, `.docx`, `.doc`, `.txt`, `.md`
  * Data: `.xlsx`, `.csv`
  * Slides: `.pptx`, `.ppt`
  * Images: `.png`, `.jpg`, `.jpeg`, `.webp`, `.tiff`, `.bmp`
* The background pipeline will automatically:
  * Parse text and structures.
  * Trigger Tesseract OCR if page text is scanned or missing.
  * Execute layout-aware semantic chunking.
  * Embed text chunks into ChromaDB and MongoDB collections.

### 3. Interactive Chat Assistant
* Go to the **Chat Assistant** page.
* Select a file context or ask questions about your documents globally.
* The assistant will stream:
  * **Thought Process (Reasoning block)**: Explaining which files are referenced and how it compiles the answer offline.
  * **Answer with Citations**: Clicking bracketed citations (e.g. `[Source ID: 0]`) slides in a right drawer showing the exact page context from the cited document.
  * **System Diagnostics & Confidence Scores**: Evaluates the retrieval accuracy and shows processing metrics.
* **Vision QA Mode**: Attach screenshot images, bills, charts, or diagrams and ask the assistant questions to trigger the Qwen2.5-VL vision analysis pipeline.
* **Quick Commands**: Use prompt shortcut chips (Summarize, Explain, Translate to Hindi, Compare) to apply quick action presets.

### 4. Hybrid Search
* Use the top search bar or the dedicated **Search** page.
* Executes a blended search querying both **BM25 Lexical indexes (MongoDB)** and **Cosine Vector similarities (ChromaDB)**.
* Filter results by file formats, languages, document categories, and creation dates.

---

## 🛠 Troubleshooting & Diagnostics

* **Ollama Offline Indicator**: If the status panel shows Ollama is disconnected, verify Ollama is running in your taskbar and check `http://localhost:11434` in your browser.
* **Missing Models Warning**: If a model shows "Missing" in the Control Center settings, copy the respective `ollama pull` command and run it in a console, then refresh diagnostics.
* **Tesseract Not Found (Windows)**: If document parsing fails, verify you installed Tesseract at `C:\Program Files\Tesseract-OCR\tesseract.exe`. You can adjust this path in `backend/core/config.py` if installed elsewhere.
