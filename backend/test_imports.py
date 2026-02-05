"""
Test if all dependencies are installed correctly
"""
import sys

def test_imports():
    errors = []
    
    try:
        import fastapi
        print(f"[OK] FastAPI {fastapi.__version__}")
    except ImportError as e:
        errors.append(f"FastAPI: {e}")
        print(f"[X] FastAPI import failed")
    
    try:
        import uvicorn
        print(f"[OK] Uvicorn {uvicorn.__version__}")
    except ImportError as e:
        errors.append(f"Uvicorn: {e}")
        print(f"[X] Uvicorn import failed")
    
    try:
        import multipart
        print(f"[OK] python-multipart installed")
    except ImportError as e:
        errors.append(f"python-multipart: {e}")
        print(f"[X] python-multipart import failed")
    
    try:
        import pydantic
        print(f"[OK] Pydantic {pydantic.__version__}")
    except ImportError as e:
        errors.append(f"Pydantic: {e}")
        print(f"[X] Pydantic import failed")
    
    if errors:
        print("\n" + "="*60)
        print("IMPORT ERRORS:")
        for error in errors:
            print(f"  - {error}")
        print("="*60)
        sys.exit(1)
    else:
        print("\n" + "="*60)
        print("ALL DEPENDENCIES INSTALLED CORRECTLY!")
        print("="*60)
        sys.exit(0)

if __name__ == "__main__":
    test_imports()
