from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os, base64, openai
from API.functions import get_chatgpt_response
from openai._exceptions import (
    AuthenticationError,
    PermissionDeniedError,
    RateLimitError,
    BadRequestError,
    APIError,
)

from dotenv import load_dotenv
load_dotenv()   # reads .env into os.environ


# Load encryption secret from environment (set ENCRYPTION_SECRET)
ENCRYPTION_SECRET = os.getenv("ENCRYPTION_SECRET", "")
if not ENCRYPTION_SECRET:
    raise RuntimeError("ENCRYPTION_SECRET not set")

# Encryption utilities

def simple_encrypt(text: str) -> str:
    key = ENCRYPTION_SECRET
    xored = ''.join(chr(ord(c) ^ ord(key[i % len(key)])) for i, c in enumerate(text))
    return base64.b64encode(xored.encode()).decode()


def simple_decrypt(cipher: str) -> str:
    try:
        decoded = base64.b64decode(cipher.encode()).decode()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid key cipher")
    key = ENCRYPTION_SECRET
    return ''.join(chr(ord(c) ^ ord(key[i % len(key)])) for i, c in enumerate(decoded))

# Request models

class EncryptKey(BaseModel):
    key: str

class ChatRequest(BaseModel):
    prompt: str
    model: str = "gpt-4o"
    history: list = []
    temperature: float = 0.7
    keyCipher: str

router = APIRouter()

@router.post("/encrypt-key")
async def encrypt_key(req: EncryptKey):
    cipher = simple_encrypt(req.key)
    return {"cipher": cipher}

@router.post("/chat")
async def chat_endpoint(chat_req: ChatRequest):
    # decrypt user's API key cipher
    api_key = simple_decrypt(chat_req.keyCipher)
    print(f"Using API key: {api_key}")  # Log last 3 chars for debugging  //TODO remove in production
    # call ChatGPT via functions
    try:
        reply = get_chatgpt_response(
            chat_req.prompt,
            chat_req.history,
            temperature=chat_req.temperature,
            model=chat_req.model,
            api_key=api_key
        )
    except AuthenticationError:
        # Invalid or unauthorized API key
        raise HTTPException(status_code=401, detail="invalid_api_key")
    except PermissionError:
        # API key lacks required permissions
        raise HTTPException(status_code=403, detail="permission_denied")
    except RateLimitError:
        # Rate limit exceeded
        raise HTTPException(status_code=429, detail="rate_limit_exceeded")
    except InvalidRequestError as e:
        # Bad request (e.g., missing parameters)
        raise HTTPException(status_code=400, detail=str(e))
    except OpenAIError as e:
        # Other OpenAI API errors
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        # Unexpected errors
        raise HTTPException(status_code=500, detail=str(e))
    return {"reply": reply}

