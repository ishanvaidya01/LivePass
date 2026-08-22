# LivePass 

LivePass is a production-grade, real-time event check-in platform engineered to handle massive concurrent traffic, offline resiliency, and strict security constraints. Built for large-scale events and hackathons.

##  Core Features

- **Concurrency-Safe Registration**: Powered by PostgreSQL row-level locking (`SELECT ... FOR UPDATE`). If 500 people try to claim the last 50 tickets simultaneously, exactly 50 will succeed, with 0 database race conditions.
- **Offline-First Scanning**: Venue WiFi went down? No problem. The HTML5 QR scanner uses IndexedDB to safely queue check-ins offline, syncing them via a robust idempotency key mechanism the second the device reconnects.
- **Rotating QR Security**: Attendees are issued dynamic QR codes on their live ticket that rotate constantly. Screenshots are useless, virtually eliminating ticket sharing and fraud.
- **Real-Time Live Feed**: The Organizer dashboard is powered by WebSockets (Socket.IO). When a volunteer scans a ticket at Gate A, the Organizer sees the check-in flash on their screen instantly, without refreshing.

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, Html5Qrcode, IndexedDB
- **Backend**: Python, Flask, Flask-SocketIO, SQLAlchemy
- **Database**: PostgreSQL

## Setup & Running Locally

### 1. Prerequisites
- **Python 3.10+**
- **Node.js (v18+)**
- **PostgreSQL**: Must be installed and running on your system.

### 2. Database & Backend Configuration
Create a `.env` file in the `backend` directory with the following variables:
```env
# Connection string for your local PostgreSQL database
DATABASE_URL="postgresql://postgres:password@localhost:5432/livepass_db"

# Secret key for JWT Authentication (can be any random string)
JWT_SECRET="your_secure_jwt_secret"

# Required for AI Insights on the Organizer Dashboard
GEMINI_API_KEY="your_google_gemini_api_key"
```

### 3. Start the Backend Server
Open a terminal and navigate to the `/backend` directory:
```bash
# Create a virtual environment
python -m venv venv

# Activate the virtual environment
venv\Scripts\activate      # Windows
# source venv/bin/activate # Mac/Linux

# Install all Python dependencies
pip install -r requirements.txt

# Start the Flask API & WebSocket Server
python -m flask run --port 5000
```
*(Note: The database tables will be created automatically the first time the server starts).*

### 4. Frontend Configuration
Create a `.env` file in the `frontend` directory:
```env
VITE_API_URL="http://127.0.0.1:5000/api"
VITE_SOCKET_URL="http://127.0.0.1:5000"
```

### 5. Start the Frontend Application
Open a new terminal and navigate to the `/frontend` directory:
```bash
# Install Node dependencies
npm install

# Start the Vite development server
npm run dev
```

### 6. Access the Platform
- **App URL**: Open your browser and go to `http://localhost:5173`
- **Sign Up**: Create a new account.
  - Choose **ORGANIZER** if you want to create events, view AI insights, and access the scanning dashboard.
  - Choose **ATTENDEE** if you want to register for events and view your live QR ticket.

## Load Testing
You can mathematically verify the concurrency safety of the registration endpoint by running the included Python load testing script:
```bash
cd backend
python test_concurrency.py
```
This script spawns a ThreadPool to fire 150 simultaneous registrations at a 50-person capacity event, proving that the limit is never exceeded.
