import os
import importlib
import openai
import json
import pandas as pd
import time


# ---------------------- functions ----------------------

# Load questions from a JSON file
def load_questions(file_path):
    """
    Loads questions from a JSON file.
    """
    with open(file_path, 'r', encoding='utf-8') as file:
        return json.load(file)

# questions_file = "questions.json"
# questions = load_questions(questions_file)


# Removed specific OpenAI exception imports (not available in this environment)

def get_chatgpt_response(user_input, messages, temperature=0.7, model="gpt-4o", api_key=None):
    """
    Sends a prompt to ChatGPT and retrieves the response, handling errors and retries.
    """
    client = openai.OpenAI(api_key=api_key)
    # Append user's input to the conversation history
    messages.append({"role": "user", "content": user_input})
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
        )
    except Exception as e:
        err_msg = str(e).lower()
        # Retry on rate-limiting errors
        if 'rate limit' in err_msg:
            print("Rate limit exceeded. Retrying in 5 seconds...", e)
            time.sleep(5)
            return get_chatgpt_response(user_input, messages, temperature, model, api_key)
        # Log other API errors and propagate
        print("OpenAI API error:", e)
        raise
    # Extract assistant's reply
    assistant_reply = response.choices[0].message.content
    # Append assistant's reply to history
    messages.append({"role": "assistant", "content": assistant_reply})
    return assistant_reply

