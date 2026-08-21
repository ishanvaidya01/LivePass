import uuid
from datetime import datetime
from enum import Enum
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

db = SQLAlchemy()


class Role(Enum):
    ORGANIZER = "ORGANIZER"
    ATTENDEE = "ATTENDEE"


class EventStatus(Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"


class RegistrationStatus(Enum):
    REGISTERED = "REGISTERED"
    CANCELLED = "CANCELLED"
    NO_SHOW = "NO_SHOW"
    WAITLISTED = "WAITLISTED"


class CheckInSource(Enum):
    ONLINE = "ONLINE"
    OFFLINE_SYNCED = "OFFLINE_SYNCED"
    MANUAL_OVERRIDE = "MANUAL_OVERRIDE"


class User(db.Model):
    __tablename__ = "User"
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = db.Column(db.String, unique=True, nullable=False)
    password = db.Column(db.String, nullable=False)
    role = db.Column(
        db.Enum(Role, name="Role", create_type=False),
        nullable=False,
        default=Role.ATTENDEE,
    )
    name = db.Column(db.String, nullable=False)
    createdAt = db.Column(db.DateTime(timezone=True), default=func.now())
    updatedAt = db.Column(
        db.DateTime(timezone=True), default=func.now(), onupdate=func.now()
    )

    registrations = db.relationship("Registration", backref="user", lazy=True)
    auditLogs = db.relationship("AuditLog", backref="actor", lazy=True)


class Event(db.Model):
    __tablename__ = "Event"
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String, nullable=False)
    date = db.Column(db.DateTime(timezone=True), nullable=False)
    venue = db.Column(db.String, nullable=True)
    capacity = db.Column(db.Integer, nullable=False)
    registeredCount = db.Column(db.Integer, nullable=False, default=0)
    checkedInCount = db.Column(db.Integer, nullable=False, default=0)
    description = db.Column(db.String, nullable=True)
    bannerImage = db.Column(db.String, nullable=True)
    status = db.Column(
        db.Enum(EventStatus, name="EventStatus", create_type=False),
        nullable=False,
        default=EventStatus.DRAFT,
    )
    createdAt = db.Column(db.DateTime(timezone=True), default=func.now())
    updatedAt = db.Column(
        db.DateTime(timezone=True), default=func.now(), onupdate=func.now()
    )

    registrations = db.relationship("Registration", backref="event", lazy=True)


class Registration(db.Model):
    __tablename__ = "Registration"
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = db.Column(db.String, db.ForeignKey("User.id"), nullable=False)
    eventId = db.Column(db.String, db.ForeignKey("Event.id"), nullable=False)
    status = db.Column(
        db.Enum(RegistrationStatus, name="RegistrationStatus", create_type=False),
        nullable=False,
        default=RegistrationStatus.REGISTERED,
    )
    createdAt = db.Column(db.DateTime(timezone=True), default=func.now())
    updatedAt = db.Column(
        db.DateTime(timezone=True), default=func.now(), onupdate=func.now()
    )

    checkIn = db.relationship(
        "CheckIn", backref="registration", uselist=False, lazy=True
    )
    checkInToken = db.relationship(
        "CheckInToken", backref="registration", uselist=False, lazy=True
    )

    __table_args__ = (
        db.UniqueConstraint(
            "userId", "eventId", name="Registration_userId_eventId_key"
        ),
    )


class CheckInToken(db.Model):
    __tablename__ = "CheckInToken"
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    registrationId = db.Column(
        db.String, db.ForeignKey("Registration.id"), nullable=False, unique=True
    )
    token = db.Column(db.String, nullable=False, unique=True)
    expiresAt = db.Column(db.DateTime(timezone=True), nullable=False)
    usedAt = db.Column(db.DateTime(timezone=True), nullable=True)
    rotationSeed = db.Column(db.String, nullable=True)
    updatedAt = db.Column(
        db.DateTime(timezone=True), default=func.now(), onupdate=func.now()
    )


class CheckIn(db.Model):
    __tablename__ = "CheckIn"
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    registrationId = db.Column(
        db.String, db.ForeignKey("Registration.id"), nullable=False, unique=True
    )
    stationId = db.Column(db.String, nullable=True)
    source = db.Column(
        db.Enum(CheckInSource, name="CheckInSource", create_type=False),
        nullable=False,
        default=CheckInSource.ONLINE,
    )
    checkedInAt = db.Column(db.DateTime(timezone=True), default=func.now())
    idempotencyKey = db.Column(db.String, nullable=True, unique=True)


class AuditLog(db.Model):
    __tablename__ = "AuditLog"
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    actorId = db.Column(db.String, db.ForeignKey("User.id"), nullable=True)
    action = db.Column(db.String, nullable=False)
    entity = db.Column(db.String, nullable=False)
    entityId = db.Column(db.String, nullable=False)
    metadata_ = db.Column("metadata", JSONB, nullable=True)
    timestamp = db.Column(db.DateTime(timezone=True), default=func.now())
