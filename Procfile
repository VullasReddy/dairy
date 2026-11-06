web: cd backend && python seed.py --no-demo && gunicorn -w 2 --threads 4 -b 0.0.0.0:$PORT --timeout 60 run:app
