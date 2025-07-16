import os
import importlib
import openai
import json
import pandas as pd
import time

# load_dotenv()  # Load environment variables from .env file
key = "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"

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


def get_openai_api_key():
    return key
    """
    Retrieves the OpenAI API key from environment variables.
    Ensure the environment variable 'OPENAI_API_KEY' is set.
    """
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        raise ValueError("OpenAI API key not found. Please set the 'OPENAI_API_KEY' environment variable.")
    # print(str(api_key)[-3:])
    return api_key


def get_chatgpt_response(user_input,messages,temperature=0.7,model="gpt-4o"):
    client = openai.OpenAI(api_key=get_openai_api_key())
    # time.sleep(1)  # Rate limit to avoid hitting the API too fast
    """
    Sends a prompt to ChatGPT and retrieves the response.
    """
    # Add the user's input to the conversation
    messages.append({"role": "user", "content": user_input})
    openai.api_key = get_openai_api_key()

    try:
        response = client.chat.completions.create(
            # model="gpt-4o",
            # model="gpt-4o-mini", # not that good ressults, fucked up the structure sometimes
            model=model,
            messages=messages,
            temperature=temperature,
        )
    except openai.error.RateLimitError:
        print("Rate limit exceeded. Retrying...")
        time.sleep(5)
        return get_chatgpt_response(user_input,messages,temperature,model)

    # Extract the assistant's reply
    assistant_reply = response.choices[0].message.content
    
    # Add the assistant's reply to the conversation
    messages.append({"role": "assistant", "content": assistant_reply})
    
    return assistant_reply


# Create a DataFrame where each category is a column and questions are grouped under their respective categories
def create_questions_dataframe(questions_dict):
    """
    Creates a DataFrame structure with categories and demographic columns, 
    initialized with None values for answers.
    """
    # Extract categories from questions
    categories = [q['category'] for q in questions_dict['questions']]

    # Extract demographic keys
    demographics = list(questions_dict['demographics'].keys())

    # Combine categories and demographics into columns
    columns = categories + demographics + ['persona']

    # Create an empty DataFrame with the specified columns
    answers_df = pd.DataFrame(columns=columns)

    return answers_df

def store_as_json(filePath,data,chosenVerison = None):
    # Check if all values in the dictionary are None
    if not data or len(data) == 0:
        print("No data to store.")
        return
    if all(value is None for value in data[0].values()):
        print("All values in the dictionary are None. No data to store.")
        return
    # Export the data to a JSON file
    version = 1
    outOfSync = ""
    output_file = f"{filePath}_v{version}_{outOfSync}.json"
    # If a specific version is chosen, use that version number
    if chosenVerison is not None:
        version = chosenVerison
        output_file = f"{filePath}_v{version}_{outOfSync}.json"  
        if os.path.exists(output_file):
            outOfSync = "outOfSync_"
            print(f"The file {output_file} already exists. choosing its own Version.")
            output_file = f"{filePath}_v{version}_{outOfSync}.json"  

    # Check if the file exists and increment the version number if it does
    while os.path.exists(output_file):
        version += 1
        output_file = f"{filePath}_v{version}_{outOfSync}.json"
    with open(output_file, 'w', encoding='utf-8') as file:
        json.dump(data, file, ensure_ascii=False, indent=4)
    print(f"Data exported to {output_file}")
    return version  # Return the version number of the saved file
    

def get_persona(mode,messages, temp=0.7,model="gpt-4o"):
    """
    Returns a persona based on the selected mode.
    """
    match mode:
        case 0:
            return get_chatgpt_response("Generate a realistic everyday persona by defining the following characteristics in detail. Personallity traits, Emotions and feelings, Social Identity, Behavior and Mannerisms, Values and Beliefs, Skills and Abilities, Relationships and Roles, Job, Hobbies",messages,temp,model)
            # batch mean F: 4.896
        case 1:
            return get_chatgpt_response("Generate a realistic everyday persona.",messages,temp,model)
            # batch mean F: 4.848
        case 2:
            return get_chatgpt_response("Generate a realistic everyday persona. Avoid making the persona feel overly unique or \"special.\" They should represent an average person with strengths and  flaws that are relatable to most people.",messages,temp,model)
            # batch mean F: 4.32
        case 3:
            return get_chatgpt_response("Think of a Pool of 1000 students with different characteristics representing the world population. Now take one random person from this group of 1000 and define its Persona",messages,temp,model)
        case _:
            raise ValueError(f"Unknown mode: {mode}")