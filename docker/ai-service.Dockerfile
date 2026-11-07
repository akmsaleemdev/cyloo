FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8100

WORKDIR /app
COPY apps/ai-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
 && adduser --disabled-password --gecos "" --uid 10001 app
COPY --chown=app:app apps/ai-service/app ./app

USER app
EXPOSE 8100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8100/health', timeout=3).read()" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
