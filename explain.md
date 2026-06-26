# Local AI Knowledge Studio - Feature Explanation & Usage Guide

Welcome to the **Local AI Knowledge Studio**! This guide explains every major feature in the platform, how it works behind the scenes, and how you can use it to securely query your documents using local AI models.

---

## 1. Workspaces
### How it works
Workspaces act as secure, isolated containers for your data. When you create a workspace, the system creates a logical partition in the MongoDB database and ChromaDB vector store. This ensures that documents and conversations from one workspace (e.g., "HR Documents") do not bleed into another workspace (e.g., "Legal Contracts").

### How to use
- **Create**: On the Dashboard or Sidebar, click **"New Workspace"**. Give it a descriptive name.
- **Switch**: Use the dropdown menu at the top of the sidebar to switch between active workspaces.
- **Delete**: (Warning) Deleting a workspace will permanently wipe all documents, chat history, and embedded vectors associated with it to maintain data hygiene.

---

## 2. Knowledge Base (Document Upload & Indexing)
### How it works
This is the core pipeline of the Retrieval-Augmented Generation (RAG) system. When you upload a document:
1. **File Storage**: The file is streamed locally to the `backend/data/uploads/` directory.
2. **Text Extraction**: PyPDF/Docx/Pandas libraries extract text. If the system detects a scanned PDF or an image, it automatically routes the file to PyMuPDF and Tesseract OCR to perform optical character recognition.
3. **Recursive Chunking**: The text is broken down into small, semantically meaningful chunks (approx. 1000 characters). If a dense paragraph is too large for the AI, it uses recursive character chunking to break it down further.
4. **Vector Embedding**: Each chunk is passed through the local `mxbai-embed-large` model via Ollama to generate a mathematical vector array representing its meaning.
5. **Storage**: The vectors are stored in ChromaDB, and the metadata is stored in MongoDB.

### How to use
- Navigate to the **Knowledge Base** page.
- Select your active workspace.
- Drag and drop your PDFs, Word documents, Excel sheets, or images into the upload area.
- Wait for the "Indexing Status" to change to "Completed". The document is now ready to be queried!

---

## 3. Chat Assistant (RAG Chat)
### How it works
When you ask a question in the chat interface:
1. **Semantic Retrieval**: Your question is embedded into a vector. ChromaDB performs a "Cosine Similarity" search to find the top 5 most mathematically relevant chunks from your uploaded documents.
2. **Prompt Injection**: These relevant chunks are injected into a hidden system prompt as "Context".
3. **Local Inference**: The local `llama3.2:3b` model reads your question and the injected context, and streams back an answer based *only* on your private data.
4. **Citations & Stats**: The backend calculates confidence scores and exact page citations so you can verify the AI's claims.

### How to use
- Navigate to the **Chat Assistant** page.
- Type a question related to the documents you uploaded (e.g., "What are the termination clauses in the contract?").
- **Citations**: Click on the citation chips below the AI's response to open a right-hand drawer. This drawer shows the exact document page and text the AI used to form its answer.
- **Vision Analysis**: You can click the attachment (paperclip) icon to upload an image directly to the chat. The system will use the `qwen2.5-vl` vision model to analyze the image and discuss it with you.

---

## 4. Global Search
### How it works
Global search uses a dual-query approach (hybrid search). It searches your MongoDB metadata for exact keyword matches and searches ChromaDB for semantic intent. It then scores the results using Reciprocal Rank Fusion (RRF) to give you the most accurate document matches.

### How to use
- Use the search bar at the top of the screen.
- Type a keyword or a semantic query (e.g., "Q3 Financials").
- Press Enter. The search results will show you exact paragraphs and allow you to quickly preview the document without entering a chat.

---

## 5. Dashboard Diagnostics
### How it works
The dashboard polls a `/api/status` endpoint to monitor the health of your local infrastructure. It checks if MongoDB is accepting connections, if ChromaDB is accessible, and polls Ollama to verify that the required models (`llama3.2:3b`, `mxbai-embed-large`) are actively loaded in memory.

### How to use
- Use the Dashboard to quickly check your system health. If the "Local AI Ready" badge turns red, it means your Ollama background service has crashed or is not running. 

---

## Why am I unable to send messages or create workspaces?
If the UI is failing to create workspaces or send messages, **your backend API server is likely not running.** 
The React frontend (Port 5173) relies entirely on the FastAPI backend (Port 8000) to communicate with MongoDB and Ollama. 

**Solution:**
Ensure you have three separate terminal windows running simultaneously:
1. **MongoDB**: Running in the background (usually a background Windows service).
2. **Backend**: `python -m backend.main` (Run from the root `RAG_CHATBOT` directory).
3. **Frontend**: `npm run dev` (Run from the `frontend` directory).
