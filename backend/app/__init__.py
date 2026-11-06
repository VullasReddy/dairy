import logging
import os
from datetime import timedelta

import click
from flask import Flask, jsonify, send_from_directory, request, Response
from werkzeug.exceptions import HTTPException

from config import Config, check_production
from .extensions import db, jwt, cors, migrate, limiter
from .utils import ApiError


def create_app(config_object=Config):
    app = Flask(__name__)
    app.config.from_object(config_object)
    check_production(app.config)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db, render_as_batch=True)
    limiter.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
                  expose_headers=["Content-Disposition"])

    from .routes import auth, public, customer, admin, staff
    for bp in (auth.bp, public.bp, customer.bp, admin.bp, staff.bp, staff.hooks):
        app.register_blueprint(bp)

    @app.get("/api/health")
    def health():
        return jsonify({"ok": True, "service": "aditya-milk-dairy", "payments": app.config["PAYMENT_PROVIDER"]})

    @app.get("/uploads/<path:name>")
    def uploads(name):
        return send_from_directory(app.config["UPLOAD_FOLDER"], name)

    # ------------------------------------------------------------ website (built React app)
    dist = app.config.get("FRONTEND_DIST")

    @app.get("/sitemap.xml")
    def sitemap():
        from .models import Product, BlogPost
        base = request.host_url.rstrip("/")
        paths = ["/", "/products", "/subscriptions", "/about", "/quality", "/testimonials", "/blog", "/faq",
                 "/contact", "/policy/privacy", "/policy/terms", "/policy/refund"]
        paths += [f"/products/{p.slug}" for p in Product.query.filter_by(is_active=True)]
        paths += [f"/blog/{b.slug}" for b in BlogPost.query.filter_by(is_published=True)]
        xml = "".join(f"<url><loc>{base}{p}</loc></url>" for p in paths)
        return Response('<?xml version="1.0" encoding="UTF-8"?><urlset '
                        f'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{xml}</urlset>', mimetype="application/xml")

    @app.get("/robots.txt")
    def robots():
        base = request.host_url.rstrip("/")
        return Response(f"User-agent: *\nDisallow: /admin\nDisallow: /account\nDisallow: /staff\nDisallow: /api/\n"
                        f"Sitemap: {base}/sitemap.xml\n", mimetype="text/plain")

    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def spa(path):
        if path.startswith("api/") or not dist or not os.path.isdir(dist):
            return jsonify({"ok": False, "error": "Not found"}), 404
        full = os.path.join(dist, path)
        if path and os.path.isfile(full):
            resp = send_from_directory(dist, path)
            if path.startswith("assets/"):
                resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return resp
        return send_from_directory(dist, "index.html")  # client-side routes (/products, /admin, ...)

    @app.errorhandler(ApiError)
    def api_error(e):
        db.session.rollback()
        return jsonify({"ok": False, "error": e.message, "field": e.field}), e.status

    @app.errorhandler(429)
    def too_many(e):
        return jsonify({"ok": False, "error": "Too many attempts. Please wait a minute and try again."}), 429

    @app.errorhandler(HTTPException)
    def http_error(e):
        return jsonify({"ok": False, "error": e.description}), e.code

    @app.errorhandler(Exception)
    def server_error(e):
        db.session.rollback()
        app.logger.exception("Unhandled error")
        return jsonify({"ok": False, "error": "Something went wrong on our side. Please try again."}), 500

    @jwt.unauthorized_loader
    def no_token(msg):
        return jsonify({"ok": False, "error": "Please log in to continue."}), 401

    @jwt.invalid_token_loader
    @jwt.expired_token_loader
    def bad_token(*args):
        return jsonify({"ok": False, "error": "Your session has expired. Please log in again."}), 401

    # ------------------------------------------------------------ CLI
    @app.cli.command("init-db")
    def init_db():
        """Create all tables."""
        db.create_all()
        click.echo("Tables created.")

    @app.cli.command("seed")
    @click.option("--demo/--no-demo", default=True, help="Include demo customers, bookings and deliveries.")
    def seed_cmd(demo):
        """Create tables and load initial data."""
        from seed import seed
        seed(demo=demo)

    @app.cli.command("daily-job")
    def daily_job():
        """Run every morning (cron): completes expired plans, sends reminders, generates today's deliveries."""
        from .services.delivery import generate_for_date, housekeeping
        from .utils import today
        housekeeping()
        click.echo(generate_for_date(today()))
        click.echo(generate_for_date(today() + timedelta(days=1)))

    @app.cli.command("export-schema")
    @click.option("--dialect", default="mysql")
    def export_schema(dialect):
        """Print CREATE TABLE statements for MySQL."""
        from sqlalchemy.schema import CreateTable
        from sqlalchemy.dialects import mysql, sqlite
        d = mysql.dialect() if dialect == "mysql" else sqlite.dialect()
        for t in db.metadata.sorted_tables:
            click.echo(str(CreateTable(t).compile(dialect=d)).strip() + ";\n")

    with app.app_context():
        from . import models  # noqa: F401
        os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    return app
