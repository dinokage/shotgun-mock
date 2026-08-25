import os
import sys
import requests

def main():
    api_url = os.environ.get("API_URL", "http://localhost:3001/api")
    email = os.environ.get("DCC_EMAIL", "artist@acme.com")
    password = os.environ.get("DCC_PASSWORD", "password123")

    print(f"Testing against API: {api_url}")

    # 1. Login
    print("\n1. Logging in...")
    session = requests.Session()
    login_res = session.post(f"{api_url}/auth/login", json={"email": email, "password": password})
    
    if login_res.status_code != 200:
        print(f"Login failed: {login_res.text}")
        sys.exit(1)
        
    print("Login successful.")

    # 2. List Tasks
    print("\n2. Fetching Tasks...")
    tasks_res = session.get(f"{api_url}/tasks")
    if tasks_res.status_code != 200:
        print(f"Failed to fetch tasks: {tasks_res.text}")
        sys.exit(1)
        
    tasks = tasks_res.json()
    print(f"Found {len(tasks)} total tasks.")
    
    # 3. Publish Version (Mock)
    if not tasks:
        print("No tasks found to publish against.")
        return
        
    target_task = tasks[0]
    print(f"\n3. Publishing Version for Task: {target_task['name']} (ID: {target_task['id']})")
    
    # Simulate publish by adding a review/publish endpoint or just updating task
    # Note: Depending on actual implemented endpoints in api-server
    # For now, let's just update the status to 'review' or 'done'
    update_res = session.patch(f"{api_url}/tasks/{target_task['id']}", json={"status": "review"})
    if update_res.status_code == 200:
        print("Task status updated to 'review' successfully.")
    else:
        print(f"Failed to update task: {update_res.text}")
        
    print("\nDCC Integration Test Complete!")

if __name__ == "__main__":
    main()
