from fastapi import APIRouter, UploadFile, File
import PyPDF2
import pdfplumber

router = APIRouter(prefix="/upload", tags=["upload"])

@router.post("/")
async def upload_file(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        return {"error": "Only PDF files are supported"}

    pdf_bytes = await file.read()

    text = ""

    try:
        with pdfplumber.open(file.file) as pdf:
            for page in pdf.pages:
                text += page.extract_text() or ""
    except Exception:
        reader = PyPDF2.PdfReader(file.file)
        for page in reader.pages:
            text += page.extract_text() or ""

    return {
        "filename": file.filename,
        "content": text[:5000]
    }
