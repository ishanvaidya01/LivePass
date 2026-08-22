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
- Python 3.10+
- Node.js (v18+)
- PostgreSQL Database

### 2. Database Configuration
Ensure PostgreSQL is running. Create a `.env` file in the `backend` directory:
```env
DATABASE_URL="postgresql://username:password@localhost:5432/checkedin"
JWT_SECRET="your_secure_jwt_secret"
```

### 3. Start the Backend
Open a terminal in the `/backend` directory:
```bash
# Create a virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Start the Flask API & WebSocket Server
python -m flask run --port 5000
```

### 4. Start the Frontend
Open a terminal in the `/frontend` directory:
```bash
# Install dependencies
npm install

# Start the Vite development server
npm run dev
```

### 5. Access the Platform
- **App URL**: `http://localhost:5173` (or the port Vite provides)
- **Sign Up**: Create an account. Choose "ORGANIZER" to create events and access the scanning dashboard, or "ATTENDEE" to register for events and view your live QR ticket.

## Load Testing
You can mathematically verify the concurrency safety of the registration endpoint by running the included Python load testing script:
```bash
cd backend
python test_concurrency.py
```
This script spawns a ThreadPool to fire 150 simultaneous registrations at a 50-person capacity event, proving that the limit is never exceeded.
