import os

from app import create_app

app = create_app()


def prepare_database():
    """Apply pending migrations and add any new delivery cities/areas (safe to run every start)."""
    from flask_migrate import upgrade
    from app.models import User
    with app.app_context():
        upgrade(directory=os.path.join(os.path.dirname(os.path.abspath(__file__)), "migrations"))
        if User.query.filter_by(role="admin").first():  # only once the database has been seeded
            from seed import ensure_locations
            added = ensure_locations()
            if added:
                print(f"Added {added} new delivery area(s).")


if __name__ == "__main__":
    prepare_database()
    app.run(host="0.0.0.0", port=5000, debug=app.config["DEV_MODE"])
