import os
import pytesseract
from PIL import Image
from backend.core.config import settings

class OCRService:
    def __init__(self):
        # Set the Tesseract executable path on Windows
        if os.path.exists(settings.TESSERACT_CMD):
            pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD

    def extract_text(self, image_path: str, lang: str = "eng+hin+tel") -> str:
        """Extract text from an image using local Tesseract OCR.
        
        Args:
            image_path: Absolute path to the image file.
            lang: Languages to use, separated by '+' (e.g. 'eng+hin+tel').
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found at {image_path}")
            
        try:
            img = Image.open(image_path)
            # Try to run OCR with requested languages
            text = pytesseract.image_to_string(img, lang=lang)
            return text.strip()
        except Exception as e:
            # If multi-language data fails (e.g. hin/tel not installed), fallback to English
            if lang != "eng":
                try:
                    img = Image.open(image_path)
                    text = pytesseract.image_to_string(img, lang="eng")
                    return text.strip()
                except Exception as ex:
                    raise Exception(f"OCR failed after falling back to English: {ex}") from e
            raise Exception(f"OCR failed: {e}") from e

    def is_text_scanned(self, text_content: str) -> bool:
        """Determines if extracted text is negligible (suggesting a scanned document/page)."""
        return len(text_content.strip()) < 100

ocr_service = OCRService()
