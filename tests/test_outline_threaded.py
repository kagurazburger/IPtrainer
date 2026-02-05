import threading
import time
import requests
import json
import sys
import os

# Add backend to path
sys.path.append('backend')

def start_server():
    try:
        import uvicorn
        from main import app
        print('Starting server...')
        uvicorn.run(app, host='0.0.0.0', port=8000)
    except Exception as e:
        print(f'Server error: {e}')

def test_api():
    time.sleep(3)  # Wait for server to start

    # Test process-text endpoint with file upload
    url = 'http://localhost:8000/api/process-text'

    # Create a test file
    test_content = 'This is a test document about Python programming. Python is a high-level programming language.'
    with open('test_doc.txt', 'w', encoding='utf-8') as f:
        f.write(test_content)

    try:
        with open('test_doc.txt', 'rb') as f:
            files = {'file': ('test_doc.txt', f, 'text/plain')}
            data = {'system_prompt': 'Generate flashcards from this document'}
            response = requests.post(url, files=files, data=data, timeout=30)

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
    finally:
        # Clean up test file
        if os.path.exists('test_doc.txt'):
            os.remove('test_doc.txt')

if __name__ == '__main__':
    # Start server in background thread
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    # Run test
    test_api()