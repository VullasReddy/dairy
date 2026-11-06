"""Business-timezone clock. Delivery days, cut-offs and "today" follow the dairy's local time
(BUSINESS_TZ, default Asia/Kolkata), not the server's UTC clock. Timestamps are stored in UTC."""
import os
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo(os.getenv("BUSINESS_TZ", "Asia/Kolkata"))


def now():
    return datetime.now(TZ)


def today():
    return now().date()


def local_date(utc_naive):
    """Convert a naive UTC datetime (as stored) to the business-local date."""
    return utc_naive.replace(tzinfo=timezone.utc).astimezone(TZ).date()


def local_day_start_utc(d):
    """UTC naive datetime for 00:00 local on date d (for querying stored UTC timestamps)."""
    return datetime(d.year, d.month, d.day, tzinfo=TZ).astimezone(timezone.utc).replace(tzinfo=None)
