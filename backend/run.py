from app import create_app, socketio

app = create_app()

@socketio.on('connect')
def handle_connect():
    print("Client connected")

@socketio.on('join_event')
def handle_join_event(data):
    from flask_socketio import join_room
    event_id = data.get('eventId')
    if event_id:
        room = f"event:{event_id}:dashboard"
        join_room(room)
        print(f"Client joined room: {room}")

@socketio.on('join_ticket')
def handle_join_ticket(data):
    from flask_socketio import join_room
    reg_id = data.get('registrationId')
    if reg_id:
        room = f"ticket:{reg_id}"
        join_room(room)
        print(f"Client joined ticket room: {room}")

@socketio.on('disconnect')
def handle_disconnect():
    print("Client disconnected")

import logging

# Suppress the continuous Socket.IO HTTP polling logs and development warnings
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

if __name__ == '__main__':
    # We pass log_output=False to explicitly silence Werkzeug's HTTP request logs
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True, log_output=False)
