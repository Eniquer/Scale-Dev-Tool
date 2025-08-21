from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os, base64, openai, json
import numpy as np
from API.functions import *
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

searchModel = "gpt-4o-search-preview"
class ChatRequest(BaseModel):
    prompt: str
    model: str = "gpt-4o"
    history: list = []
    temperature: float = 0.7
    keyCipher: str

router = APIRouter()

@router.post("/encrypt-key")
async def encrypt_key(req: EncryptKey):
    print(f"Encrypting key: {req.key[-3:]}")
    cipher = simple_encrypt(req.key)
    return {"cipher": cipher}

@router.post("/analyze-anova")
async def analyze_endpoint(data: dict):
    try:
        intended_map = data.get('intendedMap', {})
        options = data.get('options', {}) or {}
        drop_incomplete = bool(options.get('dropIncomplete', True))

        # Align payload field names to analyzer expectations
        table_data = pd.DataFrame(data.get('data', []))
        if not table_data.empty:
            table_data = table_data.rename(columns={
                'itemId': 'item',
                'subdimension': 'facet',
            })
            # Ensure item keys match intended_map keys (frontend sends string ids)
            if 'item' in table_data.columns:
                table_data['item'] = table_data['item'].astype(str)
            # Coerce rating to numeric
            if 'rating' in table_data.columns:
                table_data['rating'] = pd.to_numeric(table_data['rating'], errors='coerce')

        res = analyze_content_adequacy(
            table_data,
            intended_map,
            alpha=0.05,
            decision_mode="ternary",     # or "binary"
            sphericity="GG",             # GG per MacKenzie/Winer; use "HF" if you prefer
            require_target_highest=True,  # typical rule
            drop_incomplete=drop_incomplete
        )
        # Serialize DataFrame to JSON-friendly list
        # Replace +/-inf with NaN, then convert NaN to None for strict JSON compliance
        res = res.replace([np.inf, -np.inf], np.nan)
        records = res.replace({np.nan: None}).to_dict(orient='records')
        return {"result": records}
    except HTTPException:
        raise
    except Exception as e:
        # Surface errors to client for debugging
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/chat")
async def chat_endpoint(chat_req: ChatRequest):
    # decrypt user's API key cipher
    api_key = simple_decrypt(chat_req.keyCipher)
    print(f"Using API key: {api_key[-3:]}")  # Log last 3 chars for debugging  //TODO remove in production
    # call ChatGPT via functions
    try:
        if chat_req.model == "gpt-4o-search-preview":
            reply = get_chatgpt_search(
                chat_req.prompt,
                chat_req.history,
                model=chat_req.model,
                api_key=api_key
            )
        else:
            reply = get_chatgpt_response(
                chat_req.prompt,
                chat_req.history,
                temperature=chat_req.temperature,
                model=chat_req.model,
            api_key=api_key
        )
    except AuthenticationError:
        raise HTTPException(status_code=401, detail="invalid_api_key")
    except PermissionDeniedError:
        raise HTTPException(status_code=403, detail="permission_denied")
    except RateLimitError:
        raise HTTPException(status_code=429, detail="rate_limit_exceeded")
    except BadRequestError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except APIError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


    return {"reply": reply[0], "history": reply[1]}

