from app import create_app, socketio

app = create_app()

import logging

# Suppress the continuous Socket.IO HTTP polling logs and development warnings
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

if __name__ == '__main__':
    # We pass log_output=False to explicitly silence Werkzeug's HTTP request logs
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True, log_output=False)
