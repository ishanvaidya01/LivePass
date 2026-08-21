from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_socketio import SocketIO
from dotenv import load_dotenv
import os

from .models import db

load_dotenv(dotenv_path="../.env")

jwt = JWTManager()
socketio = SocketIO(cors_allowed_origins="*")


def create_app():
    app = Flask(__name__)
    CORS(app)

    db_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://checkedin_user:checkedin_password@localhost:5433/checkedin",
    )
    if "?schema=" in db_url:
        db_url = db_url.split("?schema=")[0]
    app.config["SQLALCHEMY_DATABASE_URI"] = db_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET", "fallback_secret_key")
    app.config["JWT_TOKEN_LOCATION"] = ["headers", "query_string"]
    app.config["JWT_QUERY_STRING_NAME"] = "token"

    db.init_app(app)
    jwt.init_app(app)
    socketio.init_app(app)

    # Register blueprints
    from .routes.auth import auth_bp
    from .routes.events import events_bp
    from .routes.registrations import registrations_bp
    from .routes.scan import scan_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(events_bp, url_prefix="/api/events")
    app.register_blueprint(registrations_bp, url_prefix="/api/registrations")
    app.register_blueprint(scan_bp, url_prefix="/api/events")

    return app
