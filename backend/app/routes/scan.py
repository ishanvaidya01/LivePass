from flask import Blueprint, request, jsonify
from datetime import datetime
from sqlalchemy.exc import IntegrityError
from flask_socketio import emit
import pytz

from ..models import db, CheckInToken, CheckIn, Event, AuditLog, CheckInSource
from ..utils.auth import require_auth, require_role, get_current_user

scan_bp = Blueprint('scan', __name__)

@scan_bp.route('/<id>/scan', methods=['POST'])
@require_auth
@require_role(['ORGANIZER'])
def scan_qr(id):
    data = request.get_json() or {}
    token = data.get('token')
    station_id = data.get('stationId')
    idempotency_key = data.get('idempotencyKey')
    
    if not token:
        return jsonify({"error": "Token is required"}), 400
        
    clean_token = token.strip()
    
    try:
        import jwt
        try:
            # We don't verify the signature here because the jti is checked against the DB
            # and we want to tolerate expired tokens so we can return a proper "QR expired" error
            decoded = jwt.decode(clean_token, options={"verify_signature": False})
            jti = decoded.get('j', clean_token)
            reg_id = decoded.get('r')
        except Exception:
            jti = clean_token
            reg_id = None

        if reg_id:
            token_record = CheckInToken.query.filter_by(registrationId=reg_id).first()
            if not token_record or token_record.token != jti:
                from .. import socketio
                socketio.emit('ticket_error', {"error": "outdated"}, to=f"ticket:{reg_id}")
                return jsonify({"error": "QR expired — ask attendee to refresh."}), 400
        else:
            token_record = CheckInToken.query.filter_by(token=jti).first()
            if not token_record:
                return jsonify({"error": "Invalid QR token."}), 400
            
        registration = token_record.registration
        
        # 1. CHECK IF ALREADY CHECKED IN FIRST
        existing_checkin = CheckIn.query.filter_by(registrationId=registration.id).first()
        if existing_checkin:
            if idempotency_key and existing_checkin.idempotencyKey == idempotency_key:
                return jsonify({"status": "SUCCESS", "checkIn": {"id": existing_checkin.id, "checkedInAt": existing_checkin.checkedInAt.isoformat() + "Z"}}), 200
            
            # Convert UTC database time to IST for human-readable error message
            ist_tz = pytz.timezone('Asia/Kolkata')
            dt_utc = existing_checkin.checkedInAt.replace(tzinfo=pytz.UTC) if existing_checkin.checkedInAt.tzinfo is None else existing_checkin.checkedInAt
            dt_ist = dt_utc.astimezone(ist_tz)
            time_str = dt_ist.strftime("%I:%M %p")
            
            return jsonify({"error": f"Already checked in at {time_str}"}), 409
            
        # 2. CHECK IF EVENT MATCHES
        if registration.eventId != id:
            from .. import socketio
            socketio.emit('ticket_error', {"error": "invalid_event"}, to=f"ticket:{registration.id}")
            return jsonify({"error": "QR is for a different event."}), 400
            
        # 3. CHECK TIME EXPIRATION
        now = datetime.utcnow().replace(tzinfo=pytz.UTC)
        expires_at = token_record.expiresAt
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=pytz.UTC)
            
        if expires_at < now:
            from .. import socketio
            if reg_id:
                socketio.emit('ticket_error', {"error": "outdated"}, to=f"ticket:{reg_id}")
            return jsonify({"error": "QR expired — ask attendee to refresh."}), 400
            

        checkin = CheckIn(
            registrationId=registration.id,
            stationId=station_id,
            source=CheckInSource.ONLINE,
            idempotencyKey=idempotency_key
        )
        db.session.add(checkin)
        
        # Use row-level locking to ensure atomic increment of checkedInCount
        event = Event.query.with_for_update().get(id)
        if event:
            event.checkedInCount += 1
            
        db.session.flush()
        
        organizer = get_current_user()
        audit = AuditLog(
            actorId=organizer['userId'],
            action='QR_SCAN_CHECKIN',
            entity='CheckIn',
            entityId=checkin.id,
            metadata_={"stationId": station_id, "idempotencyKey": idempotency_key}
        )
        db.session.add(audit)
        
        db.session.commit()
        
        # Fire socket event
        from .. import socketio
        checkin_payload = {
            "registrationId": registration.id,
            "userId": registration.userId,
            "userName": registration.user.name,
            "checkedInAt": checkin.checkedInAt.isoformat() + "Z",
            "stationId": station_id
        }
        
        # Notify the organizer dashboard
        socketio.emit('checkin_success', checkin_payload, to=f"event:{id}:dashboard")
        
        # Notify the attendee's live ticket view
        socketio.emit('ticket_verified', checkin_payload, to=f"ticket:{registration.id}")
        
        return jsonify({"status": "SUCCESS", "checkIn": {"id": checkin.id, "checkedInAt": checkin.checkedInAt.isoformat() + "Z"}}), 200
        
    except IntegrityError as e:
        db.session.rollback()
        # This occurs if registrationId already has a CheckIn (P2002)
        token_record = CheckInToken.query.filter_by(token=jti).first()
        if token_record:
            original = CheckIn.query.filter_by(registrationId=token_record.registrationId).first()
            if original:
                if idempotency_key and original.idempotencyKey == idempotency_key:
                    return jsonify({"status": "SUCCESS", "checkIn": {"id": original.id, "checkedInAt": original.checkedInAt.isoformat() + "Z"}}), 200
                
                time_str = original.checkedInAt.strftime("%I:%M %p") if original.checkedInAt else "unknown time"
                return jsonify({"error": f"Already checked in at {time_str}"}), 409
        
        return jsonify({"error": "Database integrity error"}), 409
    except Exception as e:
        db.session.rollback()
        print(f"Scan error: {e}")
        return jsonify({"error": "Internal server error"}), 500
