import base64
import httpx
import logging
from backend.core.config import settings

logger = logging.getLogger(__name__)

class VisionService:
    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL
        self.model = settings.VISION_MODEL

    def _get_base64_image(self, image_path: str) -> str:
        """Reads a local image and encodes it to base64."""
        with open(image_path, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode("utf-8")
        return encoded_string

    async def analyze_image(self, image_path: str, prompt: str = "Analyze this image and describe its content, including text, objects, and structure.") -> str:
        """Sends an image to Ollama's Qwen2.5-VL model for local visual understanding."""
        try:
            base64_img = self._get_base64_image(image_path)
        except Exception as e:
            logger.error(f"Failed to read/encode image for vision service: {e}")
            raise Exception(f"Vision service image read error: {e}")

        async with httpx.AsyncClient(timeout=180.0) as client:
            try:
                response = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "images": [base64_img],
                        "stream": False
                    }
                )
                response.raise_for_status()
                data = response.json()
                return data.get("response", "").strip()
            except Exception as e:
                logger.error(f"Ollama vision generation failed using model {self.model}: {e}")
                # Return a warning description if vision model is not pulled yet
                return f"[Vision analysis unavailable: ensure model '{self.model}' is pulled in Ollama. Error details: {e}]"

vision_service = VisionService()
