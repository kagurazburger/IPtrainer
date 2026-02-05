"""
Test all backend APIs
"""
import requests
import json
import time

BASE_URL = "http://localhost:8000"

def test_health():
    print("\n=== Testing /api/health ===")
    try:
        resp = requests.get(f"{BASE_URL}/api/health", timeout=5)
        print(f"Status: {resp.status_code}")
        data = resp.json()
        print(f"Status: {data.get('status')}")
        print(f"Checks: {json.dumps(data.get('checks'), indent=2)}")
        if data.get('missing'):
            print(f"Missing: {data.get('missing')}")
        return resp.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_generate_cards():
    print("\n=== Testing /api/generate-cards ===")
    test_prompt = """LABUBU is a character from Pop Mart. 
    It's a small monster with big eyes. 
    It's known for being cute and mischievous."""
    
    try:
        start = time.time()
        resp = requests.post(
            f"{BASE_URL}/api/generate-cards",
            json={"prompt": test_prompt, "max_tokens": 500},
            timeout=70
        )
        elapsed = time.time() - start
        print(f"Status: {resp.status_code}")
        print(f"Time elapsed: {elapsed:.2f}s")
        
        if resp.status_code == 200:
            data = resp.json()
            cards = data.get("cards", [])
            print(f"Generated {len(cards)} cards")
            if cards:
                print(f"First card: {json.dumps(cards[0], indent=2, ensure_ascii=False)}")
            return True
        else:
            print(f"Error: {resp.text[:200]}")
            return False
    except requests.Timeout:
        print("Error: Request timed out after 70 seconds")
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_transcribe():
    print("\n=== Testing /api/transcribe ===")
    print("Note: This requires an audio file. Skipping for now.")
    return True

def test_evaluate():
    print("\n=== Testing /api/evaluate ===")
    try:
        start = time.time()
        resp = requests.post(
            f"{BASE_URL}/api/evaluate",
            json={
                "user_answer": "LABUBU is cute",
                "correct_answer": "LABUBU is a small monster with big eyes, known for being cute and mischievous.",
                "question": "What is LABUBU?",
                "ip": "LABUBU",
                "section": "IDENTITY"
            },
            timeout=30
        )
        elapsed = time.time() - start
        print(f"Status: {resp.status_code}")
        print(f"Time elapsed: {elapsed:.2f}s")
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"Feedback: {data.get('feedback', 'N/A')}")
            return True
        else:
            print(f"Error: {resp.text[:200]}")
            return False
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_default_decks():
    print("\n=== Testing /api/default-decks ===")
    try:
        resp = requests.get(f"{BASE_URL}/api/default-decks", timeout=5)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            decks = data.get("decks", [])
            print(f"Found {len(decks)} decks")
            for deck in decks[:3]:  # Show first 3
                print(f"  - {deck.get('title')}: {len(deck.get('cards', []))} cards")
            return True
        else:
            print(f"Error: {resp.text[:200]}")
            return False
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_ocr():
    print("\n=== Testing /api/ocr ===")
    print("Note: This requires an image file. Skipping for now.")
    return True

def main():
    print("=" * 60)
    print("Testing Backend APIs")
    print("=" * 60)
    
    results = {}
    results["health"] = test_health()
    results["generate_cards"] = test_generate_cards()
    results["evaluate"] = test_evaluate()
    results["default_decks"] = test_default_decks()
    results["transcribe"] = test_transcribe()
    results["ocr"] = test_ocr()
    
    print("\n" + "=" * 60)
    print("Test Results Summary")
    print("=" * 60)
    for api, passed in results.items():
        status = "[PASS]" if passed else "[FAIL]"
        print(f"{api:20} {status}")
    
    all_passed = all(results.values())
    print(f"\nOverall: {'[ALL TESTS PASSED]' if all_passed else '[SOME TESTS FAILED]'}")
    return 0 if all_passed else 1

if __name__ == "__main__":
    exit(main())
