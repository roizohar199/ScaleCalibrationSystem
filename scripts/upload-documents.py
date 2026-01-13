#!/usr/bin/env python3
"""
Script להעלאת מסמכי DOCX דרך API
שימוש: python scripts/upload-documents.py <path-to-zip-file>
"""

import sys
import json
import requests
import os

API_URL = "http://localhost:4010"
EMAIL = "office@local"
PASSWORD = "1234"

def main():
    # Get zip file path
    zip_path = sys.argv[1] if len(sys.argv) > 1 else "../../test-import.zip"
    zip_path = os.path.abspath(zip_path)
    
    if not os.path.exists(zip_path):
        print(f"Error: File not found: {zip_path}")
        sys.exit(1)
    
    print("=== Document Upload Script ===\n")
    
    # Login
    print("Logging in...")
    login_data = {"email": EMAIL, "password": PASSWORD}
    try:
        login_response = requests.post(f"{API_URL}/auth/login", json=login_data)
        login_response.raise_for_status()
        token = login_response.json()["token"]
        print("Login successful!\n")
    except Exception as e:
        print(f"Login failed: {e}")
        sys.exit(1)
    
    # Upload file
    file_size = os.path.getsize(zip_path)
    print(f"Uploading: {zip_path}")
    print(f"File size: {file_size / 1024 / 1024:.2f} MB\n")
    
    try:
        with open(zip_path, 'rb') as f:
            files = {'file': (os.path.basename(zip_path), f, 'application/zip')}
            headers = {'Authorization': f'Bearer {token}'}
            response = requests.post(f"{API_URL}/imports/documents", files=files, headers=headers)
            response.raise_for_status()
            result = response.json()
        
        print("=== Upload Results ===")
        print(f"Processed: {result['processed']} documents")
        
        if result.get('errors') and len(result['errors']) > 0:
            print(f"\nErrors ({len(result['errors'])}):")
            for i, error in enumerate(result['errors'], 1):
                print(f"  {i}. {error}")
        else:
            print("No errors!")
        
        print("\nDone!")
        
    except Exception as e:
        print(f"\nUpload failed!")
        print(f"Error: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")
        sys.exit(1)

if __name__ == "__main__":
    main()

