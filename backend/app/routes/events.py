from flask import Blueprint, request, jsonify, Response
from sqlalchemy import func
from datetime import datetime
import re
import pytz
from ..models import db, Event, EventStatus, Registration, RegistrationStatus, CheckInToken, CheckIn, AuditLog, User
from ..utils.auth import require_auth, require_role, get_current_user
from ..services.ai_insights import generate_insights
# from ..services.mailer import send_qr_confirmation_email # To be implemented

events_bp = Blueprint('events', __name__)

@events_bp.route('', methods=['GET'])
def get_all_events():
    try:
        events = Event.query.order_by(Event.date.asc()).all()
        return jsonify([{
            "id": e.id, "name": e.name, "date": e.date.isoformat() if e.date else None,
            "venue": e.venue, "capacity": e.capacity, "registeredCount": e.registeredCount,
            "checkedInCount": e.checkedInCount, "description": e.description,
            "bannerImage": e.bannerImage, "status": e.status.value
        } for e in events]), 200
    except Exception as e:
        return jsonify({"error": str(e) or "Internal server error"}), 500

@events_bp.route('/<id>', methods=['DELETE'])
@require_auth
@require_role(['ORGANIZER'])
def delete_event(id):
    try:
        event = Event.query.get(id)
        if not event:
            return jsonify({"error": "Event not found"}), 404
            
        registrations = Registration.query.filter_by(eventId=id).all()
        reg_ids = [r.id for r in registrations]
        
        if reg_ids:
            CheckInToken.query.filter(CheckInToken.registrationId.in_(reg_ids)).delete(synchronize_session=False)
            CheckIn.query.filter(CheckIn.registrationId.in_(reg_ids)).delete(synchronize_session=False)
            Registration.query.filter_by(eventId=id).delete(synchronize_session=False)
            
        db.session.delete(event)
        db.session.commit()
        return jsonify({"success": True}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Delete event error: {e}")
        return jsonify({"error": str(e) or "Internal server error"}), 500

@events_bp.route('', methods=['POST'])
@require_auth
@require_role(['ORGANIZER'])
def create_event():
    try:
        data = request.get_json()
        organizer = get_current_user()
        
        date_str = data.get('date')
        parsed_date = None
        
        try:
            # ISO format parsing
            if 'T' in date_str:
                parsed_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            else:
                # Fallback for DD-MM-YYYY HH:mm
                match = re.match(r'^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})', date_str)
                if match:
                    parsed_date = datetime.fromisoformat(f"{match.group(3)}-{match.group(2)}-{match.group(1)}T{match.group(4)}:{match.group(5)}:00")
        except:
            pass
            
        if not parsed_date:
            return jsonify({"error": "Invalid date format provided."}), 400

        event = Event(
            name=data.get('name'),
            date=parsed_date,
            venue=data.get('venue'),
            capacity=int(data.get('capacity')),
            description=data.get('description'),
            bannerImage=data.get('bannerImage'),
            status=EventStatus.PUBLISHED
        )
        db.session.add(event)
        db.session.flush() # to get event.id
        
        audit_log = AuditLog(
            actorId=organizer['userId'],
            action='EVENT_CREATED',
            entity='Event',
            entityId=event.id,
            metadata_={"name": event.name, "capacity": event.capacity}
        )
        db.session.add(audit_log)
        db.session.commit()
        
        # Notify all connected organizer dashboards of the new event
        from .. import socketio
        socketio.emit('event_created', {"id": event.id, "name": event.name})
        
        return jsonify({
            "id": event.id, "name": event.name, "date": event.date.isoformat(),
            "venue": event.venue, "capacity": event.capacity, "status": event.status.value
        }), 201
    except Exception as e:
        db.session.rollback()
        print(f"Create event error: {e}")
        return jsonify({"error": str(e) or "Internal server error"}), 500

@events_bp.route('/<id>', methods=['GET'])
def get_event(id):
    try:
        e = Event.query.get(id)
        if not e:
            return jsonify({"error": "Event not found"}), 404
        return jsonify({
            "id": e.id, "name": e.name, "date": e.date.isoformat() if e.date else None,
            "venue": e.venue, "capacity": e.capacity, "registeredCount": e.registeredCount,
            "checkedInCount": e.checkedInCount, "description": e.description,
            "bannerImage": e.bannerImage, "status": e.status.value
        }), 200
    except Exception as e:
        return jsonify({"error": str(e) or "Internal server error"}), 500

# Additional routes (Register, Insights, Export) will be added next.
@events_bp.route('/<id>/checkins', methods=['GET'])
@require_auth
@require_role(['ORGANIZER'])
def get_recent_checkins(id):
    try:
        checkins = CheckIn.query.join(Registration).filter(
            Registration.eventId == id
        ).order_by(CheckIn.checkedInAt.desc()).limit(10).all()
        
        feed = []
        ist = pytz.timezone('Asia/Kolkata')
        import pytz as _pytz
        for c in checkins:
            dt_utc = c.checkedInAt.replace(tzinfo=_pytz.UTC) if c.checkedInAt.tzinfo is None else c.checkedInAt
            dt_ist = dt_utc.astimezone(ist)
            dt_iso = dt_ist.isoformat()
                
            feed.append({
                "userName": c.registration.user.name,
                "checkedInAt": dt_iso,
                "registrationId": c.registrationId
            })
            
        return jsonify(feed), 200
    except Exception as e:
        return jsonify({"error": str(e) or "Internal server error"}), 500

import threading
# from ..services.mailer import send_qr_confirmation_email
@events_bp.route('/<id>/register', methods=['POST'])
@require_auth
@require_role(['ATTENDEE'])
def register_event(id):
    try:
        user = get_current_user()
        user_id = user['userId']

        existing = Registration.query.filter_by(userId=user_id, eventId=id).first()
        if existing and existing.status in [RegistrationStatus.REGISTERED, RegistrationStatus.WAITLISTED]:
            return jsonify({"error": "You are already registered or waitlisted for this event."}), 409

        # Use row-level locking (SELECT ... FOR UPDATE) to strictly enforce capacity under concurrent load
        event = Event.query.with_for_update().get(id)
        if not event:
            return jsonify({"error": "Event not found"}), 404

        status = RegistrationStatus.REGISTERED
        if event.registeredCount >= event.capacity:
            status = RegistrationStatus.WAITLISTED
        else:
            event.registeredCount += 1

        if existing:
            existing.status = status
            reg = existing
        else:
            reg = Registration(userId=user_id, eventId=id, status=status)
            db.session.add(reg)

        db.session.commit()
        
        # Notify organizer dashboard of new registration in real-time
        from .. import socketio
        socketio.emit('new_registration', {
            "eventId": id,
            "registeredCount": event.registeredCount
        }, to=f"event:{id}:dashboard")
        
        return jsonify({
            "id": reg.id,
            "userId": reg.userId,
            "eventId": reg.eventId,
            "status": reg.status.value
        }), 201

    except Exception as e:
        db.session.rollback()
        print(f"Registration error: {e}")
        return jsonify({"error": str(e) or "Internal server error"}), 500

@events_bp.route('/<id>/insights', methods=['GET'])
@require_auth
@require_role(['ORGANIZER'])
def get_insights(id):
    try:
        event = Event.query.get(id)
        if not event:
            return jsonify({"error": "Event not found"}), 404

        total_regs = Registration.query.filter_by(eventId=id).count()
        waitlisted = Registration.query.filter_by(eventId=id, status=RegistrationStatus.WAITLISTED).count()
        cancelled = Registration.query.filter_by(eventId=id, status=RegistrationStatus.CANCELLED).count()

        checkins = db.session.query(CheckIn.checkedInAt).join(Registration).filter(Registration.eventId == id).all()
        
        peak_time = "N/A"
        if checkins:
            import pytz
            ist = pytz.timezone('Asia/Kolkata')
            buckets = {}
            for (dt,) in checkins:
                if not dt: continue
                if dt.tzinfo is None:
                    dt = pytz.UTC.localize(dt)
                local_dt = dt.astimezone(ist)
                
                minutes = (local_dt.minute // 10) * 10
                key = f"{local_dt.hour:02d}:{minutes:02d}"
                buckets[key] = buckets.get(key, 0) + 1
            if buckets:
                max_key = max(buckets, key=buckets.get)
                max_val = buckets[max_key]
                peak_time = f"{max_key} (with {max_val} check-ins in 10 mins)"

        stats = {
            "capacity": event.capacity,
            "totalRegistrations": total_regs,
            "registeredCount": event.registeredCount,
            "waitlistedCount": waitlisted,
            "checkedInCount": event.checkedInCount,
            "cancelledCount": cancelled,
            "peakCheckInTime": peak_time
        }

        try:
            insight = generate_insights(stats)
            return jsonify({"insight": insight, "stats": stats}), 200
        except Exception as aiError:
            print(f"AI Error: {aiError}")
            return jsonify({"error": "Insights unavailable right now.", "stats": stats}), 503

    except Exception as e:
        print(f"Insights endpoint error: {e}")
        return jsonify({"error": str(e) or "Internal server error"}), 500

@events_bp.route('/<id>/export', methods=['GET'])
@require_auth
@require_role(['ORGANIZER'])
def export_csv(id):
    try:
        organizer = get_current_user()
        registrations = Registration.query.filter_by(eventId=id).all()
        
        audit_log = AuditLog(
            actorId=organizer['userId'],
            action='EXPORT_CSV',
            entity='Event',
            entityId=id,
            metadata_={"rowCount": len(registrations)}
        )
        db.session.add(audit_log)
        db.session.commit()

        csv = "Name,Email,Status,CheckedInAt,CheckInSource\n"
        for reg in registrations:
            user = reg.user
            checkin = reg.checkIn
            
            user_name = user.name.replace('"', '""')
            name = f'"{user_name}"'
            email = f'"{user.email}"'
            status = reg.status.value
            checked_in_at = f'"{checkin.checkedInAt.isoformat()}"' if checkin else '""'
            source = f'"{checkin.source.value}"' if checkin else '""'
            
            csv += f"{name},{email},{status},{checked_in_at},{source}\n"

        return Response(
            csv,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment; filename=event-{id}-export.csv"}
        )
    except Exception as e:
        print(f"Export error: {e}")
        return jsonify({"error": "Internal server error"}), 500

