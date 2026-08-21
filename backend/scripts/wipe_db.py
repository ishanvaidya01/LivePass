from app import create_app
from app.models import db
from sqlalchemy import text

app = create_app()

with app.app_context():
    print("Connecting to database...")
    try:
        # TRUNCATE completely empties the tables and CASCADE handles all foreign key dependencies
        db.session.execute(text('TRUNCATE TABLE "User", "Event", "Registration", "CheckInToken", "CheckIn", "AuditLog" CASCADE;'))
        db.session.commit()
        print("Successfully deleted all data from the project database!")
    except Exception as e:
        db.session.rollback()
        print(f"Error wiping data: {e}")
