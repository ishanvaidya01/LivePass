from functools import wraps
from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            verify_jwt_in_request()
        except Exception as e:
            return jsonify({"error": "Missing or invalid token"}), 401
        return fn(*args, **kwargs)

    return wrapper


def require_role(roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            try:
                verify_jwt_in_request()
                claims = get_jwt()
                user_role = claims.get("role")
                if not user_role:
                    return jsonify({"error": "Unauthorized"}), 401
                if user_role not in roles:
                    return (
                        jsonify({"error": "Forbidden: Insufficient permissions"}),
                        403,
                    )
            except Exception as e:
                return jsonify({"error": "Missing or invalid token"}), 401
            return fn(*args, **kwargs)

        return wrapper

    return decorator


# Helper to get current user info similar to req.user
def get_current_user():
    claims = get_jwt()
    return {"userId": claims.get("userId"), "role": claims.get("role")}
