import requests
import json
import time

# Wait for server to start
time.sleep(2)

# Test process-text endpoint
url = 'http://localhost:8000/api/process-text'
headers = {'Content-Type': 'application/json'}
data = {
    'text': 'This is a test document about Python programming. Python is a high-level programming language.',
    'model': 'deepseek-chat'
}

try:
    response = requests.post(url, headers=headers, json=data, timeout=30)
    print(f'Status Code: {response.status_code}')
    if response.status_code == 200:
        result = response.json()
        print('Success! Cards generated:')
        for i, card in enumerate(result.get('cards', [])):
            front = card.get('front', '')[:50]
            print(f'Card {i+1}: {front}...')
            if 'outline' in card:
                outline = card['outline'][:100]
                print(f'  Outline: {outline}...')
        print(f'Total cards: {len(result.get("cards", []))}')
    else:
        print(f'Error: {response.text}')
except Exception as e:
    print(f'Exception: {e}')