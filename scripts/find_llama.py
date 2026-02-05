"""
Search for llama-cli.exe and .gguf model files
"""
import os
from pathlib import Path

def search_file(filename, search_paths):
    """Search for a file in given paths"""
    found = []
    for base_path in search_paths:
        if not os.path.exists(base_path):
            continue
        try:
            for root, dirs, files in os.walk(base_path):
                if filename in files:
                    full_path = os.path.join(root, filename)
                    found.append(full_path)
                    print(f"Found: {full_path}")
        except PermissionError:
            pass
    return found

def search_pattern(pattern, search_paths):
    """Search for files matching pattern"""
    found = []
    for base_path in search_paths:
        if not os.path.exists(base_path):
            continue
        try:
            for root, dirs, files in os.walk(base_path):
                for file in files:
                    if pattern in file.lower():
                        full_path = os.path.join(root, file)
                        found.append(full_path)
                        print(f"Found: {full_path}")
        except PermissionError:
            pass
    return found

if __name__ == "__main__":
    print("=" * 60)
    print("Searching for Llama files...")
    print("=" * 60)
    print()
    
    username = os.environ.get('USERNAME', 'Yachen')
    search_paths = [
        f"C:\\Users\\{username}\\Documents",
        f"C:\\Users\\{username}\\Downloads",
        "D:\\",
        "E:\\",
        "C:\\Program Files",
    ]
    
    print("Searching for llama-cli.exe...")
    print("-" * 60)
    llama_cli = search_file("llama-cli.exe", search_paths)
    
    print()
    print("Searching for llama.exe...")
    print("-" * 60)
    llama_exe = search_file("llama.exe", search_paths)
    
    print()
    print("Searching for .gguf model files (Llama-3.1-8B)...")
    print("-" * 60)
    gguf_files = search_pattern(".gguf", search_paths)
    
    print()
    print("=" * 60)
    print("Summary:")
    print("=" * 60)
    if llama_cli:
        print(f"Llama CLI found: {len(llama_cli)} file(s)")
        for f in llama_cli:
            print(f"  - {f}")
    elif llama_exe:
        print(f"Llama executable found: {len(llama_exe)} file(s)")
        for f in llama_exe:
            print(f"  - {f}")
    else:
        print("Llama CLI not found")
    
    print()
    if gguf_files:
        print(f"GGUF model files found: {len(gguf_files)} file(s)")
        for f in gguf_files[:10]:  # Show first 10
            print(f"  - {f}")
        if len(gguf_files) > 10:
            print(f"  ... and {len(gguf_files) - 10} more")
    else:
        print("No .gguf model files found")
    
    print()
    print("=" * 60)
    input("Press Enter to exit...")
