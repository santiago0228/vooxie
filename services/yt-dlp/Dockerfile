FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

# ffmpeg no es imprescindible para resolver URLs de streaming, pero yt-dlp lo
# usa para algunos formatos; ca-certificates es necesario para HTTPS.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY requirements.txt .
# yt-dlp cambia con frecuencia por cambios en la fuente: reconstruye la imagen
# periódicamente (o ejecuta `pip install -U yt-dlp`) para mantenerlo al día.
RUN pip install -r requirements.txt

COPY app ./app

RUN useradd --create-home --uid 10001 runner
USER runner

ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import os,urllib.request;urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8080\")}/healthz',timeout=3)" || exit 1

CMD ["python", "-m", "app.server"]
