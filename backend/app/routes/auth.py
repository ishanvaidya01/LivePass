from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token
import bcrypt
from datetime import timedelta
from ..models import db, User, Role

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/signup", methods=["POST"])
def signup():
    try:
        data = request.get_json()
        email = data.get("email")
        password = data.get("password")
        name = data.get("name")
        role_str = data.get("role")

        if not email or not password or not name:
            return jsonify({"error": "Missing required fields"}), 400

        existing_user = User.query.filter_by(email=email).first()
        if existing_user:
            return jsonify({"error": "User already exists"}), 409

        hashed_password = bcrypt.hashpw(
            password.encode("utf-8"), bcrypt.gensalt()
        ).decode("utf-8")

        role = Role.ORGANIZER if role_str == "ORGANIZER" else Role.ATTENDEE

        new_user = User(email=email, password=hashed_password, name=name, role=role)

        db.session.add(new_user)
        db.session.commit()

        # The payload structure needs to match exactly what Next.js expects:
        # jwt.sign({ userId: user.id, role: user.role }...
        access_token = create_access_token(
            identity=new_user.id,
            additional_claims={"userId": new_user.id, "role": new_user.role.value},
            expires_delta=timedelta(days=7),
        )

        return (
            jsonify(
                {
                    "token": access_token,
                    "user": {
                        "id": new_user.id,
                        "email": new_user.email,
                        "name": new_user.name,
                        "role": new_user.role.value,
                    },
                }
            ),
            201,
        )

    except Exception as e:
        print(f"Signup error: {e}", flush=True)
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@auth_bp.route("/login", methods=["POST"])
def login():
    try:
        data = request.get_json()
        email = data.get("email")
        password = data.get("password")

        if not email or not password:
            return jsonify({"error": "Missing credentials"}), 400

        user = User.query.filter_by(email=email).first()
        if not user:
            return jsonify({"error": "Invalid credentials"}), 401

        if not bcrypt.checkpw(password.encode("utf-8"), user.password.encode("utf-8")):
            return jsonify({"error": "Invalid credentials"}), 401

        access_token = create_access_token(
            identity=user.id,
            additional_claims={"userId": user.id, "role": user.role.value},
            expires_delta=timedelta(days=7),
        )

        return (
            jsonify(
                {
                    "token": access_token,
                    "user": {
                        "id": user.id,
                        "email": user.email,
                        "name": user.name,
                        "role": user.role.value,
                    },
                }
            ),
            200,
        )

    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({"error": "Internal server error"}), 500
