from flask import Blueprint, request, jsonify
from sqlalchemy.orm import joinedload
from datetime import datetime, timedelta
import os

from ..models import (
    db,
    Registration,
    Event,
    CheckIn,
    AuditLog,
    CheckInToken,
    RegistrationStatus,
    CheckInSource,
)
from ..utils.auth import require_auth, require_role, get_current_user

registrations_bp = Blueprint("registrations", __name__)


@registrations_bp.route("/me", methods=["GET"])
@require_auth
def get_my_registrations():
    try:
        user = get_current_user()
        registrations = (
            Registration.query.options(joinedload(Registration.event))
            .filter_by(userId=user["userId"])
            .all()
        )
        checkins = (
            CheckIn.query.filter(
                CheckIn.registrationId.in_([r.id for r in registrations])
            ).all()
            if registrations
            else []
        )
        checked_in_reg_ids = set(c.registrationId for c in checkins)

        return (
            jsonify(
                [
                    {
                        "id": r.id,
                        "userId": r.userId,
                        "eventId": r.eventId,
                        "status": r.status.value,
                        "isCheckedIn": r.id in checked_in_reg_ids,
                        "event": {
                            "id": r.event.id,
                            "name": r.event.name,
                            "date": r.event.date.isoformat() if r.event.date else None,
                            "venue": r.event.venue,
                        },
                    }
                    for r in registrations
                ]
            ),
            200,
        )
    except Exception as e:
        print(f"Fetch my registrations error: {e}")
        return jsonify({"error": "Internal server error"}), 500


@registrations_bp.route("/<id>/cancel", methods=["POST"])
@require_auth
def cancel_registration(id):
    try:
        user = get_current_user()
        user_id = user["userId"]

        reg = Registration.query.get(id)
        if not reg or reg.userId != user_id:
            return jsonify({"error": "Registration not found"}), 404

        if reg.status == RegistrationStatus.CANCELLED:
            return jsonify({"error": "Already cancelled"}), 400

        was_registered = reg.status == RegistrationStatus.REGISTERED
        reg.status = RegistrationStatus.CANCELLED

        if was_registered:
            next_waitlisted = (
                Registration.query.filter_by(
                    eventId=reg.eventId, status=RegistrationStatus.WAITLISTED
                )
                .order_by(Registration.createdAt.asc())
                .first()
            )

            if next_waitlisted:
                next_waitlisted.status = RegistrationStatus.REGISTERED
                audit = AuditLog(
                    actorId=user_id,
                    action="WAITLIST_PROMOTION",
                    entity="Registration",
                    entityId=next_waitlisted.id,
                    metadata_={"reason": f"Promoted due to cancellation of {id}"},
                )
                db.session.add(audit)
            else:
                event = Event.query.get(reg.eventId)
                if event and event.registeredCount > 0:
                    event.registeredCount -= 1

        audit_cancel = AuditLog(
            actorId=user_id,
            action="REGISTRATION_CANCELLED",
            entity="Registration",
            entityId=id,
            metadata_={"status": "CANCELLED"},
        )
        db.session.add(audit_cancel)

        db.session.commit()
        return jsonify({"id": reg.id, "status": "CANCELLED"}), 200

    except Exception as e:
        db.session.rollback()
        print(f"Cancellation error: {e}")
        return jsonify({"error": "Internal server error"}), 500


@registrations_bp.route("/<id>/manual-checkin", methods=["POST"])
@require_auth
@require_role(["ORGANIZER"])
def manual_checkin(id):
    try:
        organizer = get_current_user()
        data = request.get_json() or {}
        reason = data.get("reason", "Manual override")
        station_id = data.get("stationId")

        reg = Registration.query.get(id)
        if not reg:
            return jsonify({"error": "Registration not found"}), 404
        if reg.status != RegistrationStatus.REGISTERED:
            return jsonify({"error": "Cannot check-in non-registered user"}), 400

        # Check uniqueness manually to prevent unhandled IntegrityError block
        existing_checkin = CheckIn.query.filter_by(registrationId=id).first()
        if existing_checkin:
            time_str = existing_checkin.checkedInAt.strftime("%I:%M %p")
            return jsonify({"error": f"Already checked in at {time_str}"}), 409

        checkin = CheckIn(
            registrationId=id,
            stationId=station_id,
            source=CheckInSource.MANUAL_OVERRIDE,
        )
        db.session.add(checkin)

        event = Event.query.get(reg.eventId)
        if event:
            event.checkedInCount += 1

        db.session.flush()  # get checkin id

        audit = AuditLog(
            actorId=organizer["userId"],
            action="MANUAL_OVERRIDE",
            entity="CheckIn",
            entityId=checkin.id,
            metadata_={"reason": reason, "registrationId": id},
        )
        db.session.add(audit)

        db.session.commit()

        # Socket emission should ideally happen here

        return jsonify({"status": "SUCCESS"}), 200

    except Exception as e:
        db.session.rollback()
        print(f"Manual checkin error: {e}")
        return jsonify({"error": "Internal server error"}), 500


@registrations_bp.route("/<id>/token", methods=["GET"])
@require_auth
def generate_token(id):
    try:
        user = get_current_user()
        reg = Registration.query.options(
            joinedload(Registration.event), joinedload(Registration.user)
        ).get(id)

        if not reg or reg.userId != user["userId"]:
            return jsonify({"error": "Registration not found"}), 404

        if reg.status != RegistrationStatus.REGISTERED:
            return (
                jsonify({"error": "Only active registrations can generate tokens"}),
                400,
            )

        existing_checkin = CheckIn.query.filter_by(registrationId=id).first()
        if existing_checkin:
            return (
                jsonify(
                    {
                        "alreadyCheckedIn": True,
                        "event": {
                            "name": reg.event.name,
                            "date": reg.event.date.isoformat(),
                            "venue": reg.event.venue,
                        },
                    }
                ),
                200,
            )

        import jwt
        from flask import current_app

        raw_token = os.urandom(
            8
        ).hex()  # 16 chars is enough entropy for a 120s token, reduces QR density
        expires_at = datetime.utcnow() + timedelta(seconds=120)

        # Minimal payload for smallest possible QR code
        payload = {"j": raw_token, "r": id, "n": reg.user.name}
        jwt_token = jwt.encode(
            payload, current_app.config["JWT_SECRET_KEY"], algorithm="HS256"
        )

        token_record = CheckInToken.query.filter_by(registrationId=id).first()
        if token_record:
            token_record.token = raw_token
            token_record.expiresAt = expires_at
        else:
            token_record = CheckInToken(
                registrationId=id, token=raw_token, expiresAt=expires_at
            )
            db.session.add(token_record)

        db.session.commit()

        # Output isoformat with Z for Javascript compatibility
        return (
            jsonify(
                {
                    "token": jwt_token,
                    "expiresAt": token_record.expiresAt.isoformat() + "Z",
                    "event": {
                        "name": reg.event.name,
                        "date": reg.event.date.isoformat(),
                        "venue": reg.event.venue,
                    },
                    "user": {"name": reg.user.name, "email": reg.user.email},
                }
            ),
            200,
        )

    except Exception as e:
        db.session.rollback()
        print(f"Token generation error: {e}")
        return jsonify({"error": "Internal server error"}), 500
